import { useEffect, useRef, useState } from 'react';
import { Film, Search, X } from 'lucide-react';
import type { Item } from '../shared/model';
import { imageSearchProviders, type ImageSearchProvider } from '../shared/image-search';
import { WorkspaceDialog } from './WorkspaceTools';

async function avifSearchCopy(id: string) {
  const image = new Image();
  image.src = `/api/items/${id}/content`;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The image could not be prepared.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const file = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!file) throw new Error('The image could not be prepared.');
  return new Uint8Array(await file.arrayBuffer());
}

export function ReverseImageDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const [provider, setProvider] = useState<ImageSearchProvider>('google');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  return (
    <WorkspaceDialog
      title="Search web by image"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!window.atlasDesktop) return;
          setError('');
          setBusy(true);
          try {
            const png = item.mime === 'image/avif' ? await avifSearchCopy(item.id) : undefined;
            await window.atlasDesktop.imageSearch(item.id, provider, png);
            setOpened(true);
          } catch (error) {
            setError(
              (error as Error).message.replace(
                /^Error invoking remote method '[^']+': Error: /,
                '',
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Search provider
          <select
            autoFocus
            value={provider}
            disabled={busy}
            onChange={(event) => {
              setProvider(event.target.value as ImageSearchProvider);
              setOpened(false);
              setError('');
            }}
          >
            {Object.entries(imageSearchProviders).map(([key, service]) => (
              <option key={key} value={key}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Atlas opens the provider in your browser and shows a temporary copy of “{item.title}”. In
          the browser, choose Upload and select the copy to share it with the provider.
        </p>
        {opened && (
          <p role="status">
            Image copy ready.{' '}
            {provider === 'google'
              ? 'In Google, select Search by image to upload it.'
              : 'In TinEye, use the Upload button.'}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <footer className="tag-dialog-actions">
          {opened ? (
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <button type="submit" className="primary" disabled={busy}>
              Open {imageSearchProviders[provider].name}
            </button>
          )}
        </footer>
      </form>
    </WorkspaceDialog>
  );
}

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
