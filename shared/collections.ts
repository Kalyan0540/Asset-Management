import type { Collection } from './model.ts';

export function descendantIds(collections: Collection[], id: string) {
  const found = new Set([id]);
  const children = new Map<string, string[]>();
  for (const collection of collections) {
    if (!collection.parentId) continue;
    const bucket = children.get(collection.parentId) ?? [];
    bucket.push(collection.id);
    children.set(collection.parentId, bucket);
  }
  for (const current of found) {
    for (const child of children.get(current) ?? []) found.add(child);
  }
  return found;
}
