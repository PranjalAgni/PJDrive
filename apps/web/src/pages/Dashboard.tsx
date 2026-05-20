import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { FileList } from '../components/FileList';
import { Uploader } from '../components/Uploader';

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { email, clearAuth } = useAuthStore();

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
      <Uploader onUploaded={() => setRefreshKey((k) => k + 1)} />
      <FileList refresh={refreshKey} />
    </div>
  );
}
