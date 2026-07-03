/** Types generated for queries found in "src/routes/files.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'ListFilesByOwner' parameters type */
export interface IListFilesByOwnerParams {
  ownerId?: string | null | void;
}

/** 'ListFilesByOwner' return type */
export interface IListFilesByOwnerResult {
  checksum: string | null;
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'ListFilesByOwner' query type */
export interface IListFilesByOwnerQuery {
  params: IListFilesByOwnerParams;
  result: IListFilesByOwnerResult;
}

const listFilesByOwnerIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":112,"b":119}]}],"statement":"SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at\nFROM files\nWHERE owner_id = :ownerId AND trashed_at IS NULL\nORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
 * FROM files
 * WHERE owner_id = :ownerId AND trashed_at IS NULL
 * ORDER BY created_at DESC
 * ```
 */
export const listFilesByOwner = new PreparedQuery<IListFilesByOwnerParams,IListFilesByOwnerResult>(listFilesByOwnerIR);


/** 'GetFileByIdAndOwner' parameters type */
export interface IGetFileByIdAndOwnerParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetFileByIdAndOwner' return type */
export interface IGetFileByIdAndOwnerResult {
  checksum: string | null;
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'GetFileByIdAndOwner' query type */
export interface IGetFileByIdAndOwnerQuery {
  params: IGetFileByIdAndOwnerParams;
  result: IGetFileByIdAndOwnerResult;
}

const getFileByIdAndOwnerIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":106,"b":112}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":129,"b":136}]}],"statement":"SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at\nFROM files\nWHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
 * FROM files
 * WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL
 * ```
 */
export const getFileByIdAndOwner = new PreparedQuery<IGetFileByIdAndOwnerParams,IGetFileByIdAndOwnerResult>(getFileByIdAndOwnerIR);


/** 'UpdateFile' parameters type */
export interface IUpdateFileParams {
  fileId?: string | null | void;
  folderId?: string | null | void;
  name?: string | null | void;
  ownerId?: string | null | void;
  setFolder?: boolean | null | void;
}

/** 'UpdateFile' return type */
export interface IUpdateFileResult {
  checksum: string | null;
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  owner_id: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'UpdateFile' query type */
export interface IUpdateFileQuery {
  params: IUpdateFileParams;
  result: IUpdateFileResult;
}

const updateFileIR: any = {"usedParamSet":{"name":true,"setFolder":true,"folderId":true,"fileId":true,"ownerId":true},"params":[{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":33,"b":37}]},{"name":"setFolder","required":false,"transform":{"type":"scalar"},"locs":[{"a":73,"b":82}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":98,"b":106}]},{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":162,"b":168}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":185,"b":192}]}],"statement":"UPDATE files\nSET name = COALESCE(:name, name),\n    folder_id = CASE WHEN :setFolder::boolean THEN :folderId ELSE folder_id END,\n    updated_at = NOW()\nWHERE id = :fileId AND owner_id = :ownerId\nRETURNING id, owner_id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE files
 * SET name = COALESCE(:name, name),
 *     folder_id = CASE WHEN :setFolder::boolean THEN :folderId ELSE folder_id END,
 *     updated_at = NOW()
 * WHERE id = :fileId AND owner_id = :ownerId
 * RETURNING id, owner_id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
 * ```
 */
export const updateFile = new PreparedQuery<IUpdateFileParams,IUpdateFileResult>(updateFileIR);


/** 'GetFileByIdWithAccess' parameters type */
export interface IGetFileByIdWithAccessParams {
  fileId?: string | null | void;
  userId?: string | null | void;
}

/** 'GetFileByIdWithAccess' return type */
export interface IGetFileByIdWithAccessResult {
  checksum: string | null;
  created_at: Date | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'GetFileByIdWithAccess' query type */
export interface IGetFileByIdWithAccessQuery {
  params: IGetFileByIdWithAccessParams;
  result: IGetFileByIdWithAccessResult;
}

const getFileByIdWithAccessIR: any = {"usedParamSet":{"fileId":true,"userId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":113,"b":119}]},{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":173,"b":179},{"a":292,"b":298}]}],"statement":"SELECT f.id, f.name, f.mime_type, f.size_bytes, f.checksum, f.created_at, f.updated_at\nFROM files f\nWHERE f.id = :fileId\n  AND f.trashed_at IS NULL\n  AND (\n    f.owner_id = :userId\n    OR EXISTS (\n      SELECT 1 FROM shared_files sf\n      WHERE sf.file_id = f.id\n        AND sf.shared_with = :userId\n        AND sf.share_type = 'user'\n        AND (sf.expires_at IS NULL OR sf.expires_at > NOW())\n    )\n  )"};

/**
 * Query generated from SQL:
 * ```
 * SELECT f.id, f.name, f.mime_type, f.size_bytes, f.checksum, f.created_at, f.updated_at
 * FROM files f
 * WHERE f.id = :fileId
 *   AND f.trashed_at IS NULL
 *   AND (
 *     f.owner_id = :userId
 *     OR EXISTS (
 *       SELECT 1 FROM shared_files sf
 *       WHERE sf.file_id = f.id
 *         AND sf.shared_with = :userId
 *         AND sf.share_type = 'user'
 *         AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
 *     )
 *   )
 * ```
 */
export const getFileByIdWithAccess = new PreparedQuery<IGetFileByIdWithAccessParams,IGetFileByIdWithAccessResult>(getFileByIdWithAccessIR);


/** 'GetFileStorageKey' parameters type */
export interface IGetFileStorageKeyParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetFileStorageKey' return type */
export interface IGetFileStorageKeyResult {
  storage_key: string;
}

/** 'GetFileStorageKey' query type */
export interface IGetFileStorageKeyQuery {
  params: IGetFileStorageKeyParams;
  result: IGetFileStorageKeyResult;
}

const getFileStorageKeyIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":41,"b":47}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":71}]}],"statement":"SELECT storage_key\nFROM files\nWHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * SELECT storage_key
 * FROM files
 * WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL
 * ```
 */
export const getFileStorageKey = new PreparedQuery<IGetFileStorageKeyParams,IGetFileStorageKeyResult>(getFileStorageKeyIR);


/** 'GetFileStorageKeyWithAccess' parameters type */
export interface IGetFileStorageKeyWithAccessParams {
  fileId?: string | null | void;
  userId?: string | null | void;
}

/** 'GetFileStorageKeyWithAccess' return type */
export interface IGetFileStorageKeyWithAccessResult {
  storage_key: string;
}

/** 'GetFileStorageKeyWithAccess' query type */
export interface IGetFileStorageKeyWithAccessQuery {
  params: IGetFileStorageKeyWithAccessParams;
  result: IGetFileStorageKeyWithAccessResult;
}

const getFileStorageKeyWithAccessIR: any = {"usedParamSet":{"fileId":true,"userId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]},{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":107,"b":113},{"a":226,"b":232}]}],"statement":"SELECT f.storage_key\nFROM files f\nWHERE f.id = :fileId\n  AND f.trashed_at IS NULL\n  AND (\n    f.owner_id = :userId\n    OR EXISTS (\n      SELECT 1 FROM shared_files sf\n      WHERE sf.file_id = f.id\n        AND sf.shared_with = :userId\n        AND sf.share_type = 'user'\n        AND (sf.expires_at IS NULL OR sf.expires_at > NOW())\n    )\n  )"};

/**
 * Query generated from SQL:
 * ```
 * SELECT f.storage_key
 * FROM files f
 * WHERE f.id = :fileId
 *   AND f.trashed_at IS NULL
 *   AND (
 *     f.owner_id = :userId
 *     OR EXISTS (
 *       SELECT 1 FROM shared_files sf
 *       WHERE sf.file_id = f.id
 *         AND sf.shared_with = :userId
 *         AND sf.share_type = 'user'
 *         AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
 *     )
 *   )
 * ```
 */
export const getFileStorageKeyWithAccess = new PreparedQuery<IGetFileStorageKeyWithAccessParams,IGetFileStorageKeyWithAccessResult>(getFileStorageKeyWithAccessIR);


/** 'GetFileStorageKeyForDelete' parameters type */
export interface IGetFileStorageKeyForDeleteParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetFileStorageKeyForDelete' return type */
export interface IGetFileStorageKeyForDeleteResult {
  storage_key: string;
}

/** 'GetFileStorageKeyForDelete' query type */
export interface IGetFileStorageKeyForDeleteQuery {
  params: IGetFileStorageKeyForDeleteParams;
  result: IGetFileStorageKeyForDeleteResult;
}

const getFileStorageKeyForDeleteIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":41,"b":47}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":71}]}],"statement":"SELECT storage_key\nFROM files\nWHERE id = :fileId AND owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT storage_key
 * FROM files
 * WHERE id = :fileId AND owner_id = :ownerId
 * ```
 */
export const getFileStorageKeyForDelete = new PreparedQuery<IGetFileStorageKeyForDeleteParams,IGetFileStorageKeyForDeleteResult>(getFileStorageKeyForDeleteIR);


/** 'InsertSyncLogDeleted' parameters type */
export interface IInsertSyncLogDeletedParams {
  fileId?: string | null | void;
  userId?: string | null | void;
}

/** 'InsertSyncLogDeleted' return type */
export type IInsertSyncLogDeletedResult = void;

/** 'InsertSyncLogDeleted' query type */
export interface IInsertSyncLogDeletedQuery {
  params: IInsertSyncLogDeletedParams;
  result: IInsertSyncLogDeletedResult;
}

const insertSyncLogDeletedIR: any = {"usedParamSet":{"userId":true,"fileId":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]},{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":75}]}],"statement":"INSERT INTO sync_log (user_id, file_id, event_type)\nVALUES (:userId, :fileId, 'deleted')"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO sync_log (user_id, file_id, event_type)
 * VALUES (:userId, :fileId, 'deleted')
 * ```
 */
export const insertSyncLogDeleted = new PreparedQuery<IInsertSyncLogDeletedParams,IInsertSyncLogDeletedResult>(insertSyncLogDeletedIR);


