/** Types generated for queries found in "src/routes/search.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type NumberOrString = number | string;

/** 'SearchFiles' parameters type */
export interface ISearchFilesParams {
  afterTs?: DateOrString | null | void;
  beforeTs?: DateOrString | null | void;
  like?: string | null | void;
  maxResults?: NumberOrString | null | void;
  ownerId?: string | null | void;
  q?: string | null | void;
  typePrefix?: string | null | void;
}

/** 'SearchFiles' return type */
export interface ISearchFilesResult {
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  rank: number | null;
  size_bytes: string | null;
}

/** 'SearchFiles' query type */
export interface ISearchFilesQuery {
  params: ISearchFilesParams;
  result: ISearchFilesResult;
}

const searchFilesIR: any = {"usedParamSet":{"q":true,"ownerId":true,"like":true,"typePrefix":true,"afterTs":true,"beforeTs":true,"maxResults":true},"params":[{"name":"q","required":false,"transform":{"type":"scalar"},"locs":[{"a":133,"b":134},{"a":277,"b":278}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":174,"b":181}]},{"name":"like","required":false,"transform":{"type":"scalar"},"locs":[{"a":299,"b":303}]},{"name":"typePrefix","required":false,"transform":{"type":"scalar"},"locs":[{"a":316,"b":326},{"a":360,"b":370}]},{"name":"afterTs","required":false,"transform":{"type":"scalar"},"locs":[{"a":380,"b":387},{"a":427,"b":434}]},{"name":"beforeTs","required":false,"transform":{"type":"scalar"},"locs":[{"a":444,"b":452},{"a":492,"b":500}]},{"name":"maxResults","required":false,"transform":{"type":"scalar"},"locs":[{"a":545,"b":555}]}],"statement":"SELECT id, name, mime_type, size_bytes, folder_id, created_at,\n       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank\nFROM files\nWHERE owner_id = :ownerId\n  AND trashed_at IS NULL\n  AND (\n    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)\n    OR name ILIKE :like\n  )\n  AND (:typePrefix::text IS NULL OR mime_type LIKE :typePrefix)\n  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)\n  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)\nORDER BY rank DESC, created_at DESC\nLIMIT :maxResults"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, folder_id, created_at,
 *        ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
 * FROM files
 * WHERE owner_id = :ownerId
 *   AND trashed_at IS NULL
 *   AND (
 *     to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
 *     OR name ILIKE :like
 *   )
 *   AND (:typePrefix::text IS NULL OR mime_type LIKE :typePrefix)
 *   AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
 *   AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
 * ORDER BY rank DESC, created_at DESC
 * LIMIT :maxResults
 * ```
 */
export const searchFiles = new PreparedQuery<ISearchFilesParams,ISearchFilesResult>(searchFilesIR);


/** 'SearchFolders' parameters type */
export interface ISearchFoldersParams {
  afterTs?: DateOrString | null | void;
  beforeTs?: DateOrString | null | void;
  like?: string | null | void;
  maxResults?: NumberOrString | null | void;
  ownerId?: string | null | void;
  q?: string | null | void;
}

/** 'SearchFolders' return type */
export interface ISearchFoldersResult {
  created_at: Date | null;
  id: string;
  name: string;
  parent_id: string | null;
  rank: number | null;
}

/** 'SearchFolders' query type */
export interface ISearchFoldersQuery {
  params: ISearchFoldersParams;
  result: ISearchFoldersResult;
}

const searchFoldersIR: any = {"usedParamSet":{"q":true,"ownerId":true,"like":true,"afterTs":true,"beforeTs":true,"maxResults":true},"params":[{"name":"q","required":false,"transform":{"type":"scalar"},"locs":[{"a":110,"b":111},{"a":256,"b":257}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":153,"b":160}]},{"name":"like","required":false,"transform":{"type":"scalar"},"locs":[{"a":278,"b":282}]},{"name":"afterTs","required":false,"transform":{"type":"scalar"},"locs":[{"a":295,"b":302},{"a":342,"b":349}]},{"name":"beforeTs","required":false,"transform":{"type":"scalar"},"locs":[{"a":359,"b":367},{"a":407,"b":415}]},{"name":"maxResults","required":false,"transform":{"type":"scalar"},"locs":[{"a":460,"b":470}]}],"statement":"SELECT id, parent_id, name, created_at,\n       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank\nFROM folders\nWHERE owner_id = :ownerId\n  AND trashed_at IS NULL\n  AND (\n    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)\n    OR name ILIKE :like\n  )\n  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)\n  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)\nORDER BY rank DESC, created_at DESC\nLIMIT :maxResults"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, parent_id, name, created_at,
 *        ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
 * FROM folders
 * WHERE owner_id = :ownerId
 *   AND trashed_at IS NULL
 *   AND (
 *     to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
 *     OR name ILIKE :like
 *   )
 *   AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
 *   AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
 * ORDER BY rank DESC, created_at DESC
 * LIMIT :maxResults
 * ```
 */
export const searchFolders = new PreparedQuery<ISearchFoldersParams,ISearchFoldersResult>(searchFoldersIR);


