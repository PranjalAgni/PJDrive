import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function ShareModal({ fileId, fileName, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [emailRole, setEmailRole] = useState<'viewer' | 'editor'>('viewer');
  const [linkRole, setLinkRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleShareByEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await apiClient.post(`/files/${fileId}/share`, { email, role: emailRole });
      setSuccess(`Shared with ${email} as ${emailRole}`);
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Share failed');
    }
  }

  async function handleGenerateLink() {
    setError(''); setSuccess('');
    try {
      const { data } = await apiClient.post(`/files/${fileId}/share/link`, { role: linkRole });
      setShareUrl(data.shareUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate link');
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 24, width: 420, maxWidth: '90vw',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
        <h3 id="share-modal-title">Share "{fileName}"</h3>

        <form onSubmit={handleShareByEmail} style={{ marginBottom: 16 }}>
          <label>Share with email</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              style={{ flex: 1 }}
              required
            />
            <select value={emailRole} onChange={(e) => setEmailRole(e.target.value as 'viewer' | 'editor')}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="submit">Share</button>
          </div>
        </form>

        <div style={{ marginBottom: 16 }}>
          <label>Public link</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as 'viewer' | 'editor')}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="button" onClick={handleGenerateLink}>Generate link</button>
          </div>
          {shareUrl && (
            <div style={{ marginTop: 8 }}>
              <input readOnly value={shareUrl} style={{ width: '100%' }} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
          )}
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button onClick={onClose} style={{ marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}
