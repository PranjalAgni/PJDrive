import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api/client';
import { FileList } from '../components/FileList';
import { Uploader } from '../components/Uploader';
import { Breadcrumb } from '../components/Breadcrumb';
import { NewFolderButton } from '../components/NewFolderButton';
import { SearchBox } from '../components/SearchBox';
import { SearchResults } from '../components/SearchResults';

interface SearchData {
  files: Array<{
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    folder_id: string | null;
    created_at: string;
    rank?: number;
  }>;
  folders: Array<{
    id: string;
    parent_id: string | null;
    name: string;
    created_at: string;
    rank?: number;
  }>;
}

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const { email, clearAuth } = useAuthStore();

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    try {
      const { data } = await apiClient.get(`/search?q=${encodeURIComponent(q)}`);
      setSearchData(data);
    } catch {
      alert('Search failed');
      setSearchData(null);
    }
  }

  function handleClearSearch() {
    setSearchQuery('');
    setSearchData(null);
  }

  async function handleRefreshSearch() {
    if (searchQuery) {
      try {
        const { data } = await apiClient.get(`/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchData(data);
      } catch {
        alert('Search failed');
      }
    }
  }

  function handleOpenFolderFromSearch(folderId: string) {
    handleClearSearch();
    setCurrentFolderId(folderId);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>PJDrive</h1>
        <div>
          <Link to="/shared" style={{ marginRight: 16 }}>Shared with me</Link>
          <Link to="/trash" style={{ marginRight: 16 }}>Trash</Link>
          <span style={{ marginRight: 16 }}>{email}</span>
          <button onClick={clearAuth}>Logout</button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <SearchBox onSearch={handleSearch} onClear={handleClearSearch} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <NewFolderButton currentFolderId={currentFolderId} onCreated={handleRefresh} />
        <Uploader currentFolderId={currentFolderId} onUploaded={handleRefresh} />
      </div>
      {searchQuery && searchData ? (
        <SearchResults
          files={searchData.files}
          folders={searchData.folders}
          onOpenFolder={handleOpenFolderFromSearch}
          onRefresh={handleRefreshSearch}
        />
      ) : (
        <FileList
          refresh={refreshKey}
          currentFolderId={currentFolderId}
          onNavigate={setCurrentFolderId}
          onRefresh={handleRefresh}
          renderBreadcrumb={(breadcrumb) => (
            <Breadcrumb breadcrumb={breadcrumb} onNavigate={setCurrentFolderId} />
          )}
        />
      )}
    </div>
  );
}
