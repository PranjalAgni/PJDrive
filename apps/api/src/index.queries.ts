/** Types generated for queries found in "src/index.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'ResolveShareToken' parameters type */
export interface IResolveShareTokenParams {
  shareToken?: string | null | void;
}

/** 'ResolveShareToken' return type */
export interface IResolveShareTokenResult {
  file_id: string;
  mime_type: string | null;
  name: string;
  role: string;
  size_bytes: string | null;
}

/** 'ResolveShareToken' query type */
export interface IResolveShareTokenQuery {
  params: IResolveShareTokenParams;
  result: IResolveShareTokenResult;
}

const resolveShareTokenIR: any = {"usedParamSet":{"shareToken":true},"params":[{"name":"shareToken","required":false,"transform":{"type":"scalar"},"locs":[{"a":140,"b":150}]}],"statement":"SELECT sf.file_id, sf.role, f.name, f.mime_type, f.size_bytes\nFROM shared_files sf\nJOIN files f ON f.id = sf.file_id\nWHERE sf.share_token = :shareToken\n  AND sf.share_type = 'link'\n  AND (sf.expires_at IS NULL OR sf.expires_at > NOW())"};

/**
 * Query generated from SQL:
 * ```
 * SELECT sf.file_id, sf.role, f.name, f.mime_type, f.size_bytes
 * FROM shared_files sf
 * JOIN files f ON f.id = sf.file_id
 * WHERE sf.share_token = :shareToken
 *   AND sf.share_type = 'link'
 *   AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
 * ```
 */
export const resolveShareToken = new PreparedQuery<IResolveShareTokenParams,IResolveShareTokenResult>(resolveShareTokenIR);


