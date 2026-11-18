import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  Check,
  Minus,
  ArrowDownToLine,
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
} from 'lucide-react';
import { GraphView } from './GraphView';
import { ImageDetail } from './ImageDetail';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import type { Item, ItemPatch, Collection, LibrarySnapshot, HistoryEntry } from '../shared/model';
import './styles.css';
import './workspace.css';
import { useAutosave } from './useAutosave';
import { BulkBar, Lightbox } from './LibraryTools';
import { AiPanel } from './AiPanel';
import { NoteEditor } from './NoteEditor';
import { Gallery, type GalleryView, type Dimensions } from './Gallery';
import { ImageProperties, imageColors } from './ImageProperties';
import {
  LibraryPicker,
  FilterStrip,
  TypePicker,
  type TypeSelection,
  SmartEditor,
  TagWorkspace,
  WorkspaceDialog,
} from './WorkspaceTools';
import { HoverPeek, InlineVideo, ItemMenu, ReverseImageDialog } from './GalleryActions';
import { imageSearchExtension } from '../shared/image-search';
import { descendantIds } from '../shared/collections';
import {
  fileType,
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
  if (!response.ok)
    throw Object.assign(new Error(result.error ?? 'Request failed'), { status: response.status });
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
  onMenu,
}: {
  items: Item[];
  onSelect: (id: string) => void;
  selected: string | null;
  onMenu: (item: Item, x: number, y: number) => void;
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
            <tr
              key={row.id}
              data-item-id={row.original.id}
              className={selected === row.original.id ? 'selected' : ''}
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu(row.original, event.clientX, event.clientY);
              }}
            >
              {row.getVisibleCells().map((cell, i) => (
                <td key={cell.id}>
                  {i === 0 ? (
                    <button
                      className="cell-button"
                      onClick={() => onSelect(row.original.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                          event.preventDefault();
                          const row = event.currentTarget.closest('tr');
                          const next =
                            event.key === 'ArrowUp'
                              ? row?.previousElementSibling
                              : row?.nextElementSibling;
                          next?.querySelector<HTMLButtonElement>('.cell-button')?.focus();
                        } else if (
                          event.key === 'ContextMenu' ||
                          (event.key === 'F10' && event.shiftKey)
                        ) {
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          onMenu(row.original, rect.left, rect.bottom);
                        }
                      }}
                    >
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
  draft,
  saving,
  problem,
  onEdit,
  onRetry,
  onUseSaved,
  items,
  collections,
  onClose,
  onSave,
  onRestore,
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
  draft: Item;
  saving: boolean;
  problem?: { message: string; conflict: boolean };
  onEdit: (fields: Partial<ItemPatch>) => void;
  onRetry: (overwrite?: boolean) => void;
  onUseSaved: () => void;
  editorHost: HTMLDivElement | null;
  onOpen: (id: string) => void;
  noteReading: boolean;
  onNoteReadingChange: (reading: boolean) => void;
  onColorFilter: (color: string) => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('related to');
  const [tagText, setTagText] = useState<string>();
  const tags = tagText ?? draft.tags.join(', ');
  const pendingRelation = items.some((candidate) => candidate.id === target && !candidate.trashed)
    ? { target, label: label.trim() || 'related to' }
    : null;
  useEffect(() => {
    let current = true;
    if (!item.id) return;
    api<HistoryEntry[]>(`/items/${item.id}/history`)
      .then((rows) => {
        if (current) setHistory(rows);
      })
      .catch(() => {
        if (current) setHistory([]);
      });
    return () => {
      current = false;
    };
  }, [item.id, item.revision]);
  const field = <K extends keyof Item>(key: K, value: Item[K]) => onEdit({ [key]: value });
  function editTags(value: string) {
    setTagText(value);
    onEdit({
      tags: [
        ...new Set(
          value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ],
    });
  }
  function addRelation() {
    if (!pendingRelation) return;
    if (
      !draft.relations.some(
        (relation) =>
          relation.target === pendingRelation.target && relation.label === pendingRelation.label,
      )
    )
      field('relations', [...draft.relations, pendingRelation]);
    setTarget('');
  }
  const saveStatus = problem ? (
    <div className="draft-status" role="alert">
      {problem.message}
      <button type="button" className="text-button" onClick={() => onRetry(problem.conflict)}>
        {problem.conflict ? 'Keep my edits' : 'Retry'}
      </button>
      {problem.conflict && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setTagText(undefined);
            onUseSaved();
          }}
        >
          Use saved version
        </button>
      )}
    </div>
  ) : (
    <small className="draft-status" role="status">
      {saving ? 'Saving…' : 'Changes saved'}
    </small>
  );
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>ITEM DETAILS</span>
        <button className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pendingRelation) addRelation();
          else onRetry();
        }}
      >
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
              onChange={(e) => editTags(e.target.value)}
              onBlur={() => setTagText(undefined)}
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
                  editTags(
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
              onClick={addRelation}
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
        {item.kind !== 'note' && saveStatus}
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
            if (!saving) void onSave({ expectedRevision: item.revision, trashed: !item.trashed });
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
            saveStatus={saveStatus}
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
    [types, setTypes] = useState<TypeSelection>({}),
    [view, setView] = useState<GalleryView | 'table' | 'graph'>('grid'),
    [selected, setSelected] = useState<string | null>(null),
    [uploading, setUploading] = useState(''),
    [renaming, setRenaming] = useState<Collection | null>(null),
    [creating, setCreating] = useState(false),
    [menu, setMenu] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const [imageDetail, setImageDetail] = useState(false);
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
  const [folderMenu, setFolderMenu] = useState<{ folder: Collection; x: number; y: number }>();
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
  const previousPanels = useRef({ left: true, right: true });
  const rangeAnchor = useRef<string | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; existing: string[] } | null>(null);
  const marqueeMoved = useRef(false);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const [subfolderContents, setSubfolderContents] = useState<string[]>([]);
  const autosave = useAutosave(
    (id) => api<Item>(`/items/${id}`),
    (id, patch) => api<Item>(`/items/${id}`, 'PATCH', patch),
    (saved) =>
      setLibrary((previous) => ({
        ...previous,
        items: previous.items.map((item) =>
          item.id === saved.id && item.revision <= saved.revision ? saved : item,
        ),
      })),
  );
  const dirty = !!(selected && autosave.drafts[selected]);
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
      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        setPanels((current) => {
          if (!current.left && !current.right) return previousPanels.current;
          previousPanels.current = current;
          return { left: false, right: false };
        });
        return;
      }
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
  const fileInput = useRef<HTMLInputElement>(null);
  const gallerySurface = useRef<HTMLElement>(null);
  useEffect(() => {
    const region = gallerySurface.current;
    if (!region || view === 'table' || view === 'graph') return;
    let delta = 0;
    let last = 0;
    function step(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const time = performance.now();
      if (time - last > 180) delta = 0;
      last = time;
      delta += event.deltaY;
      if (Math.abs(delta) < 18) return;
      const change = delta > 0 ? -10 : 10;
      delta = 0;
      setTileSize((size) => Math.max(105, Math.min(280, size + change)));
    }
    region.addEventListener('wheel', step, { passive: false });
    return () => region.removeEventListener('wheel', step);
  }, [scope, view]);
  const reload = async () => {
    const data = await api<LibrarySnapshot>('/library');
    setLibrary((previous) => {
      const newer = new Map(previous.items.map((item) => [item.id, item]));
      return {
        ...data,
        items: data.items.map((item) => {
          const current = newer.get(item.id);
          return current && current.revision > item.revision ? current : item;
        }),
      };
    });
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
  const includesByType = Object.values(types).includes('include');
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
          if (scope.startsWith('collection:')) {
            const id = scope.slice(11);
            if (
              !i.collections.some(
                (member) =>
                  member === id ||
                  (subfolderContents.includes(id) && folderTotals.get(id)?.members.has(member)),
              )
            )
              return false;
          }
          if (scope === 'recent' && !recent.includes(i.id)) return false;
          if (scope.startsWith('smart:')) {
            const folder = library.smartFolders?.find((f) => f.id === scope.slice(6));
            if (!folder || !matchesSmartFolder(i, folder, dimensions[i.id])) return false;
          }
          if (!rules.every((rule) => matchesRule(i, rule, dimensions[i.id]))) return false;
          if (scope.startsWith('tag:') && !i.tags.includes(scope.slice(4))) return false;
          const type = types[fileType(i)];
          if (type === 'exclude' || (includesByType && type !== 'include')) return false;
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
    [
      library,
      scope,
      types,
      query,
      sort,
      dimensions,
      folderTotals,
      recent,
      randomOrder,
      rules,
      subfolderContents,
      includesByType,
    ],
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
  const folder = scope.startsWith('collection:')
    ? library.collections.find((entry) => entry.id === scope.slice(11))
    : undefined;
  const children = folder
    ? library.collections.filter((entry) => entry.parentId === folder.id)
    : [];
  const inspectorOpen = panels.right && (!!item || !!folder || bulk.length > 0);
  function focusTile(button: HTMLButtonElement, key: string) {
    const tiles = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.library-content .asset-open'),
    );
    const origin = button.getBoundingClientRect();
    const x = origin.left + origin.width / 2;
    const y = origin.top + origin.height / 2;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    const candidates = tiles
      .filter((tile) => tile !== button)
      .map((tile) => {
        const rect = tile.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - x;
        const dy = rect.top + rect.height / 2 - y;
        return {
          tile,
          axis: direction * (horizontal ? dx : dy),
          cross: Math.abs(horizontal ? dy : dx),
        };
      })
      .filter(({ axis }) => axis > 4)
      .sort((a, b) => a.axis + a.cross * 2 - (b.axis + b.cross * 2));
    candidates[0]?.tile.focus();
  }
  function selectRange(id: string) {
    const keys = filtered.map((entry) => entry.id);
    const a = keys.indexOf(rangeAnchor.current ?? selected ?? id);
    const b = keys.indexOf(id);
    if (b < 0) return;
    const start = a < 0 ? b : a;
    setBulk(keys.slice(Math.min(start, b), Math.max(start, b) + 1));
  }
  const select = React.useCallback((id: string) => {
    setImageDetail(false);
    setSelected(id);
    setRecent((ids) => [id, ...ids.filter((value) => value !== id)].slice(0, 100));
  }, []);
  const navigate = (value: string) => {
    if (selected) void autosave.flush(selected);
    setSelected(null);
    setImageDetail(false);
    setBulk([]);
    if (value === 'random') {
      const ids = active.map((i) => i.id);
      for (let index = ids.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [ids[index], ids[other]] = [ids[other], ids[index]];
      }
      setRandomOrder(ids);
    }
    setScope(value);
    setMenu(false);
  };
  async function applyBulk(changes: { id: string; patch: ItemPatch }[]) {
    if (changes.some(({ id }) => autosave.drafts[id])) {
      setError('Let the selected items finish autosaving before updating them together.');
      return;
    }
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
    if (dirty) {
      setError('Finish saving this item before restoring a revision.');
      return;
    }
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
      setTypes({});
      setRules([]);
      setNotice(`${count} ${count === 1 ? 'file' : 'files'} imported`);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  async function create(kind: 'note' | 'collection', parentId?: string) {
    if (creating) return;
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
        setTypes({});
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
    if (i.kind === 'note' || i.mime.startsWith('image/') || i.mime.startsWith('video/'))
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
  function openFolderMenu(folder: Collection, event: React.MouseEvent | React.KeyboardEvent) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setFolderMenu({
      folder,
      x: 'clientX' in event ? event.clientX : rect.left,
      y: 'clientY' in event ? event.clientY : rect.bottom,
    });
  }
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
              onContextMenu={(event) => openFolderMenu(c, event)}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                  openFolderMenu(c, event);
              }}
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
                </>
              )}
            </div>
            {children && expanded && (
              <div className="tree-children">{renderFolderTree(c.id, depth + 1)}</div>
            )}
          </div>
        );
      });
  }
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape' && peek) stopPeek();
      }}
      className={`app ${inspectorOpen ? 'has-inspector' : ''} ${panels.left ? '' : 'hide-sidebar'} ${panels.right ? '' : 'hide-inspector'} ${item?.kind === 'note' ? 'editing-note' : ''} ${noteDetails ? 'show-note-details' : ''}`}
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
        <LibraryPicker onError={setError} onRepair={viewFolderRepair} />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Library navigation">
          {nav('all', Layers, 'All items')}
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
        {imageDetail && item?.mime.startsWith('image/') && (
          <ImageDetail
            key={item.id}
            item={item}
            onBack={() => {
              setImageDetail(false);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>(
                    `[data-item-id="${item.id}"] :is(.asset-open, .cell-button)`,
                  )
                  ?.focus(),
              );
            }}
            onStep={(direction) => {
              const images = filtered.filter((entry) => entry.mime.startsWith('image/'));
              const index = images.findIndex((entry) => entry.id === item.id) + direction;
              if (images[index]) setSelected(images[index].id);
            }}
          />
        )}
        <div
          className="gallery-workspace"
          hidden={item?.kind === 'note' || (imageDetail && !!item?.mime.startsWith('image/'))}
        >
          <section className="workspace-heading">
            <div>
              <h1>
                {title}
                <span>{filtered.length}</span>
              </h1>
            </div>
            <div className="heading-actions">
              <details className="new-item-menu">
                <summary className="secondary">
                  <Plus size={15} /> New
                </summary>
                <div className="library-popover">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void create('note');
                    }}
                  >
                    <FileText size={14} /> New note
                  </button>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void create('collection', folder?.id);
                    }}
                  >
                    <Folder size={14} /> New folder
                  </button>
                </div>
              </details>
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
                <div className="search library-search" role="search">
                  <Search size={16} />
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
                  <TypePicker items={active} selection={types} setSelection={setTypes} />
                </div>
                <div className="view-switch" aria-label="Library view">
                  {(
                    [
                      ['grid', Grid2X2, 'Grid'],
                      ['table', Table2, 'List'],
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
                  <details className="gallery-view-options">
                    <summary title="View options" aria-label="View options">
                      <ChevronRight size={15} />
                    </summary>
                    <div className="library-popover">
                      <button
                        type="button"
                        title="Justified view"
                        onClick={(event) => {
                          setView('justified');
                          event.currentTarget.closest('details')?.removeAttribute('open');
                        }}
                      >
                        <Rows3 size={15} /> Justified view
                      </button>
                      <button
                        type="button"
                        title="Waterfall view"
                        onClick={(event) => {
                          setView('waterfall');
                          event.currentTarget.closest('details')?.removeAttribute('open');
                        }}
                      >
                        <Columns3 size={15} /> Waterfall view
                      </button>
                    </div>
                  </details>
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
                <div className="size-control">
                  <button
                    type="button"
                    className="icon-button"
                    title="Smaller thumbnails"
                    aria-label="Smaller thumbnails"
                    onClick={() => setTileSize((size) => Math.max(105, size - 10))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label="Thumbnail size"
                    type="range"
                    min="105"
                    max="280"
                    step="10"
                    value={tileSize}
                    onChange={(e) => setTileSize(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    title="Larger thumbnails"
                    aria-label="Larger thumbnails"
                    onClick={() => setTileSize((size) => Math.min(280, size + 10))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
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
              <section
                className="library-content"
                ref={gallerySurface}
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (
                    view === 'table' ||
                    view === 'graph' ||
                    event.button !== 0 ||
                    event.pointerType !== 'mouse' ||
                    target.closest('button,input,form,canvas')
                  )
                    return;
                  if (target !== event.currentTarget && !target.closest('.asset-grid')) return;
                  marqueeStart.current = {
                    x: event.clientX,
                    y: event.clientY,
                    existing: event.shiftKey || event.metaKey || event.ctrlKey ? bulk : [],
                  };
                  marqueeMoved.current = false;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const start = marqueeStart.current;
                  if (!start) return;
                  const width = Math.abs(event.clientX - start.x);
                  const height = Math.abs(event.clientY - start.y);
                  if (!marqueeMoved.current && Math.max(width, height) < 6) return;
                  marqueeMoved.current = true;
                  const left = Math.min(event.clientX, start.x);
                  const top = Math.min(event.clientY, start.y);
                  setMarquee({ left, top, width, height });
                  const inside = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>('[data-item-id]'),
                  ).flatMap((tile) => {
                    const rect = tile.querySelector('.thumbnail')?.getBoundingClientRect();
                    return rect &&
                      rect.left < left + width &&
                      rect.right > left &&
                      rect.top < top + height &&
                      rect.bottom > top
                      ? [tile.dataset.itemId!]
                      : [];
                  });
                  setBulk([...new Set([...start.existing, ...inside])]);
                }}
                onLostPointerCapture={() => {
                  marqueeStart.current = null;
                  setMarquee(undefined);
                }}
                onClick={(event) => {
                  if (marqueeMoved.current) {
                    marqueeMoved.current = false;
                    return;
                  }
                  if (event.target === event.currentTarget) {
                    setSelected(null);
                    setBulk([]);
                  }
                }}
                onKeyDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.matches('input, select, textarea')) return;
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
                    event.preventDefault();
                    setBulk(filtered.slice(0, 500).map((entry) => entry.id));
                    if (filtered.length > 500)
                      setNotice('Selected the first 500 items for batch editing.');
                  } else if (event.key === 'Escape') {
                    setSelected(null);
                    setBulk([]);
                  } else if (
                    event.key === 'Delete' ||
                    ((event.ctrlKey || event.metaKey) && event.key === 'Backspace')
                  ) {
                    const ids = bulk.length
                      ? new Set(bulk)
                      : new Set([
                          target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId ?? selected,
                        ]);
                    const changes = filtered
                      .filter((entry) => !entry.trashed && ids.has(entry.id))
                      .map((entry) => ({
                        id: entry.id,
                        patch: { expectedRevision: entry.revision, trashed: true },
                      }));
                    if (changes.length) {
                      event.preventDefault();
                      void applyBulk(changes);
                    }
                  }
                }}
              >
                {folder && children.length > 0 && (
                  <section className="subfolder-section" aria-label="Subfolders">
                    <header>
                      <h2>Subfolders</h2>
                      <label>
                        <input
                          type="checkbox"
                          checked={subfolderContents.includes(folder.id)}
                          onChange={(event) =>
                            setSubfolderContents((ids) =>
                              event.target.checked
                                ? [...ids, folder.id]
                                : ids.filter((id) => id !== folder.id),
                            )
                          }
                        />{' '}
                        Show subfolder contents
                      </label>
                    </header>
                    <div className="subfolder-files">
                      {children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => navigate(`collection:${child.id}`)}
                        >
                          <Folder size={21} />
                          <span>{child.title ?? child.name}</span>
                          <small>{folderTotals.get(child.id)?.count ?? 0}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {loading ? (
                  <div className="empty-state">
                    <LoaderCircle size={28} />
                    <h2>Opening your library…</h2>
                  </div>
                ) : !filtered.length && children.length ? null : !filtered.length ? (
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
                        data-item-id={i.id}
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
                            if (e.shiftKey) selectRange(i.id);
                            else if (e.metaKey || e.ctrlKey) {
                              rangeAnchor.current = i.id;
                              setBulk((ids) =>
                                ids.includes(i.id)
                                  ? ids.filter((id) => id !== i.id)
                                  : [...ids, i.id],
                              );
                            } else {
                              rangeAnchor.current = i.id;
                              setBulk([]);
                              select(i.id);
                              setImageDetail(i.mime.startsWith('image/'));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                                event.key,
                              )
                            ) {
                              event.preventDefault();
                              focusTile(event.currentTarget, event.key);
                            } else if (
                              event.key === 'ContextMenu' ||
                              (event.shiftKey && event.key === 'F10')
                            ) {
                              event.preventDefault();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setItemMenu({ item: i, x: rect.left, y: rect.top });
                            }
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
                          onFocus={() => startPeek(i)}
                          onBlur={stopPeek}
                          onClick={() => {
                            stopPeek();
                            setPreview(i.id);
                          }}
                        >
                          <ZoomIn size={16} />
                        </button>
                      </div>
                    )}
                  />
                ) : view === 'table' ? (
                  <TableView
                    items={filtered}
                    onSelect={(id) => {
                      select(id);
                      setImageDetail(
                        !!library.items.find((entry) => entry.id === id)?.mime.startsWith('image/'),
                      );
                    }}
                    selected={selected}
                    onMenu={(item, x, y) => setItemMenu({ item, x, y })}
                  />
                ) : (
                  <GraphView items={filtered} selected={selected} onSelect={select} />
                )}
              </section>
            </>
          )}
        </div>
      </main>
      {marquee && <div className="gallery-marquee" style={marquee} aria-hidden="true" />}
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
      {panels.right && (bulk.length > 0 || (!item && !!folder)) && (
        <aside className="inspector selection-inspector">
          <div className="inspector-heading">
            <span>{bulk.length ? 'SELECTION' : 'DETAILS'}</span>
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
          key={item.id}
          item={item}
          items={library.items}
          collections={library.collections}
          onClose={() => {
            void autosave.flush(item.id);
            setSelected(null);
            setNoteDetails(false);
          }}
          draft={{ ...item, ...autosave.drafts[item.id]?.changes }}
          saving={!!autosave.drafts[item.id]}
          problem={autosave.problems[item.id]}
          onEdit={(changes) => autosave.change(item, changes)}
          onRetry={(overwrite) => void autosave.flush(item.id, overwrite)}
          onUseSaved={() => void autosave.useSaved(item.id)}
          onSave={save}
          onRestore={restore}
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
      {folderMenu && (
        <ItemMenu
          x={folderMenu.x}
          y={folderMenu.y}
          label="Folder actions"
          onClose={() => setFolderMenu(undefined)}
          actions={[
            { label: 'New subfolder', run: () => void create('collection', folderMenu.folder.id) },
            {
              label: 'Rename folder',
              run: () =>
                setRenaming({
                  ...folderMenu.folder,
                  name: folderMenu.folder.title ?? folderMenu.folder.name,
                }),
            },
            {
              label: collapsed.includes(folderMenu.folder.id) ? 'Expand folder' : 'Collapse folder',
              run: () =>
                setCollapsed((ids) =>
                  ids.includes(folderMenu.folder.id)
                    ? ids.filter((id) => id !== folderMenu.folder.id)
                    : [...ids, folderMenu.folder.id],
                ),
            },
          ]}
        />
      )}
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
