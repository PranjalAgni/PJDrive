/** Types generated for queries found in "src/routes/sharedWithMe.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetSharedWithMe' parameters type */
export interface IGetSharedWithMeParams {
  userId?: string | null | void;
}

/** 'GetSharedWithMe' return type */
export interface IGetSharedWithMeResult {
  created_at: Date | null;
  id: string;
  mime_type: string | null;
  name: string;
  owner_email: string;
  role: string;
  size_bytes: string | null;
}

/** 'GetSharedWithMe' query type */
export interface IGetSharedWithMeQuery {
  params: IGetSharedWithMeParams;
  result: IGetSharedWithMeResult;
}

const getSharedWithMeIR: any = {"usedParamSet":{"userId":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":207,"b":213}]}],"statement":"SELECT f.id, f.name, f.mime_type, f.size_bytes, f.created_at, sf.role, u.email AS owner_email\nFROM shared_files sf\nJOIN files f ON f.id = sf.file_id\nJOIN users u ON u.id = sf.owner_id\nWHERE sf.shared_with = :userId\n  AND sf.share_type = 'user'\n  AND f.trashed_at IS NULL\n  AND (sf.expires_at IS NULL OR sf.expires_at > NOW())\nORDER BY f.created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT f.id, f.name, f.mime_type, f.size_bytes, f.created_at, sf.role, u.email AS owner_email
 * FROM shared_files sf
 * JOIN files f ON f.id = sf.file_id
 * JOIN users u ON u.id = sf.owner_id
 * WHERE sf.shared_with = :userId
 *   AND sf.share_type = 'user'
 *   AND f.trashed_at IS NULL
 *   AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
 * ORDER BY f.created_at DESC
 * ```
 */
export const getSharedWithMe = new PreparedQuery<IGetSharedWithMeParams,IGetSharedWithMeResult>(getSharedWithMeIR);


