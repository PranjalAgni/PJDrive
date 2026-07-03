import { apiClient } from '../api/client';

interface SearchFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  folder_id: string | null;
  created_at: string;
  rank?: number;
}

interface SearchFolder {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  rank?: number;
}

interface Props {
  files: SearchFile[];
  folders: SearchFolder[];
  onOpenFolder: (id: string) => void;
  onRefresh: () => void;
}

export function SearchResults({ files, folders, onOpenFolder, onRefresh }: Props) {
  async function handleDownload(file: SearchFile) {
    try {
      const { data } = await apiClient.get(`/files/${file.id}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      alert(`Failed to download ${file.name}`);
    }
  }

  async function handleTrash(file: SearchFile) {
    try {
      await apiClient.delete(`/files/${file.id}`);
      onRefresh();
    } catch {
      alert(`Failed to trash ${file.name}`);
    }
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  if (isEmpty) {
    return <p>No results.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Name</th>
          <th style={{ textAlign: 'left' }}>Size</th>
          <th style={{ textAlign: 'left' }}>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {folders.map((folder) => (
          <tr key={`folder-${folder.id}`} style={{ borderTop: '1px solid #eee' }}>
            <td>
              <button
                onClick={() => onOpenFolder(folder.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1976d2',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  textAlign: 'left'
                }}
              >
                📁 {folder.name}
              </button>
            </td>
            <td>—</td>
            <td>{new Date(folder.created_at).toLocaleDateString()}</td>
            <td></td>
          </tr>
        ))}
        {files.map((f) => (
          <tr key={`file-${f.id}`} style={{ borderTop: '1px solid #eee' }}>
            <td>{f.name}</td>
            <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
            <td>{new Date(f.created_at).toLocaleDateString()}</td>
            <td>
              <button onClick={() => handleDownload(f)} style={{ marginRight: 8 }}>Download</button>
              <button onClick={() => handleTrash(f)}>Trash</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
