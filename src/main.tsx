import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  ArrowDownToLine,
  Check,
  ChevronRight,
  File,
  FileText,
  Folder,
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
  Columns3,
  Rows3,
  ZoomIn,
  Tag,
  Pencil,
  PanelRight,
  PanelLeft,
  Sparkles,
  Clock3,
  Shuffle,
  FolderPlus,
  Pin,
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import type { Item, ItemPatch, Collection, LibrarySnapshot, HistoryEntry } from '../shared/model';
import './styles.css';
import './workspace.css';
import { BulkBar, Lightbox } from './LibraryTools';
import { AiPanel } from './AiPanel';
import { NoteEditor, noteReferences } from './NoteEditor';
import { Gallery, type GalleryView, type Dimensions } from './Gallery';
import { ImageProperties, imageColors } from './ImageProperties';
import {
  LibraryPicker,
  FilterStrip,
  SmartEditor,
  TagWorkspace,
  WorkspaceDialog,
} from './WorkspaceTools';
import { HoverPeek, InlineVideo, ItemMenu, ReverseImageDialog } from './GalleryActions';
import { imageSearchExtension } from '../shared/image-search';
import { descendantIds } from '../shared/collections';
import {
  matchesRule,
  matchesSmartFolder,
  type FilterRule,
  type SmartFolder,
} from '../shared/filters';

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
function Thumbnail({
  item,
  onDimensions,
}: {
  item: Item;
  onDimensions: (d: Dimensions & { colors?: string[] }) => void;
}) {
  if (item.mime.startsWith('image/'))
    return (
      <img
        src={content(item)}
        alt=""
        loading="lazy"
        onLoad={(e) =>
          onDimensions({
            width: e.currentTarget.naturalWidth,
            height: e.currentTarget.naturalHeight,
            colors: imageColors(e.currentTarget),
          })
        }
      />
    );
  if (item.mime.startsWith('video/')) return <InlineVideo item={item} onSize={onDimensions} />;
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
        ...visible.flatMap((i) => {
          const references = i.kind === 'note' ? noteReferences(i.body) : [];
          return [
            ...i.relations,
            ...references
              .filter((id) => id !== i.id && !i.relations.some((r) => r.target === id))
              .map((target) => ({ target, label: 'note link' })),
          ]
            .filter((r) => ids.has(r.target))
            .map((r, n) => ({
              data: { id: `${i.id}-${n}`, source: i.id, target: r.target, label: r.label },
            }));
        }),
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
  editorHost,
  onOpen,
  noteReading,
  onNoteReadingChange,
  onColorFilter,
}: {
  item: Item;
  items: Item[];
  collections: Collection[];
  onClose: () => void;
  onSave: (p: ItemPatch) => Promise<void>;
  onRestore: (revision: number) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  editorHost: HTMLDivElement | null;
  onOpen: (id: string) => void;
  noteReading: boolean;
  onNoteReadingChange: (reading: boolean) => void;
  onColorFilter: (color: string) => void;
}) {
  const [draft, setDraft] = useState(item),
    [tags, setTags] = useState(item.tags.join(', ')),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(''),
    [label, setLabel] = useState('related to');
  const pendingRelation = items.some((candidate) => candidate.id === target && !candidate.trashed)
    ? { target, label: label.trim() || 'related to' }
    : null;
  const relations =
    pendingRelation &&
    !draft.relations.some(
      (relation) =>
        relation.target === pendingRelation.target && relation.label === pendingRelation.label,
    )
      ? [...draft.relations, pendingRelation]
      : draft.relations;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(item) ||
    tags !== item.tags.join(', ') ||
    relations !== draft.relations;
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
        relations,
        ...(item.kind === 'note' ? { body: draft.body } : {}),
        favorite: draft.favorite,
        rating: draft.rating,
        sourceUrl: draft.sourceUrl,
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
      <form onSubmit={save} id="item-details-form">
        {item.kind !== 'note' && (
          <div className="preview">
            <Preview item={item} />
          </div>
        )}
        <ImageProperties item={item} onFilter={onColorFilter} />
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
          Source link{' '}
          <input
            type="url"
            aria-label="Source link"
            placeholder="https://…"
            value={
              draft.sourceUrl ??
              (typeof item.source?.metadata.url === 'string' &&
              /^https?:\/\//i.test(item.source.metadata.url)
                ? item.source.metadata.url
                : '')
            }
            onChange={(e) => field('sourceUrl', e.target.value)}
          />
        </label>
        <div className="rating-control" role="group" aria-label="Rating">
          <span>Rating</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              aria-label={`Rate ${n} stars`}
              aria-pressed={n === Number(draft.rating ?? item.source?.metadata.star ?? 0)}
              onClick={() => field('rating', n === draft.rating ? 0 : n)}
            >
              <Star
                size={15}
                fill={
                  n <= Number(draft.rating ?? item.source?.metadata.star ?? 0)
                    ? 'currentColor'
                    : 'none'
                }
              />
            </button>
          ))}
        </div>
        <section className="inspector-tags" aria-label="Assigned tags">
          <label>
            Tags{' '}
            <input
              aria-label="Tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Add tags, separated by commas"
            />
          </label>
          <div className="inspector-chips">
            {[
              ...new Set(
                tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            ].map((tag) => (
              <button
                className="tag"
                type="button"
                key={tag}
                aria-label={`Remove tag ${tag}`}
                onClick={() =>
                  setTags(
                    tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter((t) => t && t !== tag)
                      .join(', '),
                  )
                }
              >
                {tag}
                <X size={12} />
              </button>
            ))}
          </div>
        </section>
        <fieldset>
          <legend>Folders</legend>
          <div className="inspector-chips">
            {collections
              .filter((c) => draft.collections.includes(c.id))
              .map((c) => (
                <button
                  className="tag"
                  type="button"
                  key={c.id}
                  title={c.name}
                  aria-label={`Remove folder ${c.name}`}
                  onClick={() =>
                    field(
                      'collections',
                      draft.collections.filter((id) => id !== c.id),
                    )
                  }
                >
                  {c.title ?? c.name}
                  <X size={12} />
                </button>
              ))}
          </div>
          {collections.length === 0 ? (
            <small>Create a folder in the sidebar.</small>
          ) : (
            <details className="folder-membership">
              <summary>Add or remove folders</summary>
              {collections.map((c) => (
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
                  <Folder size={13} />
                  {c.name}
                </label>
              ))}
            </details>
          )}
        </fieldset>
        <fieldset>
          <legend>Relations</legend>
          {draft.relations.map((r, n) => {
            const linked = items.find(
              (candidate) => candidate.id === r.target && !candidate.trashed,
            );
            return (
              <div className="relation" key={n}>
                <Link2 size={13} />
                <span>
                  {r.label}{' '}
                  {linked ? (
                    <button
                      type="button"
                      className="text-button relation-link"
                      aria-label={`Open linked item: ${linked.title}`}
                      onClick={() => onOpen(linked.id)}
                    >
                      {linked.title}
                    </button>
                  ) : (
                    <strong>Unavailable item</strong>
                  )}
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
            );
          })}
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
              disabled={!pendingRelation}
              onClick={() => {
                field('relations', relations);
                setTarget('');
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          {pendingRelation && <small>Save changes to link the selected item.</small>}
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
        <span>Type</span>
        <span>
          {item.kind === 'note' ? 'Markdown' : item.filename.split('.').at(-1)?.toUpperCase()}
        </span>
        <span>Imported</span>
        <span>{item.importedAt ? new Date(item.importedAt).toLocaleString() : '—'}</span>
        <span>Size</span>
        <span>{bytes(item.size)}</span>
        <span>Created</span>
        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        <span>Modified</span>
        <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
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
      {item.kind === 'note' &&
        editorHost &&
        createPortal(
          <NoteEditor
            item={draft}
            items={items}
            onChange={field}
            onBack={onClose}
            onOpen={onOpen}
            busy={busy}
            rendered={noteReading}
            setRendered={onNoteReadingChange}
          />,
          editorHost,
        )}
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
    [view, setView] = useState<GalleryView | 'table' | 'graph'>('justified'),
    [selected, setSelected] = useState<string | null>(null),
    [uploading, setUploading] = useState(''),
    [renaming, setRenaming] = useState<Collection | null>(null),
    [creating, setCreating] = useState(false),
    [menu, setMenu] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const [noteDetails, setNoteDetails] = useState(false);
  const [readingNoteId, setReadingNoteId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Record<string, Dimensions & { colors?: string[] }>>(
    {},
  );
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [smart, setSmart] = useState<(Omit<SmartFolder, 'id'> & { id?: string }) | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [folderQuery, setFolderQuery] = useState('');
  const [repair, setRepair] = useState<{
    changes: { from: string; title: string }[];
    skipped: string[];
    key: string;
  } | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairError, setRepairError] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('atlas.search-history') ?? '[]');
    } catch {
      return [];
    }
  });
  const [searching, setSearching] = useState(false);
  const [randomOrder, setRandomOrder] = useState<string[]>([]);
  const [panels, setPanels] = useState({ left: true, right: true });
  const [peek, setPeek] = useState<Item | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  const [itemMenu, setItemMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [imageSearch, setImageSearch] = useState<Item>();
  const [undo, setUndo] = useState<{ id: string; patch: ItemPatch }[]>([]);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    const stored = localStorage.getItem('atlas.theme');
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  });
  useEffect(() => {
    let active = true;
    window.atlasDesktop
      ?.appearance()
      .then((value) => {
        if (active) setTheme(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const [pin, setPin] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [sort, setSort] = useState('newest'),
    [tileSize, setTileSize] = useState(() => Number(localStorage.getItem('atlas.tileSize')) || 162),
    [bulk, setBulk] = useState<string[]>([]),
    [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    localStorage.setItem('atlas.tileSize', String(tileSize));
  }, [tileSize]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const input = (e.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable="true"]',
      );
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search library"]')?.focus();
      }
      if (
        !input &&
        !e.defaultPrevented &&
        (!(e.target as HTMLElement).closest('button,a') ||
          !!(e.target as HTMLElement).closest('.asset-open')) &&
        e.code === 'Space' &&
        selected &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        setPreview(selected);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selected]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
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
  const updateVisual = (id: string, d: Dimensions & { colors?: string[] }) =>
    setDimensions((map) =>
      map[id]?.width === d.width && map[id]?.height === d.height && (!d.colors || map[id]?.colors)
        ? map
        : { ...map, [id]: d },
    );
  useEffect(() => {
    const visualNeeded = [...rules, ...(library.smartFolders?.flatMap((f) => f.rules) ?? [])].some(
      (rule) => rule.field === 'shape' || rule.field === 'color',
    );
    if (!visualNeeded) return;
    let stopped = false;
    const items = library.items.filter(
      (i) => i.mime.startsWith('image/') && !i.trashed && !dimensions[i.id]?.colors,
    );
    const worker = async () => {
      while (!stopped && items.length) {
        const current = items.shift()!;
        const image = new Image();
        image.src = content(current);
        try {
          await image.decode();
          if (!stopped)
            updateVisual(current.id, {
              width: image.naturalWidth,
              height: image.naturalHeight,
              colors: imageColors(image),
            });
        } catch {}
      }
    };
    void Promise.all([worker(), worker()]);
    return () => {
      stopped = true;
    };
  }, [rules, library.items, library.smartFolders]);
  const active = library.items.filter((i) => !i.trashed),
    tags = [...new Set(active.flatMap((i) => i.tags))].sort();
  const folderTotals = useMemo(() => {
    const totals = new Map<string, { members: Set<string>; count: number }>();
    for (const folder of library.collections) {
      const members = descendantIds(library.collections, folder.id);
      totals.set(folder.id, {
        members,
        count: library.items.filter(
          (i) => !i.trashed && i.collections.some((id) => members.has(id)),
        ).length,
      });
    }
    return totals;
  }, [library]);
  const filtered = useMemo(
    () =>
      library.items
        .filter((i) => {
          if (scope === 'trash' ? !i.trashed : i.trashed) return false;
          if (scope === 'favorites' && !i.favorite) return false;
          if (scope === 'notes' && i.kind !== 'note') return false;
          if (scope === 'untagged' && i.tags.length) return false;
          if (scope === 'inbox' && i.collections.length) return false;
          if (
            scope.startsWith('collection:') &&
            !i.collections.some((id) => folderTotals.get(scope.slice(11))?.members.has(id))
          )
            return false;
          if (scope === 'recent' && !recent.includes(i.id)) return false;
          if (scope.startsWith('smart:')) {
            const folder = library.smartFolders?.find((f) => f.id === scope.slice(6));
            if (!folder || !matchesSmartFolder(i, folder, dimensions[i.id])) return false;
          }
          if (!rules.every((rule) => matchesRule(i, rule, dimensions[i.id]))) return false;
          if (scope.startsWith('tag:') && !i.tags.includes(scope.slice(4))) return false;
          if (
            kind !== 'all' &&
            (kind === 'note' ? i.kind !== 'note' : !i.mime.startsWith(kind + '/'))
          )
            return false;
          return `${i.title} ${i.tags.join(' ')} ${i.description} ${i.body}`
            .toLowerCase()
            .includes(query.toLowerCase());
        })
        .sort((a, b) =>
          scope === 'recent'
            ? recent.indexOf(a.id) - recent.indexOf(b.id)
            : scope === 'random'
              ? randomOrder.indexOf(a.id) - randomOrder.indexOf(b.id)
              : sort === 'name'
                ? a.title.localeCompare(b.title)
                : sort === 'size'
                  ? b.size - a.size
                  : sort === 'oldest'
                    ? a.createdAt.localeCompare(b.createdAt)
                    : b.createdAt.localeCompare(a.createdAt),
        ),
    [library, scope, kind, query, sort, dimensions, folderTotals, recent, randomOrder, rules],
  );
  const title =
    scope === 'tags'
      ? 'All Tags'
      : scope === 'recent'
        ? 'Recently used'
        : scope === 'random'
          ? 'Random'
          : scope.startsWith('smart:')
            ? (library.smartFolders?.find((f) => f.id === scope.slice(6))?.name ?? 'Smart Folder')
            : scope === 'all'
              ? 'All items'
              : scope === 'favorites'
                ? 'Favorites'
                : scope === 'notes'
                  ? 'Notes'
                  : scope === 'untagged'
                    ? 'Untagged'
                    : scope === 'inbox'
                      ? 'Uncategorized'
                      : scope === 'trash'
                        ? 'Trash'
                        : scope.startsWith('tag:')
                          ? `# ${scope.slice(4)}`
                          : (library.collections.find((c) => c.id === scope.slice(11))?.title ??
                            'Collection');
  const item = library.items.find((i) => i.id === selected);
  const select = React.useCallback(
    (id: string) => {
      if (
        id === selected ||
        !dirty ||
        window.confirm('Discard your unsaved changes and open another item?')
      ) {
        setSelected(id);
        setRecent((ids) => [id, ...ids.filter((value) => value !== id)].slice(0, 100));
      }
    },
    [dirty, selected],
  );
  const navigate = (value: string) => {
    if (item?.kind === 'note') {
      if (dirty && !window.confirm('Discard your unsaved note changes?')) return;
      setSelected(null);
    }
    setBulk([]);
    if (!pin && !dirty) setSelected(null);
    if (value === 'random') {
      const ids = active.map((i) => i.id);
      for (let index = ids.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [ids[index], ids[other]] = [ids[other], ids[index]];
      }
      setRandomOrder(ids);
    }
    if (
      value === 'tags' &&
      item?.kind !== 'note' &&
      dirty &&
      !window.confirm('Discard your unsaved changes?')
    )
      return;
    if (value === 'tags') setSelected(null);
    setScope(value);
    setMenu(false);
  };
  async function applyBulk(changes: { id: string; patch: ItemPatch }[]) {
    if (dirty && !window.confirm('Discard your unsaved changes and apply this batch?')) return;
    try {
      setError('');
      const updated = await api<Item[]>('/batch', 'POST', changes);
      setUndo(
        updated
          .filter((i) => changes.some((c) => c.id === i.id && c.patch.trashed === true))
          .map((i) => ({ id: i.id, patch: { expectedRevision: i.revision, trashed: false } })),
      );
      await reload();
      setNotice(`${changes.length} items updated`);
      setBulk([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(patch: ItemPatch) {
    try {
      setError('');
      const updated = await api<Item>(`/items/${selected}`, 'PATCH', patch);
      setUndo(
        patch.trashed === true
          ? [{ id: updated.id, patch: { expectedRevision: updated.revision, trashed: false } }]
          : [],
      );
      await reload();
      setNotice(patch.trashed === true ? 'Item moved to Trash' : 'Changes saved');
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
  async function importFiles(files: ArrayLike<File> | null) {
    if (!files?.length || uploading) return;
    if (dirty && !window.confirm('Discard your unsaved changes and import files?')) return;
    setError('');
    let count = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      setUploading(`Importing ${++count} of ${files.length} · ${file.name}`);
      try {
        const params = new URLSearchParams({ name: file.name });
        if (scope.startsWith('collection:')) params.set('folder', scope.slice(11));
        const res = await fetch(`/api/import?${params}`, {
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
    else {
      if (!scope.startsWith('collection:') && scope !== 'all') setScope('all');
      setQuery('');
      setKind('all');
      setRules([]);
      setNotice(`${count} ${count === 1 ? 'file' : 'files'} imported`);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  async function create(kind: 'note' | 'collection', parentId?: string) {
    if (
      creating ||
      (kind === 'note' &&
        dirty &&
        !window.confirm('Discard your unsaved changes and create a note?'))
    )
      return;
    setCreating(true);
    try {
      setError('');
      if (kind === 'note') {
        const titles = new Set(
          library.items.filter((i) => i.kind === 'note' && !i.trashed).map((i) => i.title),
        );
        let title = 'Untitled note';
        for (let n = 2; titles.has(title); n++) title = `Untitled note ${n}`;
        const note = await api<Item>('/notes', 'POST', { title, body: '' });
        setSelected(note.id);
        setNoteDetails(false);
        setScope('notes');
        setKind('all');
        setQuery('');
      } else {
        const collection = await api<Collection>('/collections', 'POST', { parentId });
        if (parentId) setCollapsed((ids) => ids.filter((id) => id !== parentId));
        setBulk([]);
        setScope(`collection:${collection.id}`);
        if (item?.kind === 'note' && !dirty) setSelected(null);
        setRenaming({ ...collection, name: collection.title ?? collection.name });
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  async function renameFolder() {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    if (
      !name.trim() ||
      name ===
        (library.collections.find((c) => c.id === id)?.title ??
          library.collections.find((c) => c.id === id)?.name)
    )
      return;
    try {
      await api(`/collections/${id}`, 'PATCH', { name });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function rememberSearch() {
    const value = query.trim();
    if (!value) return;
    setSearchHistory((history) => {
      const next = [value, ...history.filter((v) => v !== value)].slice(0, 8);
      localStorage.setItem('atlas.search-history', JSON.stringify(next));
      return next;
    });
  }
  function startPeek(i: Item) {
    window.clearTimeout(peekTimer.current);
    if (i.mime.startsWith('image/') || i.mime.startsWith('video/'))
      peekTimer.current = window.setTimeout(() => setPeek(i), 360);
  }
  function stopPeek() {
    window.clearTimeout(peekTimer.current);
    setPeek(null);
  }
  async function exportSelection(items: Item[]) {
    if (!items.length) return;
    if (window.atlasDesktop) {
      try {
        const result = await window.atlasDesktop.exportOriginals(items.map((i) => i.id));
        if (result.count) setNotice(`Exported ${result.count} files`);
        if (result.skipped.length) setError(`Could not export: ${result.skipped.join(', ')}`);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    for (const i of items) {
      const a = document.createElement('a');
      a.href = content(i, true);
      a.download = '';
      a.click();
    }
  }
  function viewFolderRepair() {
    setRepairError('');
    void api<NonNullable<typeof repair>>('/eagle/folder-repair')
      .then(setRepair)
      .catch((e) => setError(e.message));
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
  function renderFolderTree(parentId: string | null, depth: number): React.ReactNode {
    if (depth > 101) return null;
    const q = folderQuery.trim().toLowerCase();
    return library.collections
      .filter(
        (c) =>
          (c.parentId ?? null) === parentId &&
          (!q ||
            [...descendantIds(library.collections, c.id)].some((id) =>
              library.collections
                .find((f) => f.id === id)
                ?.name.toLowerCase()
                .includes(q),
            )),
      )
      .map((c) => {
        const children = library.collections.some((folder) => folder.parentId === c.id);
        const expanded = !collapsed.includes(c.id) || !!q;
        return (
          <div key={c.id}>
            <div
              className="folder-row tree-row"
              style={{ paddingInlineStart: Math.min(depth, 8) * 10 }}
            >
              {children ? (
                <button
                  type="button"
                  className="tree-disclosure"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${c.title ?? c.name}`}
                  aria-expanded={expanded}
                  onClick={() =>
                    setCollapsed((ids) =>
                      ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id],
                    )
                  }
                >
                  <ChevronRight size={13} />
                </button>
              ) : (
                <span className="tree-gap" />
              )}
              {renaming?.id === c.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void renameFolder();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Folder name"
                    maxLength={80}
                    value={renaming.name}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    onBlur={() => void renameFolder()}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                </form>
              ) : (
                <>
                  {nav(
                    `collection:${c.id}`,
                    Folder,
                    c.title ?? c.name,
                    folderTotals.get(c.id)?.count,
                  )}
                  <button
                    className="icon-button rename-folder"
                    aria-label={`Add subfolder to ${c.title ?? c.name}`}
                    disabled={creating}
                    onClick={() => void create('collection', c.id)}
                  >
                    <FolderPlus size={13} />
                  </button>
                  <button
                    className="icon-button rename-folder"
                    aria-label={`Rename ${c.title ?? c.name}`}
                    onClick={() => setRenaming({ ...c, name: c.title ?? c.name })}
                  >
                    <Pencil size={13} />
                  </button>
                </>
              )}
            </div>
            {children && expanded && renderFolderTree(c.id, depth + 1)}
          </div>
        );
      });
  }
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape' && peek) stopPeek();
      }}
      className={`app ${panels.right ? 'has-inspector' : ''} ${panels.left ? '' : 'hide-sidebar'} ${panels.right ? '' : 'hide-inspector'} ${item?.kind === 'note' ? 'editing-note' : ''} ${noteDetails ? 'show-note-details' : ''}`}
    >
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
        </div>
        <LibraryPicker onError={setError} />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Library navigation">
          {nav('all', Layers, 'All items', active.length)}
          {nav(
            'inbox',
            Archive,
            'Uncategorized',
            active.filter((i) => !i.collections.length).length,
          )}
          {nav('untagged', Tag, 'Untagged', active.filter((i) => !i.tags.length).length)}
          {nav('recent', Clock3, 'Recently used')}
          {nav('random', Shuffle, 'Random')}
          {nav('tags', Tag, 'All Tags', tags.length)}
          {nav('trash', Trash2, 'Trash', library.items.filter((i) => i.trashed).length)}
          {nav('favorites', Star, 'Favorites')}
          {nav('notes', FileText, 'Notes', active.filter((i) => i.kind === 'note').length)}
        </nav>
        <div className="nav-label">
          SMART FOLDERS{' '}
          <button
            className="icon-button"
            aria-label="New Smart Folder"
            onClick={() =>
              setSmart({
                name: '',
                match: 'all',
                rules: [{ field: 'name', operator: 'contains', value: '' }],
              })
            }
          >
            <Plus size={15} />
          </button>
        </div>
        <nav aria-label="Smart folders">
          {library.smartFolders?.map((folder) => (
            <div className="folder-row" key={folder.id}>
              {nav(
                `smart:${folder.id}`,
                Sparkles,
                folder.name,
                active.filter((i) => matchesSmartFolder(i, folder, dimensions[i.id])).length,
              )}
              <button
                className="icon-button rename-folder"
                aria-label={`Edit Smart Folder ${folder.name}`}
                onClick={() => setSmart(folder)}
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </nav>
        <div className="nav-label">
          FOLDERS
          <button
            className="icon-button"
            aria-label="New collection"
            disabled={creating}
            onClick={() => void create('collection')}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav aria-label="Folder tree">{renderFolderTree(null, 0)}</nav>
        <div className="sidebar-bottom">
          <input
            className="folder-filter"
            aria-label="Filter folders"
            placeholder="Filter folders…"
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
          />
          <button type="button" className="text-button" onClick={viewFolderRepair}>
            Repair Eagle folders…
          </button>
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
        onPaste={(e) => {
          if ((e.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return;
          const captures = Array.from(e.clipboardData.files)
            .filter((file) => file.type.startsWith('image/'))
            .map((file, n) => {
              const extension =
                file.type === 'image/jpeg'
                  ? 'jpg'
                  : file.type.split('/')[1].replace(/[^a-z0-9]/g, '');
              return new window.File(
                [file],
                `Clipboard ${new Date().toISOString().replace(/[:.]/g, '-')}${n ? '-' + (n + 1) : ''}.${extension}`,
                { type: file.type },
              );
            });
          if (captures.length) {
            e.preventDefault();
            void importFiles(captures);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading) void importFiles(e.dataTransfer.files);
        }}
      >
        <header className="topbar">
          <button
            type="button"
            className="icon-button desktop-panel-toggle"
            aria-label="Toggle folder sidebar"
            aria-pressed={panels.left}
            onClick={() => setPanels((p) => ({ ...p, left: !p.left }))}
          >
            <PanelLeft size={17} />
          </button>
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
            <select
              className="theme-select"
              aria-label="Appearance"
              value={theme}
              onChange={(e) => {
                const next = e.target.value as typeof theme;
                setTheme(next);
                localStorage.setItem('atlas.theme', next);
                window.atlasDesktop?.setAppearance(next).catch((e) => setError(e.message));
              }}
            >
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button
              type="button"
              className="icon-button desktop-panel-toggle"
              aria-label="Toggle inspector"
              aria-pressed={panels.right}
              onClick={() => setPanels((p) => ({ ...p, right: !p.right }))}
            >
              <PanelRight size={17} />
            </button>
            {item?.kind === 'note' && (
              <button
                type="button"
                className="icon-button note-details-toggle"
                aria-label="Toggle note details"
                aria-pressed={noteDetails}
                onClick={() => setNoteDetails((show) => !show)}
              >
                <PanelRight size={18} />
              </button>
            )}
            <button
              className="secondary"
              onClick={() => {
                if (dirty) {
                  setError('Save your changes before opening AI suggestions.');
                  return;
                }
                setShowAI(true);
              }}
            >
              AI suggestions
            </button>
            <details className="export-menu">
              <summary>
                <ArrowDownToLine size={16} />
                Export
              </summary>
              <div className="library-popover">
                <button
                  disabled={!bulk.length && !item}
                  onClick={() =>
                    void exportSelection(
                      bulk.length
                        ? library.items.filter((i) => bulk.includes(i.id))
                        : item
                          ? [item]
                          : [],
                    )
                  }
                >
                  Export selected files
                </button>
                <a aria-label="Export metadata manifest" href="/api/manifest">
                  Export catalog JSON
                </a>
                <small>Full backups are under Library → Back Up Library.</small>
              </div>
            </details>
            <span className="local-badge">
              <span className="status-dot" />
              Local
            </span>
          </div>
        </header>
        {item?.kind === 'note' && (
          <>
            {error && (
              <div className="alert note-error" role="alert">
                {error}
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError('')}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="note-host" ref={setEditorHost} />
          </>
        )}
        <div className="gallery-workspace" hidden={item?.kind === 'note'}>
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
              <button className="secondary" disabled={creating} onClick={() => void create('note')}>
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
          {scope === 'tags' ? (
            <TagWorkspace
              items={library.items}
              groups={library.tagGroups ?? []}
              openTag={(tag) => navigate(`tag:${tag}`)}
              onSave={async (group) => {
                await api(
                  '/tag-groups',
                  group.previousName ? 'PATCH' : 'POST',
                  group.previousName ? group : { ...group, createOnly: true },
                );
                await reload();
              }}
              onDelete={async (name) => {
                await api('/tag-groups', 'DELETE', { name });
                await reload();
              }}
              reviewTag={(change) => api('/tags/change/preview', 'POST', change)}
              applyTag={async (change) => {
                await api('/tags/change', 'POST', change);
                await reload();
                setNotice(`Updated tag #${change.to}`);
              }}
            />
          ) : (
            <>
              <div className="toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    onFocus={() => setSearching(true)}
                    onBlur={() => {
                      setSearching(false);
                      rememberSearch();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        rememberSearch();
                        setSearching(false);
                      }
                      if (e.key === 'Escape') setSearching(false);
                    }}
                    aria-label="Search library"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search titles, tags, and notes…"
                  />
                  {query && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {searching && !query && searchHistory.length > 0 && (
                    <div className="search-history">
                      {searchHistory.map((value) => (
                        <button
                          type="button"
                          key={value}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setQuery(value);
                            setSearching(false);
                          }}
                        >
                          <Clock3 size={13} />
                          {value}
                        </button>
                      ))}
                    </div>
                  )}
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
                      ['justified', Rows3, 'Justified'],
                      ['waterfall', Columns3, 'Waterfall'],
                      ['table', Table2, 'Table'],
                      ['graph', Network, 'Graph'],
                    ] as const
                  ).map(([value, Icon, label]) => (
                    <button
                      className={view === value ? 'active' : ''}
                      key={value}
                      title={`${label} view`}
                      aria-label={`${label} view`}
                      aria-pressed={view === value}
                      onClick={() => setView(value)}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
              </div>
              <FilterStrip
                rules={rules}
                setRules={setRules}
                collections={library.collections}
                tags={tags}
                save={() => setSmart({ name: '', match: 'all', rules })}
              />
              <div className="organize-toolbar">
                <span>{filtered.length} items</span>
                <label>
                  Sort{' '}
                  <select
                    aria-label="Sort items"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name A–Z</option>
                    <option value="size">Largest first</option>
                  </select>
                </label>
                <label className="size-control">
                  Thumbnail size
                  <input
                    aria-label="Thumbnail size"
                    type="range"
                    min="105"
                    max="280"
                    step="10"
                    value={tileSize}
                    onChange={(e) => setTileSize(Number(e.target.value))}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => setBulk(filtered.slice(0, 500).map((i) => i.id))}
                >
                  Select all{filtered.length > 500 ? ' (first 500)' : ''}
                </button>
                {item && (
                  <button className="text-button" onClick={() => setPreview(item.id)}>
                    Quick preview <kbd>Space</kbd>
                  </button>
                )}
              </div>
              {bulk.length > 0 && (
                <BulkBar
                  items={library.items.filter((i) => bulk.includes(i.id))}
                  collections={library.collections}
                  onApply={applyBulk}
                  onClear={() => setBulk([])}
                />
              )}
              {error && (
                <div className="alert" role="alert">
                  <span>{error}</span>
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => setError('')}
                  >
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
                    <span className="eyebrow">
                      {active.length ? 'ROOM TO EXPLORE' : 'A FRESH START'}
                    </span>
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
                ) : view !== 'table' && view !== 'graph' ? (
                  <Gallery
                    items={filtered}
                    view={view}
                    size={tileSize}
                    dimensions={dimensions}
                    render={(i, height) => (
                      <div
                        key={i.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          stopPeek();
                          setItemMenu({ item: i, x: e.clientX, y: e.clientY });
                        }}
                        className={`asset-card ${selected === i.id || bulk.includes(i.id) ? 'selected' : ''}`}
                      >
                        <input
                          className="card-checkbox"
                          type="checkbox"
                          aria-label={`Select ${i.title}`}
                          checked={bulk.includes(i.id)}
                          onChange={(e) =>
                            setBulk((ids) =>
                              e.target.checked ? [...ids, i.id] : ids.filter((id) => id !== i.id),
                            )
                          }
                        />
                        <button
                          className="asset-open"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey)
                              setBulk((ids) =>
                                ids.includes(i.id)
                                  ? ids.filter((id) => id !== i.id)
                                  : [...ids, i.id],
                              );
                            else select(i.id);
                          }}
                          onDoubleClick={() =>
                            i.kind === 'note' ? select(i.id) : setPreview(i.id)
                          }
                        >
                          <div className="thumbnail" style={{ height }}>
                            <Thumbnail item={i} onDimensions={(d) => updateVisual(i.id, d)} />
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
                          </div>
                        </button>
                        <button
                          type="button"
                          className="card-zoom"
                          title="Quick preview"
                          aria-label={`Preview ${i.title}`}
                          onPointerEnter={(e) => {
                            if (e.pointerType === 'mouse') startPeek(i);
                          }}
                          onPointerLeave={stopPeek}
                          onClick={() => {
                            stopPeek();
                            setPreview(i.id);
                          }}
                        >
                          <ZoomIn size={16} />
                        </button>
                        <button
                          type="button"
                          className="card-actions"
                          aria-label={`Actions for ${i.title}`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setItemMenu({ item: i, x: rect.left, y: rect.bottom });
                          }}
                        >
                          ···
                        </button>
                      </div>
                    )}
                  />
                ) : view === 'table' ? (
                  <TableView items={filtered} onSelect={select} selected={selected} />
                ) : (
                  <GraphView items={filtered} onSelect={select} />
                )}
              </section>
              <footer className="workspace-footer">
                <span>
                  {filtered.length} items <span>·</span>{' '}
                  {bytes(filtered.reduce((n, i) => n + i.size, 0))}
                </span>
                <span>
                  Local library <span>·</span> Atlas 0.5
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {showAI && (
        <div className="ai-shade" onClick={() => setShowAI(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <AiPanel item={item} onClose={() => setShowAI(false)} onApplied={reload} />
          </div>
        </div>
      )}
      {preview && library.items.find((i) => i.id === preview) && (
        <Lightbox
          item={library.items.find((i) => i.id === preview)!}
          onClose={() => setPreview(null)}
          onPrevious={() => {
            const index = filtered.findIndex((i) => i.id === preview);
            setPreview(filtered[(index - 1 + filtered.length) % filtered.length]?.id ?? null);
          }}
          onNext={() => {
            const index = filtered.findIndex((i) => i.id === preview);
            setPreview(filtered[(index + 1) % filtered.length]?.id ?? null);
          }}
        />
      )}
      {panels.right && (bulk.length > 0 || !item || scope === 'tags') && (
        <aside className="inspector selection-inspector">
          <div className="inspector-heading">
            <span>{bulk.length ? 'SELECTION' : 'DETAILS'}</span>
            <button
              className="icon-button"
              aria-label="Pin inspector"
              aria-pressed={pin}
              onClick={() => setPin(!pin)}
            >
              <Pin size={16} />
            </button>
          </div>
          <strong>{bulk.length ? `${bulk.length} selected` : title}</strong>
          <dl>
            <dt>Items</dt>
            <dd>{bulk.length || filtered.length}</dd>
            <dt>Total size</dt>
            <dd>
              {bytes(
                (bulk.length ? library.items.filter((i) => bulk.includes(i.id)) : filtered).reduce(
                  (sum, i) => sum + i.size,
                  0,
                ),
              )}
            </dd>
          </dl>
          {!!bulk.length && (
            <button
              className="secondary"
              onClick={() => void exportSelection(library.items.filter((i) => bulk.includes(i.id)))}
            >
              Export selected
            </button>
          )}
        </aside>
      )}
      {item && scope !== 'tags' && (bulk.length === 0 || item.kind === 'note') && (
        <Inspector
          key={`${item.id}-${item.revision}`}
          item={item}
          items={library.items}
          collections={library.collections}
          onClose={() => {
            if (!dirty || window.confirm('Discard your unsaved changes and close this item?')) {
              setSelected(null);
              setNoteDetails(false);
            }
          }}
          onSave={save}
          onRestore={restore}
          onDirty={setDirty}
          editorHost={editorHost}
          onOpen={select}
          onColorFilter={(color) => {
            setRules((current) => [
              ...current.filter((r) => r.field !== 'color'),
              { field: 'color', operator: 'is', value: color, tolerance: 12 },
            ]);
            navigate('all');
          }}
          noteReading={item.id === readingNoteId}
          onNoteReadingChange={(reading) => setReadingNoteId(reading ? item.id : null)}
        />
      )}
      {peek && !preview && <HoverPeek item={peek} />}
      {itemMenu && (
        <ItemMenu
          x={itemMenu.x}
          y={itemMenu.y}
          onClose={() => setItemMenu(null)}
          actions={[
            { label: 'Quick Preview', run: () => setPreview(itemMenu.item.id) },
            ...(window.atlasDesktop &&
            itemMenu.item.kind === 'asset' &&
            imageSearchExtension(itemMenu.item.mime)
              ? [{ label: 'Search web by image…', run: () => setImageSearch(itemMenu.item) }]
              : []),
            ...(window.atlasDesktop
              ? [
                  {
                    label: 'Open a copy in default app',
                    run: () =>
                      void window.atlasDesktop
                        ?.itemAction(itemMenu.item.id, 'open-copy')
                        .catch((e) => setError(e.message)),
                  },
                  ...(itemMenu.item.kind === 'asset'
                    ? [
                        {
                          label: 'Reveal original file',
                          run: () =>
                            void window.atlasDesktop
                              ?.itemAction(itemMenu.item.id, 'reveal')
                              .catch((e) => setError(e.message)),
                        },
                      ]
                    : []),
                ]
              : []),
            {
              label: 'Copy title',
              run: () =>
                void navigator.clipboard
                  .writeText(itemMenu.item.title)
                  .then(() => setNotice('Title copied'))
                  .catch((e) => setError(e.message)),
            },
            {
              label: 'Open details',
              run: () => {
                setPanels((p) => ({ ...p, right: true }));
                setNoteDetails(true);
                select(itemMenu.item.id);
              },
            },
            {
              label: 'Rename',
              run: () => {
                setPanels((p) => ({ ...p, right: true }));
                select(itemMenu.item.id);
                requestAnimationFrame(() => {
                  const field = document.querySelector<HTMLInputElement>(
                    '[aria-label="Item title"]',
                  );
                  field?.focus();
                  field?.select();
                });
              },
            },
            {
              label: 'Add to folders',
              run: () => {
                setPanels((p) => ({ ...p, right: true }));
                select(itemMenu.item.id);
                requestAnimationFrame(() =>
                  document
                    .querySelector('[aria-label="Item title"]')
                    ?.closest('form')
                    ?.querySelector<HTMLDetailsElement>('details.folder-membership')
                    ?.setAttribute('open', ''),
                );
              },
            },
            {
              label: 'Export original or Markdown',
              run: () => void exportSelection([itemMenu.item]),
            },
            {
              label: itemMenu.item.trashed ? 'Restore item' : 'Move to Trash',
              run: () =>
                void applyBulk([
                  {
                    id: itemMenu.item.id,
                    patch: {
                      expectedRevision: itemMenu.item.revision,
                      trashed: !itemMenu.item.trashed,
                    },
                  },
                ]),
            },
          ]}
        />
      )}
      {imageSearch && (
        <ReverseImageDialog item={imageSearch} onClose={() => setImageSearch(undefined)} />
      )}
      {smart && (
        <SmartEditor
          initial={smart}
          items={active}
          collections={library.collections}
          tags={tags}
          visual={dimensions}
          onClose={() => setSmart(null)}
          onSave={async (data) => {
            const folder = await api<SmartFolder>(
              smart.id ? `/smart-folders/${smart.id}` : '/smart-folders',
              smart.id ? 'PATCH' : 'POST',
              data,
            );
            await reload();
            setRules([]);
            navigate(`smart:${folder.id}`);
          }}
          onDelete={async () => {
            await api(`/smart-folders/${smart.id}`, 'DELETE');
            await reload();
            navigate('all');
          }}
        />
      )}
      {repair && (
        <WorkspaceDialog
          title="Review Eagle folder repair"
          onClose={() => {
            if (!repairBusy) setRepair(null);
          }}
        >
          <p>
            {repair.changes.length
              ? `${repair.changes.length} folders can be put back under their Eagle parents.`
              : 'No matching flat Eagle folders need repair.'}
          </p>
          <ul>
            {repair.changes.map((entry) => (
              <li key={entry.from}>{entry.from}</li>
            ))}
          </ul>
          {repair.skipped.length > 0 && (
            <details>
              <summary>{repair.skipped.length} unmatched paths will be kept as they are</summary>
              <ul>
                {repair.skipped.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
          {repairError && <p role="alert">{repairError}</p>}
          <div className="workspace-button-row">
            <button
              className="primary"
              disabled={repairBusy || !repair.changes.length}
              onClick={async () => {
                setRepairBusy(true);
                setRepairError('');
                try {
                  await api('/eagle/folder-repair', 'POST', { key: repair.key });
                  await reload();
                  setRepair(null);
                  setNotice('Eagle folder tree repaired');
                } catch (e) {
                  setRepairError((e as Error).message);
                } finally {
                  setRepairBusy(false);
                }
              }}
            >
              Apply repair
            </button>
            <button className="secondary" disabled={repairBusy} onClick={() => setRepair(null)}>
              Cancel
            </button>
          </div>
        </WorkspaceDialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          {!!undo.length && (
            <button
              className="text-button"
              onClick={() => {
                const changes = undo;
                setUndo([]);
                void applyBulk(changes);
              }}
            >
              Undo
            </button>
          )}
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
