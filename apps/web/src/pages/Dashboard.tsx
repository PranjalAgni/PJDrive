import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { FileList } from '../components/FileList';
import { Uploader } from '../components/Uploader';
import { Breadcrumb } from '../components/Breadcrumb';
import { NewFolderButton } from '../components/NewFolderButton';

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const { email, clearAuth } = useAuthStore();

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>PJDrive</h1>
        <div>
          <Link to="/shared" style={{ marginRight: 16 }}>Shared with me</Link>
          <span style={{ marginRight: 16 }}>{email}</span>
          <button onClick={clearAuth}>Logout</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <NewFolderButton currentFolderId={currentFolderId} onCreated={handleRefresh} />
        <Uploader currentFolderId={currentFolderId} onUploaded={handleRefresh} />
      </div>
      <FileList
        refresh={refreshKey}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        onRefresh={handleRefresh}
        renderBreadcrumb={(breadcrumb) => (
          <Breadcrumb breadcrumb={breadcrumb} onNavigate={setCurrentFolderId} />
        )}
      />
    </div>
  );
}
