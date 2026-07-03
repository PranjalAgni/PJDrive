/** Types generated for queries found in "src/routes/trash.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'SoftDeleteFile' parameters type */
export interface ISoftDeleteFileParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'SoftDeleteFile' return type */
export interface ISoftDeleteFileResult {
  id: string;
}

/** 'SoftDeleteFile' query type */
export interface ISoftDeleteFileQuery {
  params: ISoftDeleteFileParams;
  result: ISoftDeleteFileResult;
}

const softDeleteFileIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":70,"b":77}]}],"statement":"UPDATE files SET trashed_at = NOW()\nWHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE files SET trashed_at = NOW()
 * WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL
 * RETURNING id
 * ```
 */
export const softDeleteFile = new PreparedQuery<ISoftDeleteFileParams,ISoftDeleteFileResult>(softDeleteFileIR);


/** 'TrashFolderSubtreeFolders' parameters type */
export interface ITrashFolderSubtreeFoldersParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
  trashedAt?: DateOrString | null | void;
}

/** 'TrashFolderSubtreeFolders' return type */
export type ITrashFolderSubtreeFoldersResult = void;

/** 'TrashFolderSubtreeFolders' query type */
export interface ITrashFolderSubtreeFoldersQuery {
  params: ITrashFolderSubtreeFoldersParams;
  result: ITrashFolderSubtreeFoldersResult;
}

const trashFolderSubtreeFoldersIR: any = {"usedParamSet":{"folderId":true,"ownerId":true,"trashedAt":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":72}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":89,"b":96}]},{"name":"trashedAt","required":false,"transform":{"type":"scalar"},"locs":[{"a":210,"b":219}]}],"statement":"WITH RECURSIVE subtree AS (\n  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId\n  UNION ALL\n  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id\n)\nUPDATE folders SET trashed_at = :trashedAt\nWHERE id IN (SELECT id FROM subtree) AND trashed_at IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * WITH RECURSIVE subtree AS (
 *   SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
 *   UNION ALL
 *   SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
 * )
 * UPDATE folders SET trashed_at = :trashedAt
 * WHERE id IN (SELECT id FROM subtree) AND trashed_at IS NULL
 * ```
 */
export const trashFolderSubtreeFolders = new PreparedQuery<ITrashFolderSubtreeFoldersParams,ITrashFolderSubtreeFoldersResult>(trashFolderSubtreeFoldersIR);


/** 'TrashFolderSubtreeFiles' parameters type */
export interface ITrashFolderSubtreeFilesParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
  trashedAt?: DateOrString | null | void;
}

/** 'TrashFolderSubtreeFiles' return type */
export type ITrashFolderSubtreeFilesResult = void;

/** 'TrashFolderSubtreeFiles' query type */
export interface ITrashFolderSubtreeFilesQuery {
  params: ITrashFolderSubtreeFilesParams;
  result: ITrashFolderSubtreeFilesResult;
}

const trashFolderSubtreeFilesIR: any = {"usedParamSet":{"folderId":true,"ownerId":true,"trashedAt":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":72}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":89,"b":96}]},{"name":"trashedAt","required":false,"transform":{"type":"scalar"},"locs":[{"a":208,"b":217}]}],"statement":"WITH RECURSIVE subtree AS (\n  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId\n  UNION ALL\n  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id\n)\nUPDATE files SET trashed_at = :trashedAt\nWHERE folder_id IN (SELECT id FROM subtree) AND trashed_at IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * WITH RECURSIVE subtree AS (
 *   SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
 *   UNION ALL
 *   SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
 * )
 * UPDATE files SET trashed_at = :trashedAt
 * WHERE folder_id IN (SELECT id FROM subtree) AND trashed_at IS NULL
 * ```
 */
export const trashFolderSubtreeFiles = new PreparedQuery<ITrashFolderSubtreeFilesParams,ITrashFolderSubtreeFilesResult>(trashFolderSubtreeFilesIR);


/** 'ListTrashedFiles' parameters type */
export interface IListTrashedFilesParams {
  ownerId?: string | null | void;
}

/** 'ListTrashedFiles' return type */
export interface IListTrashedFilesResult {
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  trashed_at: Date | null;
}

/** 'ListTrashedFiles' query type */
export interface IListTrashedFilesQuery {
  params: IListTrashedFilesParams;
  result: IListTrashedFilesResult;
}

const listTrashedFilesIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":102,"b":109}]}],"statement":"SELECT id, name, mime_type, size_bytes, folder_id, trashed_at, created_at\nFROM files\nWHERE owner_id = :ownerId AND trashed_at IS NOT NULL\nORDER BY trashed_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, folder_id, trashed_at, created_at
 * FROM files
 * WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
 * ORDER BY trashed_at DESC
 * ```
 */
export const listTrashedFiles = new PreparedQuery<IListTrashedFilesParams,IListTrashedFilesResult>(listTrashedFilesIR);


/** 'ListTrashedFolders' parameters type */
export interface IListTrashedFoldersParams {
  ownerId?: string | null | void;
}

/** 'ListTrashedFolders' return type */
export interface IListTrashedFoldersResult {
  created_at: Date | null;
  id: string;
  name: string;
  parent_id: string | null;
  trashed_at: Date | null;
}

/** 'ListTrashedFolders' query type */
export interface IListTrashedFoldersQuery {
  params: IListTrashedFoldersParams;
  result: IListTrashedFoldersResult;
}

const listTrashedFoldersIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":81,"b":88}]}],"statement":"SELECT id, parent_id, name, trashed_at, created_at\nFROM folders\nWHERE owner_id = :ownerId AND trashed_at IS NOT NULL\nORDER BY trashed_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, parent_id, name, trashed_at, created_at
 * FROM folders
 * WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
 * ORDER BY trashed_at DESC
 * ```
 */
export const listTrashedFolders = new PreparedQuery<IListTrashedFoldersParams,IListTrashedFoldersResult>(listTrashedFoldersIR);


/** 'RestoreFile' parameters type */
export interface IRestoreFileParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'RestoreFile' return type */
export interface IRestoreFileResult {
  folder_id: string | null;
  id: string;
}

/** 'RestoreFile' query type */
export interface IRestoreFileQuery {
  params: IRestoreFileParams;
  result: IRestoreFileResult;
}

const restoreFileIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":46,"b":52}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":76}]}],"statement":"UPDATE files SET trashed_at = NULL\nWHERE id = :fileId AND owner_id = :ownerId\nRETURNING id, folder_id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE files SET trashed_at = NULL
 * WHERE id = :fileId AND owner_id = :ownerId
 * RETURNING id, folder_id
 * ```
 */
export const restoreFile = new PreparedQuery<IRestoreFileParams,IRestoreFileResult>(restoreFileIR);


/** 'DetachRestoredFileIfFolderTrashed' parameters type */
export interface IDetachRestoredFileIfFolderTrashedParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'DetachRestoredFileIfFolderTrashed' return type */
export type IDetachRestoredFileIfFolderTrashedResult = void;

/** 'DetachRestoredFileIfFolderTrashed' query type */
export interface IDetachRestoredFileIfFolderTrashedQuery {
  params: IDetachRestoredFileIfFolderTrashedParams;
  result: IDetachRestoredFileIfFolderTrashedResult;
}

const detachRestoredFileIfFolderTrashedIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":45,"b":51}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":68,"b":75}]}],"statement":"UPDATE files SET folder_id = NULL\nWHERE id = :fileId AND owner_id = :ownerId\n  AND folder_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL)"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE files SET folder_id = NULL
 * WHERE id = :fileId AND owner_id = :ownerId
 *   AND folder_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL)
 * ```
 */
export const detachRestoredFileIfFolderTrashed = new PreparedQuery<IDetachRestoredFileIfFolderTrashedParams,IDetachRestoredFileIfFolderTrashedResult>(detachRestoredFileIfFolderTrashedIR);


/** 'RestoreFolderGroup' parameters type */
export interface IRestoreFolderGroupParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'RestoreFolderGroup' return type */
export type IRestoreFolderGroupResult = void;

/** 'RestoreFolderGroup' query type */
export interface IRestoreFolderGroupQuery {
  params: IRestoreFolderGroupParams;
  result: IRestoreFolderGroupResult;
}

const restoreFolderGroupIR: any = {"usedParamSet":{"ownerId":true,"folderId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":120,"b":127},{"a":216,"b":223},{"a":337,"b":344}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":191,"b":199},{"a":312,"b":320}]}],"statement":"                                                                 \nUPDATE folders SET trashed_at = NULL\nWHERE owner_id = :ownerId\n  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)\n  AND id IN (\n    WITH RECURSIVE subtree AS (\n      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId\n      UNION ALL\n      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id\n    )\n    SELECT id FROM subtree\n  )"};

/**
 * Query generated from SQL:
 * ```
 *                                                                  
 * UPDATE folders SET trashed_at = NULL
 * WHERE owner_id = :ownerId
 *   AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)
 *   AND id IN (
 *     WITH RECURSIVE subtree AS (
 *       SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
 *       UNION ALL
 *       SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
 *     )
 *     SELECT id FROM subtree
 *   )
 * ```
 */
export const restoreFolderGroup = new PreparedQuery<IRestoreFolderGroupParams,IRestoreFolderGroupResult>(restoreFolderGroupIR);


/** 'RestoreFolderGroupFiles' parameters type */
export interface IRestoreFolderGroupFilesParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'RestoreFolderGroupFiles' return type */
export type IRestoreFolderGroupFilesResult = void;

/** 'RestoreFolderGroupFiles' query type */
export interface IRestoreFolderGroupFilesQuery {
  params: IRestoreFolderGroupFilesParams;
  result: IRestoreFolderGroupFilesResult;
}

const restoreFolderGroupFilesIR: any = {"usedParamSet":{"ownerId":true,"folderId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":52,"b":59},{"a":179,"b":186},{"a":398,"b":405}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":154,"b":162},{"a":373,"b":381}]}],"statement":"UPDATE files SET trashed_at = NULL\nWHERE owner_id = :ownerId\n  AND folder_id IN (\n    WITH RECURSIVE subtree AS (\n      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId\n      UNION ALL\n      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id\n    )\n    SELECT id FROM subtree\n  )\n  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE files SET trashed_at = NULL
 * WHERE owner_id = :ownerId
 *   AND folder_id IN (
 *     WITH RECURSIVE subtree AS (
 *       SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
 *       UNION ALL
 *       SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
 *     )
 *     SELECT id FROM subtree
 *   )
 *   AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)
 * ```
 */
export const restoreFolderGroupFiles = new PreparedQuery<IRestoreFolderGroupFilesParams,IRestoreFolderGroupFilesResult>(restoreFolderGroupFilesIR);


/** 'DetachRestoredFolderIfParentTrashed' parameters type */
export interface IDetachRestoredFolderIfParentTrashedParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'DetachRestoredFolderIfParentTrashed' return type */
export type IDetachRestoredFolderIfParentTrashedResult = void;

/** 'DetachRestoredFolderIfParentTrashed' query type */
export interface IDetachRestoredFolderIfParentTrashedQuery {
  params: IDetachRestoredFolderIfParentTrashedParams;
  result: IDetachRestoredFolderIfParentTrashedResult;
}

const detachRestoredFolderIfParentTrashedIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":121,"b":129}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":146,"b":153}]}],"statement":"                                                                         \nUPDATE folders SET parent_id = NULL\nWHERE id = :folderId AND owner_id = :ownerId\n  AND parent_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL)"};

/**
 * Query generated from SQL:
 * ```
 *                                                                          
 * UPDATE folders SET parent_id = NULL
 * WHERE id = :folderId AND owner_id = :ownerId
 *   AND parent_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL)
 * ```
 */
export const detachRestoredFolderIfParentTrashed = new PreparedQuery<IDetachRestoredFolderIfParentTrashedParams,IDetachRestoredFolderIfParentTrashedResult>(detachRestoredFolderIfParentTrashedIR);


/** 'GetTrashedFileStorageKey' parameters type */
export interface IGetTrashedFileStorageKeyParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetTrashedFileStorageKey' return type */
export interface IGetTrashedFileStorageKeyResult {
  storage_key: string;
}

/** 'GetTrashedFileStorageKey' query type */
export interface IGetTrashedFileStorageKeyQuery {
  params: IGetTrashedFileStorageKeyParams;
  result: IGetTrashedFileStorageKeyResult;
}

const getTrashedFileStorageKeyIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":41,"b":47}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":71}]}],"statement":"SELECT storage_key FROM files\nWHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * SELECT storage_key FROM files
 * WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const getTrashedFileStorageKey = new PreparedQuery<IGetTrashedFileStorageKeyParams,IGetTrashedFileStorageKeyResult>(getTrashedFileStorageKeyIR);


/** 'HardDeleteFile' parameters type */
export interface IHardDeleteFileParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'HardDeleteFile' return type */
export type IHardDeleteFileResult = void;

/** 'HardDeleteFile' query type */
export interface IHardDeleteFileQuery {
  params: IHardDeleteFileParams;
  result: IHardDeleteFileResult;
}

const hardDeleteFileIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":29,"b":35}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":52,"b":59}]}],"statement":"DELETE FROM files WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM files WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const hardDeleteFile = new PreparedQuery<IHardDeleteFileParams,IHardDeleteFileResult>(hardDeleteFileIR);


/** 'HardDeleteFolder' parameters type */
export interface IHardDeleteFolderParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'HardDeleteFolder' return type */
export type IHardDeleteFolderResult = void;

/** 'HardDeleteFolder' query type */
export interface IHardDeleteFolderQuery {
  params: IHardDeleteFolderParams;
  result: IHardDeleteFolderResult;
}

const hardDeleteFolderIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":31,"b":39}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]}],"statement":"DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const hardDeleteFolder = new PreparedQuery<IHardDeleteFolderParams,IHardDeleteFolderResult>(hardDeleteFolderIR);


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

const insertSyncLogDeletedIR: any = {"usedParamSet":{"userId":true,"fileId":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]},{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":75}]}],"statement":"INSERT INTO sync_log (user_id, file_id, event_type) VALUES (:userId, :fileId, 'deleted')"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO sync_log (user_id, file_id, event_type) VALUES (:userId, :fileId, 'deleted')
 * ```
 */
export const insertSyncLogDeleted = new PreparedQuery<IInsertSyncLogDeletedParams,IInsertSyncLogDeletedResult>(insertSyncLogDeletedIR);


/** 'ListAllTrashedFileKeys' parameters type */
export interface IListAllTrashedFileKeysParams {
  ownerId?: string | null | void;
}

/** 'ListAllTrashedFileKeys' return type */
export interface IListAllTrashedFileKeysResult {
  id: string;
  storage_key: string;
}

/** 'ListAllTrashedFileKeys' query type */
export interface IListAllTrashedFileKeysQuery {
  params: IListAllTrashedFileKeysParams;
  result: IListAllTrashedFileKeysResult;
}

const listAllTrashedFileKeysIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":115,"b":122}]}],"statement":"                                                               \nSELECT id, storage_key FROM files\nWHERE owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 *                                                                
 * SELECT id, storage_key FROM files
 * WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const listAllTrashedFileKeys = new PreparedQuery<IListAllTrashedFileKeysParams,IListAllTrashedFileKeysResult>(listAllTrashedFileKeysIR);


/** 'EmptyTrashFiles' parameters type */
export interface IEmptyTrashFilesParams {
  ownerId?: string | null | void;
}

/** 'EmptyTrashFiles' return type */
export type IEmptyTrashFilesResult = void;

/** 'EmptyTrashFiles' query type */
export interface IEmptyTrashFilesQuery {
  params: IEmptyTrashFilesParams;
  result: IEmptyTrashFilesResult;
}

const emptyTrashFilesIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":42}]}],"statement":"DELETE FROM files WHERE owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM files WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const emptyTrashFiles = new PreparedQuery<IEmptyTrashFilesParams,IEmptyTrashFilesResult>(emptyTrashFilesIR);


/** 'EmptyTrashFolders' parameters type */
export interface IEmptyTrashFoldersParams {
  ownerId?: string | null | void;
}

/** 'EmptyTrashFolders' return type */
export type IEmptyTrashFoldersResult = void;

/** 'EmptyTrashFolders' query type */
export interface IEmptyTrashFoldersQuery {
  params: IEmptyTrashFoldersParams;
  result: IEmptyTrashFoldersResult;
}

const emptyTrashFoldersIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":37,"b":44}]}],"statement":"DELETE FROM folders WHERE owner_id = :ownerId AND trashed_at IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM folders WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
 * ```
 */
export const emptyTrashFolders = new PreparedQuery<IEmptyTrashFoldersParams,IEmptyTrashFoldersResult>(emptyTrashFoldersIR);


/** 'SelectPurgeableFileKeys' parameters type */
export type ISelectPurgeableFileKeysParams = void;

/** 'SelectPurgeableFileKeys' return type */
export interface ISelectPurgeableFileKeysResult {
  id: string;
  storage_key: string;
}

/** 'SelectPurgeableFileKeys' query type */
export interface ISelectPurgeableFileKeysQuery {
  params: ISelectPurgeableFileKeysParams;
  result: ISelectPurgeableFileKeysResult;
}

const selectPurgeableFileKeysIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT id, storage_key FROM files\nWHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, storage_key FROM files
 * WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'
 * ```
 */
export const selectPurgeableFileKeys = new PreparedQuery<ISelectPurgeableFileKeysParams,ISelectPurgeableFileKeysResult>(selectPurgeableFileKeysIR);


/** 'PurgeFiles' parameters type */
export type IPurgeFilesParams = void;

/** 'PurgeFiles' return type */
export type IPurgeFilesResult = void;

/** 'PurgeFiles' query type */
export interface IPurgeFilesQuery {
  params: IPurgeFilesParams;
  result: IPurgeFilesResult;
}

const purgeFilesIR: any = {"usedParamSet":{},"params":[],"statement":"DELETE FROM files WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM files WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'
 * ```
 */
export const purgeFiles = new PreparedQuery<IPurgeFilesParams,IPurgeFilesResult>(purgeFilesIR);


/** 'PurgeFolders' parameters type */
export type IPurgeFoldersParams = void;

/** 'PurgeFolders' return type */
export type IPurgeFoldersResult = void;

/** 'PurgeFolders' query type */
export interface IPurgeFoldersQuery {
  params: IPurgeFoldersParams;
  result: IPurgeFoldersResult;
}

const purgeFoldersIR: any = {"usedParamSet":{},"params":[],"statement":"DELETE FROM folders WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM folders WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days'
 * ```
 */
export const purgeFolders = new PreparedQuery<IPurgeFoldersParams,IPurgeFoldersResult>(purgeFoldersIR);


