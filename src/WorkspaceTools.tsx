import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen, Plus, Search, X } from 'lucide-react';
import {
  filterFields,
  matchesSmartFolder,
  type FilterRule,
  type SmartFolder,
  type VisualInfo,
} from '../shared/filters.ts';
import type { Collection, Item } from '../shared/model.ts';

declare global {
  interface Window {
    atlasDesktop?: {
      appearance: () => Promise<'system' | 'light' | 'dark'>;
      setAppearance: (value: 'system' | 'light' | 'dark') => Promise<void>;
      libraries: () => Promise<{ active: string; entries: { path: string; name: string }[] }>;
      libraryAction: (
        action: 'open' | 'new' | 'recent' | 'reveal',
        path?: string,
      ) => Promise<unknown>;
      itemAction: (id: string, action: 'open-copy' | 'reveal') => Promise<void>;
      exportOriginals: (ids: string[]) => Promise<{ count: number; skipped: string[] }>;
    };
  }
}
export function LibraryPicker({ onError }: { onError: (message: string) => void }) {
  const [data, setData] =
    useState<Awaited<ReturnType<NonNullable<Window['atlasDesktop']>['libraries']>>>();
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    window.atlasDesktop
      ?.libraries()
      .then(setData)
      .catch(() => {});
  }, []);
  async function act(action: 'open' | 'new' | 'recent' | 'reveal', path?: string) {
    try {
      const result = await window.atlasDesktop?.libraryAction(action, path);
      if (action === 'reveal' && typeof result === 'string' && result) onError(result);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <details
      className="library-picker"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          ref.current?.removeAttribute('open');
          ref.current?.querySelector('summary')?.focus();
        }
      }}
    >
      <summary>
        <FolderOpen size={17} />
        <strong>
          {data?.entries.find((l) => l.path === data.active)?.name ?? 'Personal library'}
        </strong>
        <ChevronDown size={14} />
      </summary>
      <div className="library-popover">
        {data ? (
          <>
            <input
              aria-label="Find a library"
              value={query}
              placeholder="Find a library…"
              onChange={(e) => setQuery(e.target.value)}
            />
            {data.entries
              .filter((l) => `${l.name} ${l.path}`.toLowerCase().includes(query.toLowerCase()))
              .map((l) => (
                <button
                  type="button"
                  key={l.path}
                  onClick={() => void act('recent', l.path)}
                  aria-current={l.path === data.active ? 'true' : undefined}
                >
                  <strong>{l.name}</strong>
                  <small title={l.path}>{l.path}</small>
                </button>
              ))}
            <button type="button" onClick={() => void act('new')}>
              Create library…
            </button>
            <button type="button" onClick={() => void act('open')}>
              Open library…
            </button>
            <button type="button" onClick={() => void act('reveal')}>
              Show library folder
            </button>
          </>
        ) : (
          <p>
            Atlas stores imports in the active library. The desktop app can open and reveal library
            folders.
          </p>
        )}
      </div>
    </details>
  );
}
const fieldLabels: Record<FilterRule['field'], string> = {
  name: 'Name',
  tag: 'Tags',
  folder: 'Folders',
  type: 'Types',
  rating: 'Rating',
  shape: 'Shape',
  color: 'Color',
};
const newRule = (field: FilterRule['field']): FilterRule => ({
  field,
  operator: field === 'name' ? 'contains' : 'is',
  value: '',
});
function RuleValue({
  rule,
  onChange,
  collections,
  tags,
}: {
  rule: FilterRule;
  onChange: (value: string) => void;
  collections: Collection[];
  tags: string[];
}) {
  const options =
    rule.field === 'folder'
      ? collections.map((c) => ({ value: c.id, label: c.name }))
      : rule.field === 'tag'
        ? tags.map((tag) => ({ value: tag, label: tag }))
        : rule.field === 'shape'
          ? ['portrait', 'landscape', 'square'].map((value) => ({ value, label: value }))
          : rule.field === 'rating'
            ? ['0', '1', '2', '3', '4', '5'].map((value) => ({
                value,
                label: value === '0' ? 'Unrated' : `${value} stars`,
              }))
            : null;
  if (options)
    return (
      <select
        aria-label={`${fieldLabels[rule.field]} filter value`}
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  return (
    <div className="rule-value">
      {rule.field === 'color' && (
        <input
          type="color"
          aria-label="Choose a swatch"
          value={/^#[a-f0-9]{6}$/i.test(rule.value) ? rule.value : '#d8b482'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <input
        maxLength={120}
        aria-label={`${fieldLabels[rule.field]} filter value`}
        placeholder={
          rule.field === 'type'
            ? 'PNG, MP4, image…'
            : rule.field === 'color'
              ? '#rrggbb'
              : 'Enter a value…'
        }
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function FilterStrip({
  rules,
  setRules,
  collections,
  tags,
  save,
}: {
  rules: FilterRule[];
  setRules: (rules: FilterRule[]) => void;
  collections: Collection[];
  tags: string[];
  save: () => void;
}) {
  const [open, setOpen] = useState<FilterRule['field'] | null>(null);
  const [draft, setDraft] = useState<FilterRule>(newRule('name'));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      className="filter-strip"
      aria-label="Gallery filters"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(null);
      }}
    >
      {filterFields.map((field) => (
        <div className="filter-slot" key={field}>
          <button
            className="filter-button"
            type="button"
            aria-expanded={open === field}
            data-active={rules.some((r) => r.field === field)}
            onClick={() => {
              setDraft(rules.find((r) => r.field === field) ?? newRule(field));
              setOpen(open === field ? null : field);
            }}
          >
            {fieldLabels[field]} <ChevronDown size={11} />
          </button>
          {open === field && (
            <form
              className="filter-popover"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.value.trim())
                  setRules([
                    ...rules.filter((r) => r.field !== field),
                    { ...draft, value: draft.value.trim() },
                  ]);
                setOpen(null);
              }}
            >
              <label>
                Condition{' '}
                <select
                  aria-label="Filter operator"
                  value={draft.operator}
                  onChange={(e) =>
                    setDraft({ ...draft, operator: e.target.value as FilterRule['operator'] })
                  }
                >
                  {(field === 'folder' ||
                  field === 'rating' ||
                  field === 'shape' ||
                  field === 'color'
                    ? ['is', 'is not']
                    : ['contains', 'is', 'is not']
                  ).map((op) => (
                    <option key={op}>{op}</option>
                  ))}
                </select>
              </label>
              <RuleValue
                rule={draft}
                onChange={(value) => setDraft({ ...draft, value })}
                collections={collections}
                tags={tags}
              />
              {field === 'color' && (
                <label>
                  Color tolerance{' '}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={draft.tolerance ?? 0}
                    onChange={(e) => setDraft({ ...draft, tolerance: Number(e.target.value) })}
                  />
                </label>
              )}
              <div className="workspace-button-row">
                <button type="submit" className="primary" disabled={!draft.value.trim()}>
                  Apply
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setRules(rules.filter((r) => r.field !== field));
                    setOpen(null);
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          )}
        </div>
      ))}
      {rules.length > 0 && (
        <>
          <button className="text-button" onClick={() => setRules([])}>
            Clear filters
          </button>
          <button className="text-button" onClick={save}>
            Save as Smart Folder
          </button>
        </>
      )}
    </div>
  );
}
export function WorkspaceDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function SmartEditor({
  initial,
  items,
  collections,
  tags,
  visual,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Omit<SmartFolder, 'id'> & { id?: string };
  items: Item[];
  collections: Collection[];
  tags: string[];
  visual: Record<string, VisualInfo>;
  onSave: (value: Omit<SmartFolder, 'id'>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentRules = data.rules.filter((r) => r.value.trim());
  const valid =
    currentRules.length === data.rules.length && !!currentRules.length && !!data.name.trim();
  const count = valid
    ? items.filter((i) => matchesSmartFolder(i, { ...data, rules: currentRules }, visual[i.id]))
        .length
    : 0;
  const edit = (index: number, rule: FilterRule) =>
    setData({ ...data, rules: data.rules.map((r, n) => (n === index ? rule : r)) });
  const actionsAllowed = !data.rules.some((r) => r.field === 'color' || r.field === 'shape');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog
      title={initial.id ? 'Edit Smart Folder' : 'New Smart Folder'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid)
            void run(() =>
              onSave({
                name: data.name,
                match: data.match,
                rules: data.rules,
                ...(actionsAllowed && data.addTag?.trim() ? { addTag: data.addTag.trim() } : {}),
                ...(actionsAllowed && data.addFolder ? { addFolder: data.addFolder } : {}),
              }),
            );
        }}
      >
        <label>
          Name{' '}
          <input
            autoFocus
            required
            maxLength={80}
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
          />
        </label>
        <label>
          Match{' '}
          <select
            value={data.match}
            onChange={(e) => setData({ ...data, match: e.target.value as SmartFolder['match'] })}
          >
            <option value="all">All conditions</option>
            <option value="any">Any condition</option>
          </select>
        </label>
        {data.rules.map((rule, n) => (
          <div className="smart-rule" key={n}>
            <select
              aria-label={`Condition ${n + 1} field`}
              value={rule.field}
              onChange={(e) => edit(n, newRule(e.target.value as FilterRule['field']))}
            >
              {filterFields.map((field) => (
                <option key={field} value={field}>
                  {fieldLabels[field]}
                </option>
              ))}
            </select>
            <select
              aria-label={`Condition ${n + 1} operator`}
              value={rule.operator}
              onChange={(e) =>
                edit(n, { ...rule, operator: e.target.value as FilterRule['operator'] })
              }
            >
              {['is', 'is not', 'contains'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <RuleValue
              rule={rule}
              onChange={(value) => edit(n, { ...rule, value })}
              collections={collections}
              tags={tags}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove condition ${n + 1}`}
              disabled={data.rules.length === 1}
              onClick={() => setData({ ...data, rules: data.rules.filter((_, i) => i !== n) })}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={data.rules.length >= 20}
          onClick={() => setData({ ...data, rules: [...data.rules, newRule('name')] })}
        >
          <Plus size={13} /> Add condition
        </button>
        <p role="status">{count} matching items</p>
        <fieldset disabled={!actionsAllowed}>
          <legend>Optional actions on future imports</legend>
          <label>
            Add tag{' '}
            <input
              value={data.addTag ?? ''}
              maxLength={80}
              onChange={(e) => setData({ ...data, addTag: e.target.value })}
            />
          </label>
          <label>
            Add to folder{' '}
            <select
              value={data.addFolder ?? ''}
              onChange={(e) => setData({ ...data, addFolder: e.target.value || undefined })}
            >
              <option value="">No folder action</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {!actionsAllowed && (
          <small>
            Color and shape are evaluated in the gallery. Their import actions are unavailable.
          </small>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="workspace-button-row">
          <button className="primary" type="submit" disabled={!valid || busy}>
            Save Smart Folder
          </button>
          {initial.id && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void run(onDelete)}
            >
              Delete Smart Folder
            </button>
          )}
        </div>
      </form>
    </WorkspaceDialog>
  );
}
export function TagWorkspace({
  items,
  groups,
  openTag,
  onSave,
}: {
  items: Item[];
  groups: { name: string; tags: string[] }[];
  openTag: (tag: string) => void;
  onSave: (group: { name: string; tags: string[] }) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [draft, setDraft] = useState<{ name: string; tags: string[] } | null>(null);
  const [error, setError] = useState('');
  const counts = new Map<string, number>();
  for (const item of items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const all = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const visible = (active ? (groups.find((g) => g.name === active)?.tags ?? []) : all).filter(
    (tag) => tag.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="tag-workspace">
      <nav aria-label="Tag groups">
        <button className="nav-item" onClick={() => setActive('')}>
          All tags <small>{all.length}</small>
        </button>
        {groups.map((g) => (
          <button
            key={g.name}
            className={`nav-item ${active === g.name ? 'active' : ''}`}
            onClick={() => setActive(g.name)}
          >
            {g.name}
            <small>{g.tags.length}</small>
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => {
            setError('');
            setDraft({ name: '', tags: [] });
          }}
        >
          New group
        </button>
        {active && (
          <button
            className="text-button"
            onClick={() => {
              setError('');
              setDraft(groups.find((g) => g.name === active)!);
            }}
          >
            Edit group
          </button>
        )}
      </nav>
      <div>
        <label className="search">
          <Search size={16} />
          <input aria-label="Find a tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="tag-results">
          {visible.map((tag) => (
            <button key={tag} className="tag" onClick={() => openTag(tag)}>
              #{tag} <small>{counts.get(tag) ?? 0}</small>
            </button>
          ))}
        </div>
        {visible.length === 0 && (
          <p>{all.length ? 'No tags match.' : 'No tags yet. Add tags from an item’s details.'}</p>
        )}
      </div>
      {draft && (
        <WorkspaceDialog
          title={active && active === draft.name ? 'Edit tag group' : 'New tag group'}
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onSave(draft);
                setActive(draft.name.trim());
                setDraft(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Name{' '}
              <input
                required
                autoFocus
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            {all.map((tag) => (
              <label key={tag} className="check-label">
                <input
                  type="checkbox"
                  checked={draft.tags.includes(tag)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tags: e.target.checked
                        ? [...draft.tags, tag]
                        : draft.tags.filter((t) => t !== tag),
                    })
                  }
                />
                {tag}
              </label>
            ))}
            {error && <p role="alert">{error}</p>}
            <button className="primary" type="submit">
              Save group
            </button>
          </form>
        </WorkspaceDialog>
      )}
    </section>
  );
}
