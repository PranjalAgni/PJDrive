/** Types generated for queries found in "src/routes/auth.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'InsertUser' parameters type */
export interface IInsertUserParams {
  email?: string | null | void;
  passwordHash?: string | null | void;
}

/** 'InsertUser' return type */
export interface IInsertUserResult {
  created_at: Date | null;
  email: string;
  id: string;
}

/** 'InsertUser' query type */
export interface IInsertUserQuery {
  params: IInsertUserParams;
  result: IInsertUserResult;
}

const insertUserIR: any = {"usedParamSet":{"email":true,"passwordHash":true},"params":[{"name":"email","required":false,"transform":{"type":"scalar"},"locs":[{"a":49,"b":54}]},{"name":"passwordHash","required":false,"transform":{"type":"scalar"},"locs":[{"a":57,"b":69}]}],"statement":"INSERT INTO users (email, password_hash)\nVALUES (:email, :passwordHash)\nRETURNING id, email, created_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO users (email, password_hash)
 * VALUES (:email, :passwordHash)
 * RETURNING id, email, created_at
 * ```
 */
export const insertUser = new PreparedQuery<IInsertUserParams,IInsertUserResult>(insertUserIR);


/** 'GetUserByEmail' parameters type */
export interface IGetUserByEmailParams {
  email?: string | null | void;
}

/** 'GetUserByEmail' return type */
export interface IGetUserByEmailResult {
  email: string;
  id: string;
  password_hash: string;
}

/** 'GetUserByEmail' query type */
export interface IGetUserByEmailQuery {
  params: IGetUserByEmailParams;
  result: IGetUserByEmailResult;
}

const getUserByEmailIR: any = {"usedParamSet":{"email":true},"params":[{"name":"email","required":false,"transform":{"type":"scalar"},"locs":[{"a":57,"b":62}]}],"statement":"SELECT id, email, password_hash\nFROM users\nWHERE email = :email"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, email, password_hash
 * FROM users
 * WHERE email = :email
 * ```
 */
export const getUserByEmail = new PreparedQuery<IGetUserByEmailParams,IGetUserByEmailResult>(getUserByEmailIR);


