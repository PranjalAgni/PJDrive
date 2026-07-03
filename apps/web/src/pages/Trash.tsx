import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

interface TrashedFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  folder_id: string | null;
  trashed_at: string;
  created_at: string;
}

interface TrashedFolder {
  id: string;
  parent_id: string | null;
  name: string;
  trashed_at: string;
  created_at: string;
}

export function Trash() {
  const [files, setFiles] = useState<TrashedFile[]>([]);
  const [folders, setFolders] = useState<TrashedFolder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function loadTrash() {
    setLoading(true);
    apiClient.get('/trash')
      .then((r) => {
        setFiles(r.data.files || []);
        setFolders(r.data.folders || []);
        setError('');
      })
      .catch(() => setError('Failed to load trash'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTrash();
  }, []);

  async function handleRestore(type: 'files' | 'folders', id: string, name: string) {
    try {
      await apiClient.post(`/trash/${type}/${id}/restore`);
      loadTrash();
    } catch {
      alert(`Failed to restore ${name}`);
    }
  }

  async function handleDeletePermanently(type: 'files' | 'folders', id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/trash/${type}/${id}`);
      loadTrash();
    } catch {
      alert(`Failed to delete ${name}`);
    }
  }

  async function handleEmptyTrash() {
    if (!confirm('Empty trash? All items will be permanently deleted. This cannot be undone.')) return;
    try {
      await apiClient.delete('/trash');
      loadTrash();
    } catch {
      alert('Failed to empty trash');
    }
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Trash</h2>
      <div style={{ marginBottom: 16 }}>
        <Link to="/">Back to Dashboard</Link>
      </div>
      {!isEmpty && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleEmptyTrash}>Empty Trash</button>
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : isEmpty && !error ? (
        <p>Trash is empty.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Size</th>
              <th style={{ textAlign: 'left' }}>Trashed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder) => (
              <tr key={`folder-${folder.id}`} style={{ borderTop: '1px solid #eee' }}>
                <td>📁 {folder.name}</td>
                <td>—</td>
                <td>{new Date(folder.trashed_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => handleRestore('folders', folder.id, folder.name)} style={{ marginRight: 8 }}>Restore</button>
                  <button onClick={() => handleDeletePermanently('folders', folder.id, folder.name)}>Delete forever</button>
                </td>
              </tr>
            ))}
            {files.map((f) => (
              <tr key={`file-${f.id}`} style={{ borderTop: '1px solid #eee' }}>
                <td>{f.name}</td>
                <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                <td>{new Date(f.trashed_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => handleRestore('files', f.id, f.name)} style={{ marginRight: 8 }}>Restore</button>
                  <button onClick={() => handleDeletePermanently('files', f.id, f.name)}>Delete forever</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
