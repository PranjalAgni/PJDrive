export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface File {
  id: string;
  owner_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  checksum: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface UploadJob {
  id: string;
  file_id: string;
  upload_id: string;
  total_chunks: number;
  uploaded_chunks: string[];
  status: 'in_progress' | 'complete' | 'failed';
}

export interface ShareRecord {
  id: string;
  file_id: string;
  owner_id: string;
  shared_with: string | null;
  share_type: 'user' | 'link';
  role: 'editor' | 'viewer';
  share_token: string | null;
  expires_at: string | null;
}

export interface SyncEvent {
  id: string;
  user_id: string;
  file_id: string;
  event_type: 'created' | 'updated' | 'deleted';
  created_at: string;
}
