import { useEffect, useRef, useState } from 'react';
import { patchSchema, type Item, type ItemPatch } from '../shared/model';

type Fields = Omit<ItemPatch, 'expectedRevision' | 'trashed'>;
type Draft = { revision: number; changes: Fields; base: Fields };
export type Drafts = Record<string, Draft>;
const key = 'atlas.pending-edits';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useAutosave(
  loadItem: (id: string) => Promise<Item>,
  writeItem: (id: string, patch: ItemPatch) => Promise<Item>,
  onSaved: (item: Item) => void,
) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const [problems, setProblems] = useState<Record<string, { message: string; conflict: boolean }>>(
    {},
  );
  const state = useRef<Drafts>({});
  const timers = useRef(new Map<string, number>());
  const running = useRef(new Set<string>());
  const callbacks = useRef({ loadItem, writeItem, onSaved });
  callbacks.current = { loadItem, writeItem, onSaved };

  function saveDrafts(next: Drafts) {
    state.current = next;
    setDrafts(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Browser storage can be full. */
    }
    void window.atlasDesktop?.writeDrafts?.(next).catch(() => {});
  }

  function failure(id: string, message: string, conflict = false) {
    setProblems((all) => ({ ...all, [id]: { message, conflict } }));
  }

  function clearFailure(id: string) {
    setProblems((all) => {
      if (!all[id]) return all;
      const next = { ...all };
      delete next[id];
      return next;
    });
  }

  function schedule(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      window.setTimeout(() => void flush(id), 450),
    );
  }

  async function flush(id: string, overwrite = false) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const draft = state.current[id];
    if (!draft || running.current.has(id)) return;
    const parsed = patchSchema.safeParse({ expectedRevision: draft.revision, ...draft.changes });
    if (!parsed.success) {
      failure(id, 'Check the title, tags, or link before Atlas can save these edits.');
      return;
    }
    running.current.add(id);
    try {
      const saved = await writeWithRevision(id, draft, parsed.data, overwrite);
      const latest = state.current[id];
      if (latest !== draft && latest) {
        const remaining = Object.fromEntries(
          (Object.keys(latest.changes) as (keyof Fields)[])
            .filter((field) => !same(latest.changes[field], draft.changes[field]))
            .map((field) => [field, latest.changes[field]]),
        ) as Fields;
        const base = Object.fromEntries(
          Object.keys(remaining).map((field) => [field, saved[field as keyof Fields]]),
        );
        if (Object.keys(remaining).length) {
          saveDrafts({
            ...state.current,
            [id]: { revision: saved.revision, changes: remaining, base },
          });
          schedule(id);
        } else discard(id);
      } else discard(id);
      callbacks.current.onSaved(saved);
    } catch (error) {
      const conflict = (error as Error & { status?: number }).status === 409;
      failure(
        id,
        conflict
          ? 'This item was edited elsewhere. Your draft is still available.'
          : (error as Error).message,
        conflict,
      );
      if (state.current[id] !== draft) schedule(id);
    } finally {
      running.current.delete(id);
    }
  }

  async function writeWithRevision(id: string, draft: Draft, patch: ItemPatch, overwrite: boolean) {
    const { loadItem, writeItem } = callbacks.current;
    try {
      if (!overwrite) return await writeItem(id, patch);
    } catch (error) {
      if ((error as Error & { status?: number }).status !== 409) throw error;
    }
    const current = await loadItem(id);
    const fields = Object.keys(draft.changes) as (keyof Fields)[];
    if (
      !overwrite &&
      fields.some(
        (field) => !same(current[field], draft.base[field]) && !same(current[field], patch[field]),
      )
    )
      throw Object.assign(new Error('This item was edited elsewhere.'), { status: 409 });
    if (fields.every((field) => same(current[field], patch[field]))) return current;
    return writeItem(id, { ...patch, expectedRevision: current.revision });
  }

  function discard(id: string) {
    const next = { ...state.current };
    delete next[id];
    saveDrafts(next);
    clearFailure(id);
  }

  function change(item: Item, fields: Fields) {
    const previous = state.current[item.id];
    const base = { ...previous?.base };
    for (const field of Object.keys(fields) as (keyof Fields)[]) {
      if (!(field in base) && !(field in (previous?.changes ?? {})))
        Object.assign(base, { [field]: item[field] });
    }
    saveDrafts({
      ...state.current,
      [item.id]: {
        revision: previous?.revision ?? item.revision,
        base,
        changes: { ...previous?.changes, ...fields },
      },
    });
    clearFailure(item.id);
    schedule(item.id);
  }

  useEffect(() => {
    let live = true;
    async function recover() {
      const native = await window.atlasDesktop?.readDrafts?.();
      const saved = native ?? (JSON.parse(localStorage.getItem(key) ?? '{}') as Drafts);
      if (!live) return;
      const next = { ...saved, ...state.current };
      if (!Object.keys(next).length) return;
      state.current = next;
      setDrafts(next);
      for (const id of Object.keys(next)) schedule(id);
    }
    void recover().catch(() => {});
    const queued = timers.current;
    return () => {
      live = false;
      for (const timer of queued.values()) clearTimeout(timer);
    };
  }, []);

  async function useSaved(id: string) {
    try {
      const latest = await callbacks.current.loadItem(id);
      discard(id);
      callbacks.current.onSaved(latest);
    } catch (error) {
      failure(id, (error as Error).message, true);
    }
  }

  return { drafts, problems, change, flush, useSaved };
}
