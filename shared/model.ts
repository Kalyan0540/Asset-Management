import { z } from 'zod';

export const names = z
  .array(z.string().trim().min(1).max(80))
  .max(100)
  .transform((v) => [...new Set(v)]);
export const relationSchema = z
  .object({ target: z.string().uuid(), label: z.string().trim().min(1).max(80) })
  .strict();
export const patchSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(250).optional(),
    description: z.string().max(20000).optional(),
    tags: names.optional(),
    collections: z.array(z.string().uuid()).max(100).optional(),
    relations: z.array(relationSchema).max(500).optional(),
    body: z.string().max(1_000_000).optional(),
    favorite: z.boolean().optional(),
    trashed: z.boolean().optional(),
  })
  .strict();
export const noteSchema = z
  .object({ title: z.string().trim().min(1).max(250), body: z.string().max(1_000_000).default('') })
  .strict();
export type Item = {
  id: string;
  kind: 'asset' | 'note';
  title: string;
  description: string;
  tags: string[];
  collections: string[];
  relations: z.infer<typeof relationSchema>[];
  body: string;
  favorite: boolean;
  trashed: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  filename: string;
  mime: string;
  size: number;
  hash: string | null;
  source?: { provider: 'eagle'; id: string; metadata: Record<string, unknown> };
};
export type Collection = { id: string; name: string };
export type LibrarySnapshot = { items: Item[]; collections: Collection[] };
export type HistoryEntry = { revision: number; at: string; action: string; actor: string };
export type ItemPatch = z.input<typeof patchSchema>;
