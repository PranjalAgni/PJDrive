import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { File as DriveFile, Folder } from '@pjdrive/shared';
import { ShareModal } from './ShareModal';
import { MoveModal } from './MoveModal';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface Props {
  refresh: number;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  onRefresh: () => void;
  renderBreadcrumb: (breadcrumb: BreadcrumbItem[]) => React.ReactNode;
}

export function FileList({ refresh, currentFolderId, onNavigate, onRefresh, renderBreadcrumb }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);
  const [movingItem, setMovingItem] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    const folderId = currentFolderId ?? 'root';
    apiClient.get(`/folders/${folderId}`)
      .then((r) => {
        setFolders(r.data.subfolders || []);
        setFiles(r.data.files || []);
        setBreadcrumb(r.data.breadcrumb || []);
        setError('');
      })
      .catch(() => setError('Failed to load folder contents'))
      .finally(() => setLoading(false));
  }, [refresh, currentFolderId]);

  async function handleDownload(file: DriveFile) {
    try {
      const { data } = await apiClient.get(`/files/${file.id}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      alert(`Failed to download ${file.name}`);
    }
  }

  async function handleDeleteFile(file: DriveFile) {
    try {
      await apiClient.delete(`/files/${file.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      alert(`Failed to trash ${file.name}`);
    }
  }

  async function handleRenameFolder(folder: Folder) {
    const newName = window.prompt('Rename folder:', folder.name);
    if (!newName || !newName.trim() || newName === folder.name) return;
    try {
      await apiClient.patch(`/folders/${folder.id}`, { name: newName.trim() });
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error || `Failed to rename ${folder.name}`);
    }
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!confirm(`Move folder "${folder.name}" to Trash?`)) return;
    try {
      await apiClient.delete(`/folders/${folder.id}`);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error || `Failed to trash ${folder.name}`);
    }
  }

  if (loading) return <p>Loading...</p>;

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <>
      {renderBreadcrumb(breadcrumb)}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {isEmpty && !error ? (
        <p>No folders or files yet.</p>
      ) : (
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
                    onClick={() => onNavigate(folder.id)}
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
                <td>
                  <button onClick={() => handleRenameFolder(folder)} style={{ marginRight: 8 }}>Rename</button>
                  <button onClick={() => setMovingItem({ type: 'folder', id: folder.id, name: folder.name })} style={{ marginRight: 8 }}>Move</button>
                  <button onClick={() => handleDeleteFolder(folder)}>Trash</button>
                </td>
              </tr>
            ))}
            {files.map((f) => (
              <tr key={`file-${f.id}`} style={{ borderTop: '1px solid #eee' }}>
                <td>{f.name}</td>
                <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                <td>{new Date(f.created_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => setSharingFile(f)} style={{ marginRight: 8 }}>Share</button>
                  <button onClick={() => handleDownload(f)} style={{ marginRight: 8 }}>Download</button>
                  <button onClick={() => setMovingItem({ type: 'file', id: f.id, name: f.name })} style={{ marginRight: 8 }}>Move</button>
                  <button onClick={() => handleDeleteFile(f)}>Trash</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sharingFile && (
        <ShareModal
          fileId={sharingFile.id}
          fileName={sharingFile.name}
          onClose={() => setSharingFile(null)}
        />
      )}
      {movingItem && (
        <MoveModal
          targetType={movingItem.type}
          targetId={movingItem.id}
          targetName={movingItem.name}
          currentFolderId={currentFolderId}
          excludeFolderId={movingItem.type === 'folder' ? movingItem.id : undefined}
          onClose={() => setMovingItem(null)}
          onMoved={onRefresh}
        />
      )}
    </>
  );
}
