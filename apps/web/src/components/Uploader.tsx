import { useRef, useState } from 'react';
import { uploadFile, UploadProgress } from '../lib/upload';

interface Props {
  currentFolderId: string | null;
  onUploaded: () => void;
}

export function Uploader({ currentFolderId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setProgress({ chunksCompleted: 0, totalChunks: 1 });

    try {
      await uploadFile(file, currentFolderId, setProgress);
      setProgress(null);
      onUploaded();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setProgress(null);
    } finally {
      e.target.value = '';
    }
  }

  const pct = progress
    ? Math.round((progress.chunksCompleted / progress.totalChunks) * 100)
    : 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={handleChange} />
      <button onClick={() => inputRef.current?.click()} disabled={!!progress}>
        {progress ? `Uploading… ${pct}%` : 'Upload File'}
      </button>
      {progress && (
        <div style={{ marginTop: 8, background: '#eee', borderRadius: 4, height: 8 }}>
          <div style={{ width: `${pct}%`, background: '#4caf50', height: '100%', borderRadius: 4 }} />
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
