const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('generateDownloadUrl', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Generate download URL request received');

        // Handle preflight OPTIONS request
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            };
        }

        try {
            const blobName = request.query.get('blobName');

            if (!blobName) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'blobName is required' }
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
            const blobClient = containerClient.getBlobClient(blobName);

            // ファイル存在確認
            const exists = await blobClient.exists();
            if (!exists) {
                return {
                    status: 404,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'File not found' }
                };
            }

            // 新しいダウンロード用SAS Token生成（1時間有効）
            const sasOptions = {
                containerName: containerName,
                blobName: blobName,
                permissions: BlobSASPermissions.parse('r'),
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + 3600 * 1000)
            };

            const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
            const downloadUrl = `${blobClient.url}?${sasToken}`;

            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                jsonBody: {
                    downloadUrl: downloadUrl
                }
            };
        } catch (error) {
            context.log.error('Error generating download URL:', error);
            return {
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                },
                jsonBody: { error: 'Failed to generate download URL', details: error.message }
            };
        }
    }
});
