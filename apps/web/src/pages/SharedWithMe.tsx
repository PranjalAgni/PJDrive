import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

interface SharedFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  role: 'editor' | 'viewer';
  owner_email: string;
}

export function SharedWithMe() {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/files/shared-with-me')
      .then((r) => setFiles(r.data))
      .catch(() => setError('Failed to load shared files'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(file: SharedFile) {
    try {
      const { data } = await apiClient.get(`/files/${file.id}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      alert(`Failed to download ${file.name}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Shared with me</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : files.length === 0 && !error ? (
        <p>No files have been shared with you yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Owner</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Size</th>
              <th style={{ textAlign: 'left' }}>Download</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{f.name}</td>
                <td>{f.owner_email}</td>
                <td>{f.role}</td>
                <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
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
