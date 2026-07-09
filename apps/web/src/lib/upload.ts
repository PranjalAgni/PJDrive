import axios from 'axios';
import { apiClient } from '../api/client';
import { splitIntoChunks, computeChecksum } from './chunker';

const PARALLEL_CHUNK_UPLOADS = 3;

export interface UploadProgress {
  chunksCompleted: number;
  totalChunks: number;
}

export async function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: (p: UploadProgress) => void
): Promise<{ id: string; name: string }> {
  const checksum = await computeChecksum(file);
  const chunks = splitIntoChunks(file);
  const totalChunks = chunks.length;

  if (totalChunks === 0) {
    throw new Error('Cannot upload an empty file');
  }

  const { data: initData } = await apiClient.post('/upload/init', {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    totalChunks,
    checksum,
    folderId,
  });

  const { uploadId, chunkUrls } = initData as { uploadId: string; chunkUrls: string[] };

  const statusRes = await apiClient.get(`/upload/status/${uploadId}`);
  // Status now returns uploadedChunks as { partNumber, eTag }[] objects,
  // sourced directly from S3 ListParts (authoritative).
  const alreadyUploadedParts: { partNumber: number; eTag: string }[] =
    (statusRes.data.uploadedChunks || []) as { partNumber: number; eTag: string }[];

  const alreadyUploadedNumbers = alreadyUploadedParts.map((p) => p.partNumber);

  const parts: { partNumber: number; eTag: string }[] = [...alreadyUploadedParts];

  for (let i = 0; i < totalChunks; i += PARALLEL_CHUNK_UPLOADS) {
    const batch = chunks.slice(i, i + PARALLEL_CHUNK_UPLOADS);
    const batchResults = await Promise.all(
      batch.map(async (chunk, j) => {
        const partNumber = i + j + 1;
        if (alreadyUploadedNumbers.includes(partNumber)) return null;

        const res = await axios.put(chunkUrls[i + j], chunk, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        const eTag = res.headers.etag;
        if (!eTag) throw new Error(`Missing ETag header for chunk ${partNumber}. Check S3 CORS ExposeHeaders config.`);
        return { partNumber, eTag };
      })
    );

    batchResults.forEach((r) => { if (r) parts.push(r); });
    onProgress({ chunksCompleted: Math.min(i + PARALLEL_CHUNK_UPLOADS, totalChunks), totalChunks });
  }

  parts.sort((a, b) => a.partNumber - b.partNumber);

  const { data: completeData } = await apiClient.post('/upload/complete', { uploadId, parts });
  return completeData.file;
}
