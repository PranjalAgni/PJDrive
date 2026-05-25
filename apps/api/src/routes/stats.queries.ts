/** Types generated for queries found in "src/routes/stats.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  userId?: string | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  file_count: number | null;
  total_bytes: string | null;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {"usedParamSet":{"userId":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":120,"b":126}]}],"statement":"SELECT\n  COUNT(*)::int AS file_count,\n  COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes\nFROM files\nWHERE owner_id = :userId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   COUNT(*)::int AS file_count,
 *   COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
 * FROM files
 * WHERE owner_id = :userId
 * ```
 */
export const getUserStats = new PreparedQuery<IGetUserStatsParams,IGetUserStatsResult>(getUserStatsIR);


