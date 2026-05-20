/** Types generated for queries found in "src/routes/sync.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'GetSyncChanges' parameters type */
export interface IGetSyncChangesParams {
  since?: DateOrString | null | void;
  userId?: string | null | void;
}

/** 'GetSyncChanges' return type */
export interface IGetSyncChangesResult {
  created_at: Date | null;
  event_type: string;
  file_id: string;
}

/** 'GetSyncChanges' query type */
export interface IGetSyncChangesQuery {
  params: IGetSyncChangesParams;
  result: IGetSyncChangesResult;
}

const getSyncChangesIR: any = {"usedParamSet":{"userId":true,"since":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":75}]},{"name":"since","required":false,"transform":{"type":"scalar"},"locs":[{"a":94,"b":99}]}],"statement":"SELECT file_id, event_type, created_at\nFROM sync_log\nWHERE user_id = :userId AND created_at > :since\nORDER BY created_at ASC\nLIMIT 500"};

/**
 * Query generated from SQL:
 * ```
 * SELECT file_id, event_type, created_at
 * FROM sync_log
 * WHERE user_id = :userId AND created_at > :since
 * ORDER BY created_at ASC
 * LIMIT 500
 * ```
 */
export const getSyncChanges = new PreparedQuery<IGetSyncChangesParams,IGetSyncChangesResult>(getSyncChangesIR);


