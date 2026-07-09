import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  type ListPartsCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

export const BUCKET = process.env.S3_BUCKET || 'pjdrive';

export async function initiateMultipart(key: string): Promise<string> {
  const cmd = new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key });
  const res = await s3.send(cmd);
  return res.UploadId!;
}

export async function presignChunkUpload(
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  await s3.send(cmd);
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  const cmd = new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId });
  await s3.send(cmd);
}

export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function listParts(
  key: string,
  uploadId: string,
): Promise<{ PartNumber: number; ETag: string }[]> {
  // S3 caps ListParts at 1000 per page; a 50GB file at 10MB chunks is ~5000 parts
  // so we must paginate via PartNumberMarker / NextPartNumberMarker.
  const parts: { PartNumber: number; ETag: string }[] = [];
  let partNumberMarker: string | undefined = undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res: ListPartsCommandOutput = await s3.send(
      new ListPartsCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      }),
    );
    for (const p of res.Parts ?? []) {
      if (p.PartNumber !== undefined && p.ETag !== undefined) {
        // Keep the ETag exactly as S3 returns it (quotes included) so
        // CompleteMultipartUpload matches.
        parts.push({ PartNumber: p.PartNumber, ETag: p.ETag });
      }
    }
    if (!res.IsTruncated) break;
    partNumberMarker = res.NextPartNumberMarker;
  }
  return parts;
}
