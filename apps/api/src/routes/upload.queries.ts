/** Types generated for queries found in "src/routes/upload.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type NumberOrString = number | string;

/** 'InsertFile' parameters type */
export interface IInsertFileParams {
  checksum?: string | null | void;
  folderId?: string | null | void;
  mimeType?: string | null | void;
  name?: string | null | void;
  ownerId?: string | null | void;
  sizeBytes?: NumberOrString | null | void;
  storageKey?: string | null | void;
}

/** 'InsertFile' return type */
export interface IInsertFileResult {
  id: string;
}

/** 'InsertFile' query type */
export interface IInsertFileQuery {
  params: IInsertFileParams;
  result: IInsertFileResult;
}

const insertFileIR: any = {"usedParamSet":{"ownerId":true,"name":true,"mimeType":true,"sizeBytes":true,"storageKey":true,"checksum":true,"folderId":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":100,"b":107}]},{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":110,"b":114}]},{"name":"mimeType","required":false,"transform":{"type":"scalar"},"locs":[{"a":117,"b":125}]},{"name":"sizeBytes","required":false,"transform":{"type":"scalar"},"locs":[{"a":128,"b":137}]},{"name":"storageKey","required":false,"transform":{"type":"scalar"},"locs":[{"a":140,"b":150}]},{"name":"checksum","required":false,"transform":{"type":"scalar"},"locs":[{"a":153,"b":161}]},{"name":"folderId","required":false,"transform":{"type":"scalar"},"locs":[{"a":164,"b":172}]}],"statement":"INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum, folder_id)\nVALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum, :folderId)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum, folder_id)
 * VALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum, :folderId)
 * RETURNING id
 * ```
 */
export const insertFile = new PreparedQuery<IInsertFileParams,IInsertFileResult>(insertFileIR);


/** 'InsertUpload' parameters type */
export interface IInsertUploadParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
  totalChunks?: number | null | void;
  uploadId?: string | null | void;
}

/** 'InsertUpload' return type */
export interface IInsertUploadResult {
  id: string;
}

/** 'InsertUpload' query type */
export interface IInsertUploadQuery {
  params: IInsertUploadParams;
  result: IInsertUploadResult;
}

const insertUploadIR: any = {"usedParamSet":{"fileId":true,"ownerId":true,"uploadId":true,"totalChunks":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":73,"b":79}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":82,"b":89}]},{"name":"uploadId","required":false,"transform":{"type":"scalar"},"locs":[{"a":92,"b":100}]},{"name":"totalChunks","required":false,"transform":{"type":"scalar"},"locs":[{"a":103,"b":114}]}],"statement":"INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks)\nVALUES (:fileId, :ownerId, :uploadId, :totalChunks)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks)
 * VALUES (:fileId, :ownerId, :uploadId, :totalChunks)
 * RETURNING id
 * ```
 */
export const insertUpload = new PreparedQuery<IInsertUploadParams,IInsertUploadResult>(insertUploadIR);


/** 'GetUploadStatus' parameters type */
export interface IGetUploadStatusParams {
  ownerId?: string | null | void;
  uploadId?: string | null | void;
}

/** 'GetUploadStatus' return type */
export interface IGetUploadStatusResult {
  total_chunks: number;
  uploaded_chunks: Json | null;
}

/** 'GetUploadStatus' query type */
export interface IGetUploadStatusQuery {
  params: IGetUploadStatusParams;
  result: IGetUploadStatusResult;
}

const getUploadStatusIR: any = {"usedParamSet":{"uploadId":true,"ownerId":true},"params":[{"name":"uploadId","required":false,"transform":{"type":"scalar"},"locs":[{"a":61,"b":69}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":86,"b":93}]}],"statement":"SELECT uploaded_chunks, total_chunks\nFROM uploads\nWHERE id = :uploadId AND owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT uploaded_chunks, total_chunks
 * FROM uploads
 * WHERE id = :uploadId AND owner_id = :ownerId
 * ```
 */
export const getUploadStatus = new PreparedQuery<IGetUploadStatusParams,IGetUploadStatusResult>(getUploadStatusIR);


/** 'GetInProgressUpload' parameters type */
export interface IGetInProgressUploadParams {
  checksum?: string | null | void;
  ownerId?: string | null | void;
  totalChunks?: number | null | void;
}

/** 'GetInProgressUpload' return type */
export interface IGetInProgressUploadResult {
  file_id: string | null;
  id: string;
  storage_key: string;
  upload_id: string;
}

/** 'GetInProgressUpload' query type */
export interface IGetInProgressUploadQuery {
  params: IGetInProgressUploadParams;
  result: IGetInProgressUploadResult;
}

const getInProgressUploadIR: any = {"usedParamSet":{"ownerId":true,"checksum":true,"totalChunks":true},"params":[{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":118,"b":125}]},{"name":"checksum","required":false,"transform":{"type":"scalar"},"locs":[{"a":144,"b":152}]},{"name":"totalChunks","required":false,"transform":{"type":"scalar"},"locs":[{"a":177,"b":188}]}],"statement":"SELECT u.id, u.upload_id, u.file_id, f.storage_key\nFROM uploads u\nJOIN files f ON f.id = u.file_id\nWHERE u.owner_id = :ownerId AND f.checksum = :checksum\n  AND u.total_chunks = :totalChunks AND u.status = 'in_progress'\nORDER BY u.created_at DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT u.id, u.upload_id, u.file_id, f.storage_key
 * FROM uploads u
 * JOIN files f ON f.id = u.file_id
 * WHERE u.owner_id = :ownerId AND f.checksum = :checksum
 *   AND u.total_chunks = :totalChunks AND u.status = 'in_progress'
 * ORDER BY u.created_at DESC
 * LIMIT 1
 * ```
 */
export const getInProgressUpload = new PreparedQuery<IGetInProgressUploadParams,IGetInProgressUploadResult>(getInProgressUploadIR);


/** 'GetUploadWithFile' parameters type */
export interface IGetUploadWithFileParams {
  ownerId?: string | null | void;
  uploadId?: string | null | void;
}

/** 'GetUploadWithFile' return type */
export interface IGetUploadWithFileResult {
  file_id: string | null;
  id: string;
  status: string | null;
  storage_key: string;
  total_chunks: number;
  upload_id: string;
  uploaded_chunks: Json | null;
}

/** 'GetUploadWithFile' query type */
export interface IGetUploadWithFileQuery {
  params: IGetUploadWithFileParams;
  result: IGetUploadWithFileResult;
}

const getUploadWithFileIR: any = {"usedParamSet":{"uploadId":true,"ownerId":true},"params":[{"name":"uploadId","required":false,"transform":{"type":"scalar"},"locs":[{"a":157,"b":165}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":184,"b":191}]}],"statement":"SELECT u.id, u.file_id, u.upload_id, u.total_chunks, u.uploaded_chunks, u.status, f.storage_key\nFROM uploads u\nJOIN files f ON f.id = u.file_id\nWHERE u.id = :uploadId AND u.owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT u.id, u.file_id, u.upload_id, u.total_chunks, u.uploaded_chunks, u.status, f.storage_key
 * FROM uploads u
 * JOIN files f ON f.id = u.file_id
 * WHERE u.id = :uploadId AND u.owner_id = :ownerId
 * ```
 */
export const getUploadWithFile = new PreparedQuery<IGetUploadWithFileParams,IGetUploadWithFileResult>(getUploadWithFileIR);


/** 'CompleteUpload' parameters type */
export interface ICompleteUploadParams {
  uploadId?: string | null | void;
}

/** 'CompleteUpload' return type */
export type ICompleteUploadResult = void;

/** 'CompleteUpload' query type */
export interface ICompleteUploadQuery {
  params: ICompleteUploadParams;
  result: ICompleteUploadResult;
}

const completeUploadIR: any = {"usedParamSet":{"uploadId":true},"params":[{"name":"uploadId","required":false,"transform":{"type":"scalar"},"locs":[{"a":50,"b":58}]}],"statement":"UPDATE uploads\nSET status = 'complete'\nWHERE id = :uploadId"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE uploads
 * SET status = 'complete'
 * WHERE id = :uploadId
 * ```
 */
export const completeUpload = new PreparedQuery<ICompleteUploadParams,ICompleteUploadResult>(completeUploadIR);


/** 'InsertSyncLogCreated' parameters type */
export interface IInsertSyncLogCreatedParams {
  fileId?: string | null | void;
  userId?: string | null | void;
}

/** 'InsertSyncLogCreated' return type */
export type IInsertSyncLogCreatedResult = void;

/** 'InsertSyncLogCreated' query type */
export interface IInsertSyncLogCreatedQuery {
  params: IInsertSyncLogCreatedParams;
  result: IInsertSyncLogCreatedResult;
}

const insertSyncLogCreatedIR: any = {"usedParamSet":{"userId":true,"fileId":true},"params":[{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]},{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":75}]}],"statement":"INSERT INTO sync_log (user_id, file_id, event_type)\nVALUES (:userId, :fileId, 'created')"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO sync_log (user_id, file_id, event_type)
 * VALUES (:userId, :fileId, 'created')
 * ```
 */
export const insertSyncLogCreated = new PreparedQuery<IInsertSyncLogCreatedParams,IInsertSyncLogCreatedResult>(insertSyncLogCreatedIR);


/** 'GetFileById' parameters type */
export interface IGetFileByIdParams {
  fileId?: string | null | void;
}

/** 'GetFileById' return type */
export interface IGetFileByIdResult {
  checksum: string | null;
  created_at: Date | null;
  id: string;
  mime_type: string | null;
  name: string;
  size_bytes: string | null;
  updated_at: Date | null;
}

/** 'GetFileById' query type */
export interface IGetFileByIdQuery {
  params: IGetFileByIdParams;
  result: IGetFileByIdResult;
}

const getFileByIdIR: any = {"usedParamSet":{"fileId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":95,"b":101}]}],"statement":"SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at\nFROM files\nWHERE id = :fileId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at
 * FROM files
 * WHERE id = :fileId
 * ```
 */
export const getFileById = new PreparedQuery<IGetFileByIdParams,IGetFileByIdResult>(getFileByIdIR);


