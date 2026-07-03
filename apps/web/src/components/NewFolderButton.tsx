import { useState } from 'react';
import { apiClient } from '../api/client';

interface Props {
  currentFolderId: string | null;
  onCreated: () => void;
}

export function NewFolderButton({ currentFolderId, onCreated }: Props) {
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    const name = window.prompt('Folder name:');
    if (!name || !name.trim()) return;

    setCreating(true);
    try {
      await apiClient.post('/folders', {
        name: name.trim(),
        parentId: currentFolderId,
      });
      onCreated();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setCreating(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={creating} style={{ marginRight: 8 }}>
      {creating ? 'Creating...' : 'New Folder'}
    </button>
  );
}
