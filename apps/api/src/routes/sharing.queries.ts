/** Types generated for queries found in "src/routes/sharing.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'CheckFileOwnership' parameters type */
export interface ICheckFileOwnershipParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
}

/** 'CheckFileOwnership' return type */
export interface ICheckFileOwnershipResult {
  id: string;
}

/** 'CheckFileOwnership' query type */
export interface ICheckFileOwnershipQuery {
  params: ICheckFileOwnershipParams;
  result: ICheckFileOwnershipResult;
}

const checkFileOwnershipIR: any = {"usedParamSet":{"fileId":true,"ownerId":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":32,"b":38}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":55,"b":62}]}],"statement":"SELECT id\nFROM files\nWHERE id = :fileId AND owner_id = :ownerId"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id
 * FROM files
 * WHERE id = :fileId AND owner_id = :ownerId
 * ```
 */
export const checkFileOwnership = new PreparedQuery<ICheckFileOwnershipParams,ICheckFileOwnershipResult>(checkFileOwnershipIR);


/** 'GetUserByEmail' parameters type */
export interface IGetUserByEmailParams {
  email?: string | null | void;
}

/** 'GetUserByEmail' return type */
export interface IGetUserByEmailResult {
  id: string;
}

/** 'GetUserByEmail' query type */
export interface IGetUserByEmailQuery {
  params: IGetUserByEmailParams;
  result: IGetUserByEmailResult;
}

const getUserByEmailIR: any = {"usedParamSet":{"email":true},"params":[{"name":"email","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":40}]}],"statement":"SELECT id\nFROM users\nWHERE email = :email"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id
 * FROM users
 * WHERE email = :email
 * ```
 */
export const getUserByEmail = new PreparedQuery<IGetUserByEmailParams,IGetUserByEmailResult>(getUserByEmailIR);


/** 'InsertUserShare' parameters type */
export interface IInsertUserShareParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
  role?: string | null | void;
  sharedWith?: string | null | void;
}

/** 'InsertUserShare' return type */
export interface IInsertUserShareResult {
  created_at: Date | null;
  expires_at: Date | null;
  file_id: string;
  id: string;
  owner_id: string;
  role: string;
  share_token: string | null;
  share_type: string;
  shared_with: string | null;
}

/** 'InsertUserShare' query type */
export interface IInsertUserShareQuery {
  params: IInsertUserShareParams;
  result: IInsertUserShareResult;
}

const insertUserShareIR: any = {"usedParamSet":{"fileId":true,"ownerId":true,"sharedWith":true,"role":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":84,"b":90}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":93,"b":100}]},{"name":"sharedWith","required":false,"transform":{"type":"scalar"},"locs":[{"a":103,"b":113}]},{"name":"role","required":false,"transform":{"type":"scalar"},"locs":[{"a":124,"b":128}]}],"statement":"INSERT INTO shared_files (file_id, owner_id, shared_with, share_type, role)\nVALUES (:fileId, :ownerId, :sharedWith, 'user', :role)\nON CONFLICT DO NOTHING\nRETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO shared_files (file_id, owner_id, shared_with, share_type, role)
 * VALUES (:fileId, :ownerId, :sharedWith, 'user', :role)
 * ON CONFLICT DO NOTHING
 * RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at
 * ```
 */
export const insertUserShare = new PreparedQuery<IInsertUserShareParams,IInsertUserShareResult>(insertUserShareIR);


/** 'GetExistingUserShare' parameters type */
export interface IGetExistingUserShareParams {
  fileId?: string | null | void;
  sharedWith?: string | null | void;
}

/** 'GetExistingUserShare' return type */
export interface IGetExistingUserShareResult {
  created_at: Date | null;
  expires_at: Date | null;
  file_id: string;
  id: string;
  owner_id: string;
  role: string;
  share_token: string | null;
  share_type: string;
  shared_with: string | null;
}

/** 'GetExistingUserShare' query type */
export interface IGetExistingUserShareQuery {
  params: IGetExistingUserShareParams;
  result: IGetExistingUserShareResult;
}

const getExistingUserShareIR: any = {"usedParamSet":{"fileId":true,"sharedWith":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":131,"b":137}]},{"name":"sharedWith","required":false,"transform":{"type":"scalar"},"locs":[{"a":157,"b":167}]}],"statement":"SELECT id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at\nFROM shared_files\nWHERE file_id = :fileId AND shared_with = :sharedWith AND share_type = 'user'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at
 * FROM shared_files
 * WHERE file_id = :fileId AND shared_with = :sharedWith AND share_type = 'user'
 * ```
 */
export const getExistingUserShare = new PreparedQuery<IGetExistingUserShareParams,IGetExistingUserShareResult>(getExistingUserShareIR);


/** 'InsertLinkShare' parameters type */
export interface IInsertLinkShareParams {
  fileId?: string | null | void;
  ownerId?: string | null | void;
  role?: string | null | void;
  shareToken?: string | null | void;
}

/** 'InsertLinkShare' return type */
export interface IInsertLinkShareResult {
  created_at: Date | null;
  expires_at: Date | null;
  file_id: string;
  id: string;
  owner_id: string;
  role: string;
  share_token: string | null;
  share_type: string;
  shared_with: string | null;
}

/** 'InsertLinkShare' query type */
export interface IInsertLinkShareQuery {
  params: IInsertLinkShareParams;
  result: IInsertLinkShareResult;
}

const insertLinkShareIR: any = {"usedParamSet":{"fileId":true,"ownerId":true,"role":true,"shareToken":true},"params":[{"name":"fileId","required":false,"transform":{"type":"scalar"},"locs":[{"a":84,"b":90}]},{"name":"ownerId","required":false,"transform":{"type":"scalar"},"locs":[{"a":93,"b":100}]},{"name":"role","required":false,"transform":{"type":"scalar"},"locs":[{"a":111,"b":115}]},{"name":"shareToken","required":false,"transform":{"type":"scalar"},"locs":[{"a":118,"b":128}]}],"statement":"INSERT INTO shared_files (file_id, owner_id, share_type, role, share_token)\nVALUES (:fileId, :ownerId, 'link', :role, :shareToken)\nRETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO shared_files (file_id, owner_id, share_type, role, share_token)
 * VALUES (:fileId, :ownerId, 'link', :role, :shareToken)
 * RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at
 * ```
 */
export const insertLinkShare = new PreparedQuery<IInsertLinkShareParams,IInsertLinkShareResult>(insertLinkShareIR);


