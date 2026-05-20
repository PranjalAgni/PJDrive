import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { File as DriveFile } from '@pjdrive/shared';

export function SharedWithMe() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/files/shared-with-me')
      .then((r) => setFiles(r.data))
      .catch(() => setError('Failed to load shared files'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(file: DriveFile) {
    try {
      const { data } = await apiClient.get(`/files/${file.id}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      alert(`Failed to download ${file.name}`);
    }
  }

  return (
    <div>
      <h2>Shared with me</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? <p>Loading...</p> : files.length === 0 && !error ? (
        <p>No files have been shared with you yet.</p>
      ) : (
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
                  <button onClick={() => handleDownload(f)}>Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
