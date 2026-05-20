import { z, ZodSchema } from 'zod';
import { Response } from 'express';

// ─── Auth ────────────────────────────────────────────────────────────────────

export const RegisterBody = z.object({
  email: z.string().email({ message: 'valid email required' }),
  password: z.string().min(8, { message: 'password must be at least 8 characters' }),
});

export const LoginBody = z.object({
  email: z.string().email({ message: 'valid email required' }),
  password: z.string().min(1, { message: 'password required' }),
});

// ─── Upload ──────────────────────────────────────────────────────────────────

export const InitUploadBody = z.object({
  fileName: z.string().min(1, { message: 'fileName required' }),
  mimeType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().positive({ message: 'sizeBytes must be a positive integer' }),
  totalChunks: z.number().int().min(1).max(10000, { message: 'totalChunks must be between 1 and 10000' }),
  checksum: z.string().min(1, { message: 'checksum required' }),
});

export const CompleteUploadBody = z.object({
  uploadId: z.string().uuid({ message: 'uploadId must be a valid UUID' }),
  parts: z.array(
    z.object({
      partNumber: z.number().int().min(1),
      eTag: z.string().min(1),
    })
  ).min(1, { message: 'parts array must not be empty' }),
});

// ─── Sharing ─────────────────────────────────────────────────────────────────

const ShareRole = z.enum(['editor', 'viewer'], {
  error: 'role must be editor or viewer',
});

export const ShareUserBody = z.object({
  email: z.string().email({ message: 'valid email required' }),
  role: ShareRole,
});

export const ShareLinkBody = z.object({
  role: ShareRole,
});

// ─── Sync ────────────────────────────────────────────────────────────────────

export const SyncChangesQuery = z.object({
  since: z.iso.datetime({ message: 'since must be a valid ISO timestamp' }).optional(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type RegisterBodyType = z.infer<typeof RegisterBody>;
export type LoginBodyType = z.infer<typeof LoginBody>;
export type InitUploadBodyType = z.infer<typeof InitUploadBody>;
export type CompleteUploadBodyType = z.infer<typeof CompleteUploadBody>;
export type ShareUserBodyType = z.infer<typeof ShareUserBody>;
export type ShareLinkBodyType = z.infer<typeof ShareLinkBody>;
export type SyncChangesQueryType = z.infer<typeof SyncChangesQuery>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseBody<T>(
  schema: ZodSchema<T>,
  body: unknown,
  res: Response
): { ok: true; data: T } | { ok: false } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'invalid request body';
    res.status(400).json({ error: message });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<T>(
  schema: ZodSchema<T>,
  query: unknown,
  res: Response
): { ok: true; data: T } | { ok: false } {
  const result = schema.safeParse(query);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'invalid query params';
    res.status(400).json({ error: message });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}
