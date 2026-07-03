import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { Folder } from '@pjdrive/shared';

interface Props {
  targetType: 'file' | 'folder';
  targetId: string;
  targetName: string;
  currentFolderId: string | null;
  excludeFolderId?: string;
  onClose: () => void;
  onMoved: () => void;
}

export function MoveModal({ targetType, targetId, targetName, currentFolderId, excludeFolderId, onClose, onMoved }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(currentFolderId || 'root');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/folders')
      .then((r) => {
        let allFolders = r.data.subfolders as Folder[];
        // Filter out the folder being moved (prevent moving into itself)
        if (excludeFolderId) {
          allFolders = allFolders.filter((f) => f.id !== excludeFolderId);
        }
        setFolders(allFolders);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load folders');
        setLoading(false);
      });
  }, [excludeFolderId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleMove() {
    setError('');
    try {
      const targetFolder = selectedFolderId === 'root' ? null : selectedFolderId;
      if (targetType === 'file') {
        await apiClient.patch(`/files/${targetId}`, { folderId: targetFolder });
      } else {
        await apiClient.patch(`/folders/${targetId}`, { parentId: targetFolder });
      }
      onMoved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Move failed');
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 24, width: 420, maxWidth: '90vw',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
        <h3 id="move-modal-title">Move "{targetName}"</h3>

        {loading ? (
          <p>Loading folders...</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="folder-select">Move to:</label>
              <select
                id="folder-select"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                style={{ width: '100%', marginTop: 4, padding: 4 }}
              >
                <option value="root">My Drive (root)</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose}>Cancel</button>
              <button onClick={handleMove}>Move</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
