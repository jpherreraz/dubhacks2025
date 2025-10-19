import { uploadData, getUrl } from 'aws-amplify/storage';

export interface FileUploadResult {
  url: string;
  path: string;
  fileName: string;
  fileType: string;
}

/**
 * Uploads a file to S3 and returns the URL with metadata
 */
export async function uploadFile(
  fileUri: string,
  fileName?: string,
  fileType?: string
): Promise<FileUploadResult> {
  try {
    // Fetch the file as a blob
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Determine file type and extension
    const mimeType = fileType || blob.type || 'application/octet-stream';
    const extension = getExtensionFromMimeType(mimeType);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const baseName = fileName || `file-${timestamp}`;
    const safeFileName = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Path = `files/${timestamp}-${randomStr}-${safeFileName}`;

    // Upload to S3
    const result = await uploadData({
      path: s3Path,
      data: blob,
      options: {
        contentType: mimeType,
      },
    }).result;

    console.log('File uploaded successfully:', result);

    // Get the URL
    const urlResult = await getUrl({
      path: s3Path,
    });

    return {
      url: urlResult.url.toString(),
      path: s3Path,
      fileName: baseName,
      fileType: mimeType,
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload file');
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
  };
  return mimeMap[mimeType] || '';
}

export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isAudioFile(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

/**
 * Gets a fresh presigned URL for a file path
 */
export async function getFileUrl(filePath: string): Promise<string> {
  try {
    const urlResult = await getUrl({
      path: filePath,
    });
    return urlResult.url.toString();
  } catch (error) {
    console.error('Error getting file URL:', error);
    throw new Error('Failed to get file URL');
  }
}
