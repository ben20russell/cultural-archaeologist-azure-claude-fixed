import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const CONTAINER_NAME = 'archeologist-personas';

function getBlobServiceClient(): BlobServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING environment variable.');
  }

  try {
    return BlobServiceClient.fromConnectionString(connectionString);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Azure client init error';
    throw new Error(`Failed to initialize BlobServiceClient: ${message}`);
  }
}

async function getOrCreateContainer(client: BlobServiceClient): Promise<ContainerClient> {
  const containerClient = client.getContainerClient(CONTAINER_NAME);

  try {
    await containerClient.createIfNotExists();
    return containerClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown container error';
    throw new Error(`Failed to access/create container "${CONTAINER_NAME}": ${message}`);
  }
}

function sanitizeBlobName(fileName: string): string {
  const trimmed = (fileName || '').trim();
  const fallback = `persona-${Date.now()}.bin`;
  if (!trimmed) return fallback;

  return trimmed
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._/-]/g, '_') || fallback;
}

/**
 * Uploads an image buffer to Azure Blob Storage and returns its absolute URL.
 */
export async function uploadImageToAzure(
  imageBuffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('imageBuffer must be a non-empty Buffer.');
  }

  const blobName = sanitizeBlobName(fileName);
  const safeContentType = (contentType || '').trim() || 'application/octet-stream';

  try {
    const blobServiceClient = getBlobServiceClient();
    const containerClient = await getOrCreateContainer(blobServiceClient);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(imageBuffer, {
      blobHTTPHeaders: {
        blobContentType: safeContentType,
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return blockBlobClient.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Azure upload error';
    throw new Error(`Failed to upload image to Azure Blob Storage: ${message}`);
  }
}
