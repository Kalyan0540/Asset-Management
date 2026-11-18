import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Star, Tag, FolderPlus, Check, Maximize2 } from 'lucide-react';
import type { Item, Collection, ItemPatch } from '../shared/model';

export function BulkBar({
  items,
  collections,
  onApply,
  onClear,
}: {
  items: Item[];
  collections: Collection[];
  onApply: (patches: { id: string; patch: ItemPatch }[]) => Promise<void>;
  onClear: () => void;
}) {
  const [tag, setTag] = useState('');
  const apply = (change: (item: Item) => Partial<ItemPatch>) =>
    void onApply(
      items.map((i) => ({ id: i.id, patch: { expectedRevision: i.revision, ...change(i) } })),
    );
  return (
    <div className="bulk-bar" role="region" aria-label="Selected items">
      <strong>{items.length} selected</strong>
      <input
        aria-label="Bulk tag"
        placeholder="Add a tag…"
        value={tag}
        maxLength={80}
        onChange={(e) => setTag(e.target.value)}
      />
      <button
        disabled={!tag.trim()}
        onClick={() => {
          apply((i) => ({ tags: [...new Set([...i.tags, tag.trim()])] }));
          setTag('');
        }}
      >
        <Tag size={14} />
        Add tag
      </button>
      <select
        aria-label="Add selected items to collection"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (id) apply((i) => ({ collections: [...new Set([...i.collections, id])] }));
        }}
      >
        <option value="">Add to collection…</option>
        {collections.map((c) => (
          <option value={c.id} key={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button onClick={() => apply(() => ({ favorite: true }))}>
        <Star size={14} />
        Favorite
      </button>
      <button onClick={() => apply(() => ({ trashed: true }))}>
        <Trash2 size={14} />
        Trash
      </button>
      <button aria-label="Clear selection" onClick={onClear}>
        <X size={16} />
      </button>
    </div>
  );
}
export function Lightbox({
  item,
  onClose,
  onPrevious,
  onNext,
}: {
  item: Item;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [zoom, setZoom] = useState(0);
  const [gray, setGray] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const focus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => () => focus.current?.focus(), []);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const media = target.closest('video,audio');
      if (
        e.key === 'Escape' ||
        (e.code === 'Space' && !media && !target.closest('button,a,input'))
      ) {
        e.preventDefault();
        onClose();
      }
      if (!media && e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrevious();
      }
      if (!media && e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            'button,a,video[controls],audio[controls],iframe',
          ) ?? [],
        );
        if (e.shiftKey && e.target === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        }
        if (!e.shiftKey && e.target === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, onNext, onPrevious]);
  const url = `/api/items/${item.id}/content`;
  return (
    <div
      ref={panel}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${item.title}`}
    >
      <header>
        <strong>{item.title}</strong>
        <span>← → to browse · Esc to close</span>
        <button autoFocus aria-label="Close preview" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div className={`lightbox-content ${zoom ? 'zoom-active' : ''}`}>
        {item.mime.startsWith('image/') ? (
          <img
            src={url}
            alt={item.title}
            style={{
              width: zoom ? `${zoom}%` : undefined,
              filter: gray ? 'grayscale(1)' : undefined,
            }}
          />
        ) : item.mime.startsWith('video/') ? (
          <video src={url} controls autoPlay />
        ) : item.mime.startsWith('audio/') ? (
          <audio src={url} controls />
        ) : item.kind === 'note' ? (
          <pre>{item.body}</pre>
        ) : item.mime === 'application/pdf' ? (
          <iframe title={item.title} src={url} />
        ) : (
          <p>
            Preview unavailable. <a href={url + '?download=1'}>Download the original</a>.
          </p>
        )}
      </div>
      <footer>
        <button onClick={onPrevious}>Previous</button>
        <button onClick={onNext}>Next</button>
        {item.mime.startsWith('image/') && (
          <>
            <button onClick={() => setZoom(0)} aria-pressed={zoom === 0}>
              Fit
            </button>
            <button onClick={() => setZoom(Math.min(400, (zoom || 100) + 50))} aria-label="Zoom in">
              +
            </button>
            <button onClick={() => setZoom(zoom <= 100 ? 0 : zoom - 50)} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => setGray((v) => !v)} aria-pressed={gray}>
              Grayscale
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
