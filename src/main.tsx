import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  ArrowDownToLine,
  Check,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Image as ImageIcon,
  Layers,
  Link2,
  Menu,
  Network,
  Plus,
  Search,
  Star,
  Table2,
  Trash2,
  Upload,
  X,
  Film,
  Music,
  History,
  LoaderCircle,
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import type { Item, ItemPatch, Collection, LibrarySnapshot, HistoryEntry } from '../shared/model';
import './styles.css';

async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}
const content = (item: Item, download = false) =>
  `/api/items/${item.id}/content${download ? '?download=1' : ''}`;
const bytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KB`
      : size < 1024 ** 3
        ? `${(size / 1024 ** 2).toFixed(1)} MB`
        : `${(size / 1024 ** 3).toFixed(1)} GB`;
function ItemIcon({ item, size = 24 }: { item: Item; size?: number }) {
  const Icon =
    item.kind === 'note'
      ? FileText
      : item.mime.startsWith('image/')
        ? ImageIcon
        : item.mime.startsWith('video/')
          ? Film
          : item.mime.startsWith('audio/')
            ? Music
            : File;
  return <Icon size={size} />;
}
function Thumbnail({ item }: { item: Item }) {
  if (item.mime.startsWith('image/')) return <img src={content(item)} alt="" loading="lazy" />;
  if (item.kind === 'note')
    return (
      <div className="note-thumbnail">
        <FileText size={18} />
        <strong>{item.title}</strong>
        <p>{item.body || 'Your next idea starts here.'}</p>
      </div>
    );
  return (
    <div className={`file-thumbnail ${item.mime.startsWith('video/') ? 'video' : ''}`}>
      <ItemIcon item={item} size={38} />
      <span>{item.filename.split('.').at(-1)?.toUpperCase() || 'FILE'}</span>
    </div>
  );
}
function TableView({
  items,
  onSelect,
  selected,
}: {
  items: Item[];
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const columns = useMemo<ColumnDef<Item>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Name',
        cell: (info) => (
          <span className="table-name">
            <ItemIcon item={info.row.original} size={16} />
            {info.getValue<string>()}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: (info) =>
          info.row.original.kind === 'note' ? 'Markdown' : info.row.original.mime.split('/')[1],
      },
      { id: 'tags', header: 'Tags', cell: (info) => info.row.original.tags.join(', ') || '—' },
      { accessorKey: 'size', header: 'Size', cell: (info) => bytes(info.getValue<number>()) },
    ],
    [],
  );
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="table-scroll">
      <table>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={selected === row.original.id ? 'selected' : ''}>
              {row.getVisibleCells().map((cell, i) => (
                <td key={cell.id}>
                  {i === 0 ? (
                    <button className="cell-button" onClick={() => onSelect(row.original.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </button>
                  ) : (
                    flexRender(cell.column.columnDef.cell, cell.getContext())
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function GraphView({ items, onSelect }: { items: Item[]; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const visible = items.slice(0, 250),
      ids = new Set(visible.map((i) => i.id));
    const graph = cytoscape({
      container: ref.current!,
      elements: [
        ...visible.map((i) => ({ data: { id: i.id, label: i.title, kind: i.kind } })),
        ...visible.flatMap((i) =>
          i.relations
            .filter((r) => ids.has(r.target))
            .map((r, n) => ({
              data: { id: `${i.id}-${n}`, source: i.id, target: r.target, label: r.label },
            })),
        ),
      ],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#d5ab70',
            label: 'data(label)',
            color: '#b7b8bd',
            'font-size': 11,
            'text-valign': 'bottom',
            'text-margin-y': 9,
            width: 18,
            height: 18,
            'text-max-width': '110px',
            'text-wrap': 'ellipsis',
          },
        },
        { selector: 'node[kind="note"]', style: { 'background-color': '#9ba7d5' } },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#494c55',
            'target-arrow-color': '#494c55',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 9,
            color: '#777b86',
            'text-background-color': '#191a1d',
            'text-background-opacity': 1,
          },
        },
      ],
      layout: { name: 'cose', animate: false, nodeRepulsion: () => 8000 },
      minZoom: 0.3,
      maxZoom: 3,
    });
    graph.on('tap', 'node', (event) => onSelect(event.target.id()));
    return () => graph.destroy();
  }, [items, onSelect]);
  return (
    <div className="graph-view">
      <div ref={ref} className="graph-canvas" aria-label="Relations graph" />
      <p>
        Showing up to 250 items · Select a node to inspect it. The table offers keyboard access.
      </p>
    </div>
  );
}
function Preview({ item }: { item: Item }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (item.kind === 'asset' && item.mime === 'text/plain' && item.size < 200000) {
      const abort = new AbortController();
      fetch(content(item), { signal: abort.signal })
        .then((r) => {
          if (!r.ok) throw new Error('Preview unavailable');
          return r.text();
        })
        .then(setText)
        .catch(() => setText('Preview unavailable. Download the original to open it.'));
      return () => abort.abort();
    }
  }, [item]);
  if (item.mime.startsWith('image/'))
    return <img className="large-preview" src={content(item)} alt={item.title} />;
  if (item.mime.startsWith('video/'))
    return <video className="large-preview" src={content(item)} controls preload="metadata" />;
  if (item.mime.startsWith('audio/'))
    return <audio src={content(item)} controls preload="metadata" />;
  if (item.mime === 'text/plain' && item.size < 200000)
    return <pre className="text-preview">{text}</pre>;
  return (
    <div className="unsupported">
      <ItemIcon item={item} size={38} />
      <p>{item.mime === 'application/pdf' ? 'PDF original ready to open' : 'Original preserved'}</p>
      <a href={content(item, true)}>Download to open</a>
    </div>
  );
}
function Inspector({
  item,
  items,
  collections,
  onClose,
  onSave,
  onRestore,
  onDirty,
}: {
  item: Item;
  items: Item[];
  collections: Collection[];
  onClose: () => void;
  onSave: (p: ItemPatch) => Promise<void>;
  onRestore: (revision: number) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(item),
    [tags, setTags] = useState(item.tags.join(', ')),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(''),
    [label, setLabel] = useState('related to');
  const dirty = JSON.stringify(draft) !== JSON.stringify(item) || tags !== item.tags.join(', ');
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    api<HistoryEntry[]>(`/items/${item.id}/history`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [item.id, item.revision]);
  const field = <K extends keyof Item>(key: K, value: Item[K]) =>
    setDraft((v) => ({ ...v, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        expectedRevision: item.revision,
        title: draft.title,
        description: draft.description,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        collections: draft.collections,
        relations: draft.relations,
        ...(item.kind === 'note' ? { body: draft.body } : {}),
        favorite: draft.favorite,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>ITEM DETAILS</span>
        <button className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={save}>
        {item.kind !== 'note' && (
          <div className="preview">
            <Preview item={item} />
          </div>
        )}
        <div className="detail-type">
          <ItemIcon item={item} size={14} />
          {item.kind === 'note' ? 'MARKDOWN NOTE' : item.mime.split('/')[1].toUpperCase()}
          <span>v{item.revision}</span>
        </div>
        <label>
          Title
          <input
            aria-label="Item title"
            required
            maxLength={250}
            value={draft.title}
            onChange={(e) => field('title', e.target.value)}
          />
        </label>
        {item.kind === 'note' && (
          <label>
            Markdown
            <textarea
              className="markdown-editor"
              aria-label="Markdown content"
              value={draft.body}
              onChange={(e) => field('body', e.target.value)}
              placeholder="# Start writing…"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          Description
          <textarea
            aria-label="Description"
            rows={3}
            value={draft.description}
            onChange={(e) => field('description', e.target.value)}
            placeholder="Add context, a source, or an idea…"
          />
        </label>
        <label>
          Tags
          <input
            aria-label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="design, inspiration, research"
          />
          <small>Separate tags with commas</small>
        </label>
        <fieldset>
          <legend>Collections</legend>
          {collections.length === 0 ? (
            <small>Create a collection in the sidebar.</small>
          ) : (
            collections.map((c) => (
              <label className="check-label" key={c.id}>
                <input
                  type="checkbox"
                  checked={draft.collections.includes(c.id)}
                  onChange={(e) =>
                    field(
                      'collections',
                      e.target.checked
                        ? [...draft.collections, c.id]
                        : draft.collections.filter((id) => id !== c.id),
                    )
                  }
                />
                <Folder size={14} />
                {c.name}
              </label>
            ))
          )}
        </fieldset>
        <fieldset>
          <legend>Relations</legend>
          {draft.relations.map((r, n) => (
            <div className="relation" key={n}>
              <Link2 size={13} />
              <span>
                {r.label}{' '}
                <strong>{items.find((i) => i.id === r.target)?.title ?? 'Unavailable item'}</strong>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove relation ${n + 1}`}
                onClick={() =>
                  field(
                    'relations',
                    draft.relations.filter((_, i) => i !== n),
                  )
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <input
            aria-label="Relation label"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="relation-add">
            <select
              aria-label="Related item"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an item…</option>
              {items
                .filter((i) => i.id !== item.id && !i.trashed)
                .map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.title}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="icon-button bordered"
              aria-label="Add relation"
              disabled={!target || !label.trim()}
              onClick={() => {
                field('relations', [...draft.relations, { target, label: label.trim() }]);
                setTarget('');
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.favorite}
            onChange={(e) => field('favorite', e.target.checked)}
          />
          <Star size={14} />
          Favorite
        </label>
        <button className="primary full" disabled={busy} type="submit">
          {busy ? <LoaderCircle size={15} /> : <Check size={15} />}Save changes
        </button>
      </form>
      <div className="detail-meta">
        <span>Size</span>
        <span>{bytes(item.size)}</span>
        <span>Added</span>
        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        <span>Item ID</span>
        <code title={item.id}>{item.id.slice(0, 12)}…</code>
      </div>
      <div className="detail-actions">
        <a className="secondary" href={content(item, true)}>
          <ArrowDownToLine size={14} />
          {item.kind === 'note' ? 'Export Markdown' : 'Export original'}
        </a>
        <button
          className="secondary"
          onClick={() => {
            if (!dirty || window.confirm('Discard your unsaved changes and continue?'))
              void onSave({ expectedRevision: item.revision, trashed: !item.trashed });
          }}
        >
          <Trash2 size={14} />
          {item.trashed ? 'Restore item' : 'Move to trash'}
        </button>
      </div>
      <details className="history">
        <summary>
          <History size={14} />
          Revision history <span>{history.length}</span>
        </summary>
        {history.map((h) => (
          <div key={h.revision}>
            <span>
              v{h.revision} · {h.action}
              <small>
                {h.actor} · {new Date(h.at).toLocaleString()}
              </small>
            </span>
            {h.revision !== item.revision && (
              <button className="text-button" onClick={() => void onRestore(h.revision)}>
                Restore
              </button>
            )}
          </div>
        ))}
      </details>
    </aside>
  );
}
function App() {
  const [library, setLibrary] = useState<LibrarySnapshot>({ items: [], collections: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [scope, setScope] = useState('all'),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [view, setView] = useState<'grid' | 'table' | 'graph'>('grid'),
    [selected, setSelected] = useState<string | null>(null),
    [uploading, setUploading] = useState(''),
    [modal, setModal] = useState<'note' | 'collection' | null>(null),
    [name, setName] = useState(''),
    [menu, setMenu] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!modal) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key !== 'Tab') return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"] button,[role="dialog"] input'),
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [modal]);
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = async () => {
    const data = await api<LibrarySnapshot>('/library');
    setLibrary(data);
  };
  useEffect(() => {
    api('/session')
      .then(reload)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const active = library.items.filter((i) => !i.trashed),
    tags = [...new Set(active.flatMap((i) => i.tags))].sort();
  const filtered = useMemo(
    () =>
      library.items.filter((i) => {
        if (scope === 'trash' ? !i.trashed : i.trashed) return false;
        if (scope === 'favorites' && !i.favorite) return false;
        if (scope === 'notes' && i.kind !== 'note') return false;
        if (scope === 'inbox' && i.collections.length) return false;
        if (scope.startsWith('collection:') && !i.collections.includes(scope.slice(11)))
          return false;
        if (scope.startsWith('tag:') && !i.tags.includes(scope.slice(4))) return false;
        if (
          kind !== 'all' &&
          (kind === 'note' ? i.kind !== 'note' : !i.mime.startsWith(kind + '/'))
        )
          return false;
        return `${i.title} ${i.tags.join(' ')} ${i.description} ${i.body}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [library, scope, kind, query],
  );
  const title =
    scope === 'all'
      ? 'All items'
      : scope === 'favorites'
        ? 'Favorites'
        : scope === 'notes'
          ? 'Notes'
          : scope === 'inbox'
            ? 'Inbox'
            : scope === 'trash'
              ? 'Trash'
              : scope.startsWith('tag:')
                ? `# ${scope.slice(4)}`
                : (library.collections.find((c) => c.id === scope.slice(11))?.name ?? 'Collection');
  const item = library.items.find((i) => i.id === selected);
  const select = React.useCallback(
    (id: string) => {
      if (
        id === selected ||
        !dirty ||
        window.confirm('Discard your unsaved changes and open another item?')
      )
        setSelected(id);
    },
    [dirty, selected],
  );
  const navigate = (value: string) => {
    setScope(value);
    setMenu(false);
  };
  async function save(patch: ItemPatch) {
    try {
      setError('');
      await api(`/items/${selected}`, 'PATCH', patch);
      await reload();
      setNotice('Changes saved');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore(revision: number) {
    if (dirty && !window.confirm('Discard your unsaved changes and restore this revision?')) return;
    try {
      await api(`/items/${selected}/restore`, 'POST', {
        revision,
        expectedRevision: item!.revision,
      });
      await reload();
      setNotice('Revision restored as a new version');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    if (dirty && !window.confirm('Discard your unsaved changes and import files?')) return;
    setError('');
    let count = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      setUploading(`Importing ${++count} of ${files.length} · ${file.name}`);
      try {
        const res = await fetch(`/api/import?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSelected(data.id);
      } catch (e) {
        failures.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    try {
      await reload();
    } catch (e) {
      failures.push((e as Error).message);
    }
    setUploading('');
    if (failures.length) setError(failures.join(' · '));
    else setNotice(`${count} ${count === 1 ? 'file' : 'files'} imported`);
    if (fileInput.current) fileInput.current.value = '';
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (
      modal === 'note' &&
      dirty &&
      !window.confirm('Discard your unsaved changes and create a note?')
    )
      return;
    try {
      setError('');
      if (modal === 'note') {
        const note = await api<Item>('/notes', 'POST', { title: name, body: '' });
        setSelected(note.id);
        setScope('notes');
      } else {
        const collection = await api<Collection>('/collections', 'POST', { name });
        setScope(`collection:${collection.id}`);
      }
      await reload();
      setModal(null);
      setName('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const nav = (value: string, Icon: typeof Layers, label: string, count?: number) => (
    <button
      className={`nav-item ${scope === value ? 'active' : ''}`}
      onClick={() => navigate(value)}
    >
      <Icon size={17} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </button>
  );
  return (
    <div className={`app ${item ? 'has-inspector' : ''}`}>
      {menu && (
        <button
          className="sidebar-shade"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Layers size={20} />
          </div>
          <span>
            atlas<span className="brand-dot">.</span>
          </span>
          <small>LOCAL LIBRARY</small>
        </div>
        <div className="library-switch">
          <div className="library-avatar">P</div>
          <div>
            <strong>Personal library</strong>
            <small>Your ideas, connected</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Library navigation">
          {nav('all', Layers, 'All items', active.length)}
          {nav('inbox', Archive, 'Inbox', active.filter((i) => !i.collections.length).length)}
          {nav('favorites', Star, 'Favorites')}
          {nav('notes', FileText, 'Notes', active.filter((i) => i.kind === 'note').length)}
        </nav>
        <div className="nav-label">
          COLLECTIONS
          <button
            className="icon-button"
            aria-label="New collection"
            onClick={() => {
              setModal('collection');
              setName('');
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav>
          {library.collections.map((c) => (
            <React.Fragment key={c.id}>
              {nav(
                `collection:${c.id}`,
                Folder,
                c.name,
                active.filter((i) => i.collections.includes(c.id)).length,
              )}
            </React.Fragment>
          ))}
        </nav>
        {!library.collections.length && (
          <p className="sidebar-hint">Give your references a home.</p>
        )}
        <div className="nav-label">
          TAGS<span>{tags.length}</span>
        </div>
        <div className="sidebar-tags">
          {tags.map((tag) => (
            <button
              key={tag}
              className={scope === `tag:${tag}` ? 'tag active' : 'tag'}
              onClick={() => navigate(`tag:${tag}`)}
            >
              <span>#</span>
              {tag}
            </button>
          ))}
          {!tags.length && <p className="sidebar-hint">Tags appear as you organize.</p>}
        </div>
        <div className="sidebar-bottom">
          {nav('trash', Trash2, 'Trash', library.items.filter((i) => i.trashed).length)}
          <div className="storage">
            <span className="status-dot" />
            <div>
              Stored on this machine
              <small>{bytes(active.reduce((sum, i) => sum + i.size, 0))} of original content</small>
            </div>
          </div>
        </div>
      </aside>
      <main
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading) void importFiles(e.dataTransfer.files);
        }}
      >
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Library
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="top-actions">
            <a className="icon-button" aria-label="Export metadata manifest" href="/api/manifest">
              <ArrowDownToLine size={17} />
            </a>
            <span className="local-badge">
              <span className="status-dot" />
              Local
            </span>
          </div>
        </header>
        <section className="workspace-heading">
          <div>
            <span className="eyebrow">YOUR CREATIVE SPACE</span>
            <h1>
              {title}
              <span>{filtered.length}</span>
            </h1>
            <p>
              {scope === 'trash'
                ? 'Items stay recoverable until you restore them.'
                : 'A place for everything worth keeping.'}
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="secondary"
              onClick={() => {
                setModal('note');
                setName('');
              }}
            >
              <Plus size={16} />
              New note
            </button>
            <button
              className="primary"
              disabled={!!uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} />
              Import files
            </button>
            <input
              type="file"
              multiple
              hidden
              ref={fileInput}
              onChange={(e) => void importFiles(e.target.files)}
              aria-label="Import files"
            />
          </div>
        </section>
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, tags, and notes…"
            />
            <kbd>⌕</kbd>
          </label>
          <select
            className="type-filter"
            aria-label="Filter file type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="note">Notes</option>
          </select>
          <div className="view-switch" aria-label="Library view">
            {(
              [
                ['grid', Grid2X2, 'Grid'],
                ['table', Table2, 'Table'],
                ['graph', Network, 'Graph'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                className={view === value ? 'active' : ''}
                key={value}
                aria-label={`${label} view`}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {uploading && (
          <div className="upload-status" role="status">
            <LoaderCircle size={15} />
            {uploading}
          </div>
        )}
        <section className="library-content">
          {loading ? (
            <div className="empty-state">
              <LoaderCircle size={28} />
              <h2>Opening your library…</h2>
            </div>
          ) : !filtered.length ? (
            <div className="empty-state">
              <div className="empty-icon">
                {active.length ? <Search size={28} /> : <Layers size={32} />}
              </div>
              <span className="eyebrow">{active.length ? 'ROOM TO EXPLORE' : 'A FRESH START'}</span>
              <h2>{active.length ? 'Nothing here yet' : 'Collect a little inspiration'}</h2>
              <p>
                {active.length
                  ? 'Try a different search or add items to this collection.'
                  : 'Bring in images, videos, documents, and the notes that connect them. Your originals stay on this machine.'}
              </p>
              <button className="primary" onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                Import your first files
              </button>
              <small>or drag files anywhere into this workspace</small>
            </div>
          ) : view === 'grid' ? (
            <div className="asset-grid">
              {filtered.map((i) => (
                <button
                  key={i.id}
                  className={`asset-card ${selected === i.id ? 'selected' : ''}`}
                  onClick={() => select(i.id)}
                >
                  <div className="thumbnail">
                    <Thumbnail item={i} />
                    {i.favorite && (
                      <span className="favorite-indicator">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                    <span className="format-badge">
                      {i.kind === 'note'
                        ? 'MD'
                        : i.filename.split('.').at(-1)?.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div className="card-caption">
                    <strong>{i.title}</strong>
                    <div>
                      <span>
                        {i.tags[0]
                          ? `# ${i.tags[0]}`
                          : i.kind === 'note'
                            ? 'Markdown note'
                            : 'Untagged'}
                      </span>
                      <small>{bytes(i.size)}</small>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : view === 'table' ? (
            <TableView items={filtered} onSelect={select} selected={selected} />
          ) : (
            <GraphView items={filtered} onSelect={select} />
          )}
        </section>
        <footer className="workspace-footer">
          <span>
            {filtered.length} items <span>·</span> {bytes(filtered.reduce((n, i) => n + i.size, 0))}
          </span>
          <span>
            Personal library <span>·</span> Prototype 0.1
          </span>
        </footer>
      </main>
      {item && (
        <Inspector
          key={`${item.id}-${item.revision}`}
          item={item}
          items={library.items}
          collections={library.collections}
          onClose={() => {
            if (!dirty || window.confirm('Discard your unsaved changes and close this item?'))
              setSelected(null);
          }}
          onSave={save}
          onRestore={restore}
          onDirty={setDirty}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {modal && (
        <div className="modal-shade" onClick={() => setModal(null)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
          >
            <button
              type="button"
              className="icon-button modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={18} />
            </button>
            {modal === 'note' ? <FileText size={26} /> : <FolderPlus size={26} />}
            <h2 id="modal-title">
              {modal === 'note' ? 'A new thought' : 'Make room for a collection'}
            </h2>
            <p>
              {modal === 'note'
                ? 'Write in Markdown. Connect it to anything.'
                : 'Group references without duplicating your files.'}
            </p>
            <label>
              {modal === 'note' ? 'Note title' : 'Collection name'}
              <input
                autoFocus
                required
                maxLength={modal === 'note' ? 250 : 80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={modal === 'note' ? 'Untitled idea' : 'e.g. Brand references'}
              />
            </label>
            <button className="primary full" type="submit">
              Create {modal}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
