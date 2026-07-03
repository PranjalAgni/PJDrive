/** Types generated for queries found in "src/routes/folders.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'InsertFolder' parameters type */
export interface IInsertFolderParams {
  name?: string | null | void;
  ownerId?: string | null | void;
  parentId?: string | null | void;
}

/** 'InsertFolder' return type */
export interface IInsertFolderResult {
  created_at: Date | null;
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  updated_at: Date | null;
}

/** 'InsertFolder' query type */
export interface IInsertFolderQuery {
  params: IInsertFolderParams;
  result: IInsertFolderResult;
}

const insertFolderIR: any = {"usedParamSet":{"ownerId":true,"parentId":true,"name":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]},{"name":"parentId","required":false,"transform":{"type":"scalar"},"locs":[{"a":66,"b":74}]},{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":77,"b":81}]}],"statement":"INSERT INTO folders (owner_id, parent_id, name)\nVALUES (:ownerId, :parentId, :name)\nRETURNING id, owner_id, parent_id, name, created_at, updated_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO folders (owner_id, parent_id, name)
 * VALUES (:ownerId, :parentId, :name)
 * RETURNING id, owner_id, parent_id, name, created_at, updated_at
 * ```
 */
export const insertFolder = new PreparedQuery<IInsertFolderParams,IInsertFolderResult>(insertFolderIR);


/** 'GetFolderByIdAndOwner' parameters type */
export interface IGetFolderByIdAndOwnerParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetFolderByIdAndOwner' return type */
export interface IGetFolderByIdAndOwnerResult {
  created_at: Date | null;
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  updated_at: Date | null;
}

/** 'GetFolderByIdAndOwner' query type */
export interface IGetFolderByIdAndOwnerQuery {
  params: IGetFolderByIdAndOwnerParams;
  result: IGetFolderByIdAndOwnerResult;
}

const getFolderByIdAndOwnerIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":85,"b":93}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":110,"b":117}]}],"statement":"SELECT id, owner_id, parent_id, name, created_at, updated_at\nFROM folders\nWHERE id = :folderId AND owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, owner_id, parent_id, name, created_at, updated_at
 * FROM folders
 * WHERE id = :folderId AND owner_id = :ownerId
 * ```
 */
export const getFolderByIdAndOwner = new PreparedQuery<IGetFolderByIdAndOwnerParams,IGetFolderByIdAndOwnerResult>(getFolderByIdAndOwnerIR);


/** 'ListSubfoldersRoot' parameters type */
export interface IListSubfoldersRootParams {
  ownerId?: string | null | void;
}

/** 'ListSubfoldersRoot' return type */
export interface IListSubfoldersRootResult {
  created_at: Date | null;
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  updated_at: Date | null;
}

/** 'ListSubfoldersRoot' query type */
export interface IListSubfoldersRootQuery {
  params: IListSubfoldersRootParams;
  result: IListSubfoldersRootResult;
}

const listSubfoldersRootIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":91,"b":98}]}],"statement":"SELECT id, owner_id, parent_id, name, created_at, updated_at\nFROM folders\nWHERE owner_id = :ownerId AND parent_id IS NULL\nORDER BY name ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, owner_id, parent_id, name, created_at, updated_at
 * FROM folders
 * WHERE owner_id = :ownerId AND parent_id IS NULL
 * ORDER BY name ASC
 * ```
 */
export const listSubfoldersRoot = new PreparedQuery<IListSubfoldersRootParams,IListSubfoldersRootResult>(listSubfoldersRootIR);


/** 'ListSubfoldersInParent' parameters type */
export interface IListSubfoldersInParentParams {
  ownerId?: string | null | void;
  parentId?: string | null | void;
}

/** 'ListSubfoldersInParent' return type */
export interface IListSubfoldersInParentResult {
  created_at: Date | null;
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  updated_at: Date | null;
}

/** 'ListSubfoldersInParent' query type */
export interface IListSubfoldersInParentQuery {
  params: IListSubfoldersInParentParams;
  result: IListSubfoldersInParentResult;
}

const listSubfoldersInParentIR: any = {"usedParamSet":{"ownerId":true,"parentId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":91,"b":98}]},{"name":"parentId","required":false,"transform":{"type":"scalar"},"locs":[{"a":116,"b":124}]}],"statement":"SELECT id, owner_id, parent_id, name, created_at, updated_at\nFROM folders\nWHERE owner_id = :ownerId AND parent_id = :parentId\nORDER BY name ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, owner_id, parent_id, name, created_at, updated_at
 * FROM folders
 * WHERE owner_id = :ownerId AND parent_id = :parentId
 * ORDER BY name ASC
 * ```
 */
export const listSubfoldersInParent = new PreparedQuery<IListSubfoldersInParentParams,IListSubfoldersInParentResult>(listSubfoldersInParentIR);


/** 'ListAllFoldersByOwner' parameters type */
export interface IListAllFoldersByOwnerParams {
  ownerId?: string | null | void;
}

/** 'ListAllFoldersByOwner' return type */
export interface IListAllFoldersByOwnerResult {
  id: string;
  name: string;
  parent_id: string | null;
}

/** 'ListAllFoldersByOwner' query type */
export interface IListAllFoldersByOwnerQuery {
  params: IListAllFoldersByOwnerParams;
  result: IListAllFoldersByOwnerResult;
}

const listAllFoldersByOwnerIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":57,"b":64}]}],"statement":"SELECT id, parent_id, name\nFROM folders\nWHERE owner_id = :ownerId\nORDER BY name ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, parent_id, name
 * FROM folders
 * WHERE owner_id = :ownerId
 * ORDER BY name ASC
 * ```
 */
export const listAllFoldersByOwner = new PreparedQuery<IListAllFoldersByOwnerParams,IListAllFoldersByOwnerResult>(listAllFoldersByOwnerIR);


/** 'ListFilesInFolderRoot' parameters type */
export interface IListFilesInFolderRootParams {
  ownerId?: string | null | void;
}

/** 'ListFilesInFolderRoot' return type */
export interface IListFilesInFolderRootResult {
  checksum: string | null;
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'ListFilesInFolderRoot' query type */
export interface IListFilesInFolderRootQuery {
  params: IListFilesInFolderRootParams;
  result: IListFilesInFolderRootResult;
}

const listFilesInFolderRootIR: any = {"usedParamSet":{"ownerId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":112,"b":119}]}],"statement":"SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at\nFROM files\nWHERE owner_id = :ownerId AND folder_id IS NULL\nORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
 * FROM files
 * WHERE owner_id = :ownerId AND folder_id IS NULL
 * ORDER BY created_at DESC
 * ```
 */
export const listFilesInFolderRoot = new PreparedQuery<IListFilesInFolderRootParams,IListFilesInFolderRootResult>(listFilesInFolderRootIR);


/** 'ListFilesInFolder' parameters type */
export interface IListFilesInFolderParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'ListFilesInFolder' return type */
export interface IListFilesInFolderResult {
  checksum: string | null;
  created_at: Date | null;
  folder_id: string | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'ListFilesInFolder' query type */
export interface IListFilesInFolderQuery {
  params: IListFilesInFolderParams;
  result: IListFilesInFolderResult;
}

const listFilesInFolderIR: any = {"usedParamSet":{"ownerId":true,"folderId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":112,"b":119}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":137,"b":145}]}],"statement":"SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at\nFROM files\nWHERE owner_id = :ownerId AND folder_id = :folderId\nORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
 * FROM files
 * WHERE owner_id = :ownerId AND folder_id = :folderId
 * ORDER BY created_at DESC
 * ```
 */
export const listFilesInFolder = new PreparedQuery<IListFilesInFolderParams,IListFilesInFolderResult>(listFilesInFolderIR);


/** 'GetBreadcrumb' parameters type */
export interface IGetBreadcrumbParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetBreadcrumb' return type */
export interface IGetBreadcrumbResult {
  depth: number | null;
  id: string | null;
  name: string | null;
}

/** 'GetBreadcrumb' query type */
export interface IGetBreadcrumbQuery {
  params: IGetBreadcrumbParams;
  result: IGetBreadcrumbResult;
}

const getBreadcrumbIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":95,"b":103}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":120,"b":127}]}],"statement":"WITH RECURSIVE crumb AS (\n  SELECT id, parent_id, name, 0 AS depth\n  FROM folders\n  WHERE id = :folderId AND owner_id = :ownerId\n  UNION ALL\n  SELECT f.id, f.parent_id, f.name, c.depth + 1\n  FROM folders f\n  JOIN crumb c ON f.id = c.parent_id\n)\nSELECT id, name, depth FROM crumb ORDER BY depth DESC"};

/**
 * Query generated from SQL:
 * ```
 * WITH RECURSIVE crumb AS (
 *   SELECT id, parent_id, name, 0 AS depth
 *   FROM folders
 *   WHERE id = :folderId AND owner_id = :ownerId
 *   UNION ALL
 *   SELECT f.id, f.parent_id, f.name, c.depth + 1
 *   FROM folders f
 *   JOIN crumb c ON f.id = c.parent_id
 * )
 * SELECT id, name, depth FROM crumb ORDER BY depth DESC
 * ```
 */
export const getBreadcrumb = new PreparedQuery<IGetBreadcrumbParams,IGetBreadcrumbResult>(getBreadcrumbIR);


/** 'GetDescendantFolderIds' parameters type */
export interface IGetDescendantFolderIdsParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'GetDescendantFolderIds' return type */
export interface IGetDescendantFolderIdsResult {
  id: string | null;
}

/** 'GetDescendantFolderIds' query type */
export interface IGetDescendantFolderIdsQuery {
  params: IGetDescendantFolderIdsParams;
  result: IGetDescendantFolderIdsResult;
}

const getDescendantFolderIdsIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":72}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":89,"b":96}]}],"statement":"WITH RECURSIVE subtree AS (\n  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId\n  UNION ALL\n  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id\n)\nSELECT id FROM subtree"};

/**
 * Query generated from SQL:
 * ```
 * WITH RECURSIVE subtree AS (
 *   SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
 *   UNION ALL
 *   SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
 * )
 * SELECT id FROM subtree
 * ```
 */
export const getDescendantFolderIds = new PreparedQuery<IGetDescendantFolderIdsParams,IGetDescendantFolderIdsResult>(getDescendantFolderIdsIR);


/** 'UpdateFolder' parameters type */
export interface IUpdateFolderParams {
  folderId?: string | null | void;
  name?: string | null | void;
  ownerId?: string | null | void;
  parentId?: string | null | void;
  setParent?: boolean | null | void;
}

/** 'UpdateFolder' return type */
export interface IUpdateFolderResult {
  created_at: Date | null;
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  updated_at: Date | null;
}

/** 'UpdateFolder' query type */
export interface IUpdateFolderQuery {
  params: IUpdateFolderParams;
  result: IUpdateFolderResult;
}

const updateFolderIR: any = {"usedParamSet":{"name":true,"setParent":true,"parentId":true,"folderId":true,"ownerId":true},"params":[{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":39}]},{"name":"setParent","required":false,"transform":{"type":"scalar"},"locs":[{"a":75,"b":84}]},{"name":"parentId","required":false,"transform":{"type":"scalar"},"locs":[{"a":100,"b":108}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":164,"b":172}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":189,"b":196}]}],"statement":"UPDATE folders\nSET name = COALESCE(:name, name),\n    parent_id = CASE WHEN :setParent::boolean THEN :parentId ELSE parent_id END,\n    updated_at = NOW()\nWHERE id = :folderId AND owner_id = :ownerId\nRETURNING id, owner_id, parent_id, name, created_at, updated_at"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE folders
 * SET name = COALESCE(:name, name),
 *     parent_id = CASE WHEN :setParent::boolean THEN :parentId ELSE parent_id END,
 *     updated_at = NOW()
 * WHERE id = :folderId AND owner_id = :ownerId
 * RETURNING id, owner_id, parent_id, name, created_at, updated_at
 * ```
 */
export const updateFolder = new PreparedQuery<IUpdateFolderParams,IUpdateFolderResult>(updateFolderIR);


/** 'DeleteFolderCascade' parameters type */
export interface IDeleteFolderCascadeParams {
  folderId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'DeleteFolderCascade' return type */
export type IDeleteFolderCascadeResult = void;

/** 'DeleteFolderCascade' query type */
export interface IDeleteFolderCascadeQuery {
  params: IDeleteFolderCascadeParams;
  result: IDeleteFolderCascadeResult;
}

const deleteFolderCascadeIR: any = {"usedParamSet":{"folderId":true,"ownerId":true},"params":[{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":31,"b":39}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]}],"statement":"DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId
 * ```
 */
export const deleteFolderCascade = new PreparedQuery<IDeleteFolderCascadeParams,IDeleteFolderCascadeResult>(deleteFolderCascadeIR);


