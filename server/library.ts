import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  noteSchema,
  patchSchema,
  type Item,
  type ItemPatch,
  type Collection,
  type HistoryEntry,
} from '../shared/model.ts';

export class LibraryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Library {
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'blobs'), { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'staging'), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(root, 'catalog.sqlite'));
    chmodSync(join(root, 'catalog.sqlite'), 0o600);
    const hasSchema = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_info'")
      .get();
    if (
      hasSchema &&
      (this.db.prepare('SELECT version FROM schema_info').get() as { version: number } | undefined)
        ?.version !== 1
    ) {
      this.db.close();
      throw new Error('Unsupported library schema. Open with a compatible application version.');
    }
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_info(version INTEGER NOT NULL);
      INSERT INTO schema_info SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_info);
      CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS history(item_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
        action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(item_id, revision));`);
    if (
      (this.db.prepare('SELECT version FROM schema_info').get() as { version: number }).version !==
      1
    ) {
      this.db.close();
      throw new Error('Unsupported library schema. Open with a compatible application version.');
    }
  }
  close() {
    this.db.close();
  }
  list(): Item[] {
    return (
      this.db.prepare('SELECT data FROM items ORDER BY rowid DESC').all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  get(id: string): Item {
    const row = this.db.prepare('SELECT data FROM items WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new LibraryError(404, 'Item not found');
    return JSON.parse(row.data);
  }
  collections(): Collection[] {
    return this.db.prepare('SELECT id,name FROM collections ORDER BY name').all() as Collection[];
  }
  createCollection(name: string) {
    const existing = this.collections().find((c) => c.name === name);
    if (existing) return existing;
    const collection = { id: randomUUID(), name };
    this.db.prepare('INSERT INTO collections(id,name) VALUES(?,?)').run(collection.id, name);
    return collection;
  }
  private save(item: Item, action: string, actor: string) {
    this.db
      .prepare(
        'INSERT INTO items(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(item.id, JSON.stringify(item));
    this.db
      .prepare('INSERT INTO history VALUES(?,?,?,?,?,?)')
      .run(item.id, item.revision, JSON.stringify(item), action, actor, item.updatedAt);
    return item;
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  private base(title: string): Item {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      kind: 'note',
      title,
      description: '',
      tags: [],
      collections: [],
      relations: [],
      body: '',
      favorite: false,
      trashed: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      filename: '',
      mime: 'text/markdown',
      size: 0,
      hash: null,
    };
  }
  createNote(input: unknown, actor = 'ui') {
    const { title, body } = noteSchema.parse(input);
    return this.transaction(() =>
      this.save({ ...this.base(title), body, size: Buffer.byteLength(body) }, 'create note', actor),
    );
  }
  importAsset(data: { filename: string; mime: string; size: number; hash: string }, actor = 'ui') {
    // Deduplicate bytes, not logical records: each import may carry different context.
    return this.transaction(() =>
      this.save({ ...this.base(data.filename), ...data, kind: 'asset' }, 'import', actor),
    );
  }
  importEagleItem(data: Omit<Item, 'id' | 'revision'>) {
    return this.transaction(() =>
      this.save({ ...data, id: randomUUID(), revision: 1 }, 'import Eagle', 'eagle-import'),
    );
  }
  patch(id: string, input: ItemPatch, actor = 'ui') {
    return this.transaction(() => this.update(id, input, actor));
  }
  private update(id: string, input: ItemPatch, actor: string) {
    const { expectedRevision, ...changes } = patchSchema.parse(input);
    const current = this.get(id);
    if (current.revision !== expectedRevision)
      throw new LibraryError(
        409,
        'This item changed elsewhere. Reload it before saving; your draft has been kept.',
      );
    if (changes.body !== undefined && current.kind !== 'note')
      throw new LibraryError(400, 'Only notes have editable bodies');
    for (const collection of changes.collections ?? []) {
      if (!this.db.prepare('SELECT id FROM collections WHERE id=?').get(collection))
        throw new LibraryError(400, 'Unknown collection');
    }
    for (const relation of changes.relations ?? []) {
      if (relation.target === id) throw new LibraryError(400, 'An item cannot relate to itself');
      this.get(relation.target);
    }
    const next = {
      ...current,
      ...changes,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (next.kind === 'note') next.size = Buffer.byteLength(next.body);
    return this.save(
      next,
      changes.trashed === true ? 'trash' : changes.trashed === false ? 'restore' : 'edit',
      actor,
    );
  }
  batch(changes: { id: string; patch: ItemPatch }[], actor = 'ui') {
    if (new Set(changes.map((c) => c.id)).size !== changes.length)
      throw new LibraryError(400, 'An item can only appear once in a batch.');
    return this.transaction(() =>
      changes.map((change) => this.update(change.id, change.patch, actor)),
    );
  }
  applyAi(id: string, item: Item, patch: ItemPatch, job: unknown) {
    return this.transaction(() => {
      const updated = this.update(item.id, patch, 'ai-reviewed');
      this.db.prepare('UPDATE ai_jobs SET data=? WHERE id=?').run(JSON.stringify(job), id);
      return updated;
    });
  }
  history(id: string): HistoryEntry[] {
    this.get(id);
    return this.db
      .prepare(
        'SELECT revision,at,action,actor FROM history WHERE item_id=? ORDER BY revision DESC',
      )
      .all(id) as HistoryEntry[];
  }
  restore(id: string, revision: number, expectedRevision: number, actor = 'ui') {
    const row = this.db
      .prepare('SELECT data FROM history WHERE item_id=? AND revision=?')
      .get(id, revision) as { data: string } | undefined;
    if (!row) throw new LibraryError(404, 'Revision not found');
    const old: Item = JSON.parse(row.data);
    return this.patch(
      id,
      {
        expectedRevision,
        title: old.title,
        description: old.description,
        tags: old.tags,
        collections: old.collections,
        relations: old.relations,
        ...(old.kind === 'note' ? { body: old.body } : {}),
        favorite: old.favorite,
        trashed: old.trashed,
      },
      actor,
    );
  }
}
