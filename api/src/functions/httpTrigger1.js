const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

// レート制限（メモリキャッシュ）
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分
const RATE_LIMIT_MAX_REQUESTS = 10; // 1分あたり10リクエスト

function checkRateLimit(ipAddress) {
    const now = Date.now();
    const userRequests = rateLimitMap.get(ipAddress) || [];
    
    // 古いエントリを削除（メモリリーク防止）
    const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return {
            allowed: false,
            remaining: 0,
            resetTime: Math.min(...recentRequests) + RATE_LIMIT_WINDOW
        };
    }
    
    recentRequests.push(now);
    rateLimitMap.set(ipAddress, recentRequests);
    
    // 定期的にマップをクリーンアップ（10分以上古いエントリを削除）
    if (Math.random() < 0.01) { // 1%の確率でクリーンアップ
        const tenMinutesAgo = now - 600000;
        for (const [ip, requests] of rateLimitMap.entries()) {
            if (requests.every(time => time < tenMinutesAgo)) {
                rateLimitMap.delete(ip);
            }
        }
    }
    
    return {
        allowed: true,
        remaining: RATE_LIMIT_MAX_REQUESTS - recentRequests.length,
        resetTime: recentRequests[0] + RATE_LIMIT_WINDOW
    };
}

// ファイル名のサニタイゼーション
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return null;
    }

    // パストラバーサル攻撃の防止
    const name = filename.replace(/[\/\\:*?"<>|]/g, '_');
    
    // 相対パスの防止
    if (name.includes('..') || name.startsWith('.')) {
        return null;
    }

    // 長さ制限（255文字）
    if (name.length > 255) {
        return null;
    }

    // 空白のみのファイル名を拒否
    if (name.trim().length === 0) {
        return null;
    }

    return name.trim();
}

app.http('generateUploadUrl', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Generate upload URL request received');

        // レート制限チェック
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                        request.headers.get('x-real-ip') || 
                        'unknown';
        
        const rateLimit = checkRateLimit(clientIp);
        
        if (!rateLimit.allowed) {
            const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
            return {
                status: 429,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Retry-After': retryAfter.toString(),
                    'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
                },
                jsonBody: { 
                    error: 'Rate limit exceeded',
                    retryAfter: retryAfter,
                    message: `1分あたり${RATE_LIMIT_MAX_REQUESTS}リクエストまでです。${retryAfter}秒後に再試行してください。`
                }
            };
        }

        // Handle preflight OPTIONS request
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
                    'X-RateLimit-Remaining': rateLimit.remaining.toString()
                }
            };
        }

        try {
            const body = await request.json();
            const { filename, expirationDays, contentType, fileSize } = body;

            // 1. 必須パラメータのチェック
            if (!filename || !expirationDays) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'filename and expirationDays are required' }
                };
            }

            // 2. ファイルサイズ制限（5GB）
            const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
            if (fileSize && fileSize > MAX_FILE_SIZE) {
                return {
                    status: 413,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'File size exceeds 5GB limit' }
                };
            }

            // 3. 有効期限の検証（1-30日）
            const days = parseInt(expirationDays);
            if (isNaN(days) || days < 1 || days > 30) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'expirationDays must be between 1 and 30' }
                };
            }

            // 4. ファイル名のサニタイゼーション
            const sanitizedFilename = sanitizeFilename(filename);
            if (!sanitizedFilename) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'Invalid filename' }
                };
            }

            // 5. 禁止されたファイルタイプのチェック
            const prohibitedExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', '.jar', '.msi'];
            const fileExt = sanitizedFilename.toLowerCase().substring(sanitizedFilename.lastIndexOf('.'));
            if (prohibitedExtensions.includes(fileExt)) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'File type not allowed for security reasons' }
                };
            }

            const accountName = process.env.STORAGE_ACCOUNT_NAME;
            const accountKey = process.env.STORAGE_ACCOUNT_KEY;
            const containerName = process.env.STORAGE_CONTAINER_NAME || 'upload';

            if (!accountName || !accountKey) {
                return {
                    status: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'Storage account configuration missing' }
                };
            }

            const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
            const blobServiceClient = new BlobServiceClient(
                `https://${accountName}.blob.core.windows.net`,
                sharedKeyCredential
            );

            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blobName = `${Date.now()}_${sanitizedFilename}`;
            const blobClient = containerClient.getBlobClient(blobName);

            // SAS Token生成（アップロード用 - 1時間有効）
            const uploadSasOptions = {
                containerName: containerName,
                blobName: blobName,
                permissions: BlobSASPermissions.parse('w'), // Write permission
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + 3600 * 1000)
            };

            const uploadSasToken = generateBlobSASQueryParameters(uploadSasOptions, sharedKeyCredential).toString();
            const uploadUrl = `${blobClient.url}?${uploadSasToken}`;

            // ダウンロード用SAS Token（指定期間有効）
            const downloadSasOptions = {
                containerName: containerName,
                blobName: blobName,
                permissions: BlobSASPermissions.parse('r'), // Read permission
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + expirationDays * 24 * 3600 * 1000)
            };

            const downloadSasToken = generateBlobSASQueryParameters(downloadSasOptions, sharedKeyCredential).toString();
            const downloadUrl = `${blobClient.url}?${downloadSasToken}`;

            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
                    'X-RateLimit-Remaining': (rateLimit.remaining - 1).toString(),
                    'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY'
                },
                jsonBody: {
                    uploadUrl: uploadUrl,
                    downloadUrl: downloadUrl,
                    blobName: blobName,
                    expiresOn: downloadSasOptions.expiresOn.toISOString()
                }
            };
        } catch (error) {
            context.log.error('Error generating upload URL:', error);
            return {
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                },
                jsonBody: { error: 'Failed to generate upload URL', details: error.message }
            };
        }
    }
});
