import CryptoJS from 'crypto-js';

export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function splitIntoChunks(file: File): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

export async function computeChecksum(file: File): Promise<string> {
  const hasher = CryptoJS.algo.SHA256.create();
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(buffer);
    hasher.update(wordArray);
    offset += CHUNK_SIZE;
  }

  return hasher.finalize().toString();
}
