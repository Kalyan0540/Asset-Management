import { useEffect, useRef, useState } from 'react';
import { Film, Search, X } from 'lucide-react';
import type { Item } from '../shared/model';

export function InlineVideo({
  item,
  onSize,
}: {
  item: Item;
  onSize: (d: { width: number; height: number }) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <div
      className="inline-video"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setPlaying(true);
      }}
      onPointerLeave={() => setPlaying(false)}
    >
      {playing ? (
        <>
          <video
            ref={ref}
            muted
            autoPlay
            playsInline
            src={`/api/items/${item.id}/content`}
            onLoadedMetadata={(e) =>
              onSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
            }
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          />
          <small>
            {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}
          </small>
        </>
      ) : (
        <span>
          <Film size={27} />
          Video
        </span>
      )}
    </div>
  );
}
export function HoverPeek({ item }: { item: Item }) {
  const src = `/api/items/${item.id}/content`;
  return (
    <div className="hover-peek" aria-hidden="true">
      {item.mime.startsWith('image/') ? (
        <img alt="" src={src} />
      ) : (
        <video muted autoPlay playsInline src={src} />
      )}
    </div>
  );
}
export function ItemMenu({
  x,
  y,
  onClose,
  actions,
}: {
  x: number;
  y: number;
  onClose: () => void;
  actions: { label: string; run: () => void }[];
}) {
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const focus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => () => focus.current?.focus(), []);
  const visible = actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div
      className="item-menu-shade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="item-menu"
        role="dialog"
        aria-label="Item actions"
        aria-modal="true"
        style={{
          left: Math.max(8, Math.min(x, innerWidth - 258)),
          top: Math.max(8, Math.min(y, innerHeight - 318)),
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Tab') {
            const nodes = Array.from(
              panel.current?.querySelectorAll<HTMLElement>('input,button') ?? [],
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
        }}
      >
        <div className="item-menu-search">
          <Search size={15} />
          <input
            autoFocus
            aria-label="Find an item action"
            placeholder="Find an action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible[0]) {
                onClose();
                visible[0].run();
              }
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Close actions"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        {visible.map((a) => (
          <button
            type="button"
            key={a.label}
            onClick={() => {
              onClose();
              a.run();
            }}
          >
            {a.label}
          </button>
        ))}
        {!visible.length && <p>No matching actions</p>}
      </div>
    </div>
  );
}
