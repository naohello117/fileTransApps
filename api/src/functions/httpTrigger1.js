const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('generateUploadUrl', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Generate upload URL request received');

        // Handle preflight OPTIONS request
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            };
        }

        try {
            const body = await request.json();
            const { filename, expirationDays, contentType } = body;

            if (!filename || !expirationDays) {
                return {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    jsonBody: { error: 'filename and expirationDays are required' }
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
            const blobName = `${Date.now()}_${filename}`;
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
                    'Access-Control-Allow-Headers': 'Content-Type'
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
