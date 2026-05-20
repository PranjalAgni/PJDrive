import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { File as DriveFile } from '@pjdrive/shared';
import { ShareModal } from './ShareModal';

interface Props {
  refresh: number;
}

export function FileList({ refresh }: Props) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/files')
      .then((r) => { setFiles(r.data); setError(''); })
      .catch(() => setError('Failed to load files'))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleDownload(file: DriveFile) {
    try {
      const { data } = await apiClient.get(`/files/${file.id}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      alert(`Failed to download ${file.name}`);
    }
  }

  async function handleDelete(file: DriveFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    try {
      await apiClient.delete(`/files/${file.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      alert(`Failed to delete ${file.name}`);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (files.length === 0 && !error) return (
    <>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p>No files yet. Upload one!</p>
    </>
  );

  return (
    <>
    {error && <p style={{ color: 'red' }}>{error}</p>}
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Name</th>
          <th style={{ textAlign: 'left' }}>Size</th>
          <th style={{ textAlign: 'left' }}>Uploaded</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.id} style={{ borderTop: '1px solid #eee' }}>
            <td>{f.name}</td>
            <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
            <td>{new Date(f.created_at).toLocaleDateString()}</td>
            <td>
              <button onClick={() => setSharingFile(f)} style={{ marginRight: 8 }}>Share</button>
              <button onClick={() => handleDownload(f)} style={{ marginRight: 8 }}>Download</button>
              <button onClick={() => handleDelete(f)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {sharingFile && (
      <ShareModal
        fileId={sharingFile.id}
        fileName={sharingFile.name}
        onClose={() => setSharingFile(null)}
      />
    )}
    </>
  );
}
