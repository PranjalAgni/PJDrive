import { Response, NextFunction } from 'express';
import { pool } from '../db';
import { AuthRequest } from './auth';

export type Role = 'owner' | 'editor' | 'viewer';

const roleRank: Record<Role, number> = { owner: 3, editor: 2, viewer: 1 };

function meetsMinRole(actual: Role, required: Role): boolean {
  return roleRank[actual] >= roleRank[required];
}

export function requireFileAccess(minRole: Role) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const fileId = req.params.id || req.params.fileId;
      const shareToken = req.query.token as string | undefined;

      // 1. Check ownership
      const ownerRes = await pool.query('SELECT id FROM files WHERE id=$1 AND owner_id=$2', [fileId, req.userId]);
      if (ownerRes.rows.length > 0) {
        req.fileRole = 'owner';
        return next();
      }

      // 2. Check user share
      if (req.userId) {
        const shareRes = await pool.query(
          "SELECT role FROM shared_files WHERE file_id=$1 AND shared_with=$2 AND share_type='user' AND (expires_at IS NULL OR expires_at > NOW())",
          [fileId, req.userId]
        );
        if (shareRes.rows.length > 0) {
          const role = shareRes.rows[0].role as Role;
          if (meetsMinRole(role, minRole)) {
            req.fileRole = role;
            return next();
          }
          return res.status(403).json({ error: 'insufficient permissions' });
        }
      }

      // 3. Check share token (public link)
      if (shareToken) {
        const tokenRes = await pool.query(
          "SELECT role FROM shared_files WHERE file_id=$1 AND share_token=$2 AND share_type='link' AND (expires_at IS NULL OR expires_at > NOW())",
          [fileId, shareToken]
        );
        if (tokenRes.rows.length > 0) {
          const role = tokenRes.rows[0].role as Role;
          if (meetsMinRole(role, minRole)) {
            req.fileRole = role;
            return next();
          }
          return res.status(403).json({ error: 'insufficient permissions' });
        }
      }

      return res.status(403).json({ error: 'access denied' });
    } catch (err) {
      console.error('fileAccess middleware error:', err);
      return next(err);
    }
  };
}
