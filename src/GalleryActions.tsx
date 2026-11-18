import { useEffect, useRef, useState } from 'react';
import { Film, Search, X } from 'lucide-react';
import type { Item } from '../shared/model';
import { imageSearchProviders, type ImageSearchProvider } from '../shared/image-search';
import { WorkspaceDialog } from './WorkspaceTools';
import ReactMarkdown from 'react-markdown';

const posters = new Map<string, Promise<Blob>>();
let posterQueue = Promise.resolve();

async function generatePoster(id: string) {
  const video = document.createElement('video');
  const waitFor = (event: string, start: () => void) =>
    new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        video.removeEventListener(event, success);
        video.removeEventListener('error', failure);
        if (error) reject(error);
        else resolve();
      };
      const success = () => finish();
      const failure = () => finish(new Error('Video could not be decoded.'));
      const timeout = window.setTimeout(failure, 7000);
      video.addEventListener(event, success, { once: true });
      video.addEventListener('error', failure, { once: true });
      start();
    });
  try {
    video.preload = 'auto';
    video.muted = true;
    await waitFor('loadeddata', () => {
      video.src = `/api/items/${id}/content`;
    });
    if (video.duration > 0.5 && Number.isFinite(video.duration))
      await waitFor('seeked', () => {
        video.currentTime = Math.min(video.duration * 0.15, 4);
      });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video thumbnail unavailable.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Video thumbnail unavailable.'))),
        'image/webp',
        0.82,
      ),
    );
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

function videoPoster(item: Item) {
  const key = item.hash ?? item.id;
  const existing = posters.get(key);
  if (existing) return existing;
  const path = `/api/items/${item.id}/poster`;
  const promise = fetch(path).then((response) => {
    if (response.ok) return response.blob();
    if (response.status !== 404) throw new Error('Video thumbnail unavailable.');
    const work = posterQueue.then(() => generatePoster(item.id));
    posterQueue = work.then(
      () => {},
      () => {},
    );
    return work.then((blob) => {
      if (blob.type === 'image/webp')
        void fetch(path, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: blob,
        }).catch(() => {});
      return blob;
    });
  });
  posters.set(key, promise);
  void promise.then(
    () => posters.delete(key),
    () => posters.delete(key),
  );
  return promise;
}

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
  const [poster, setPoster] = useState('');
  const ref = useRef<HTMLVideoElement>(null);
  const tile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    let url = '';
    const observe = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observe.disconnect();
        void videoPoster(item)
          .then((blob) => {
            if (!live) return;
            url = URL.createObjectURL(blob);
            setPoster(url);
          })
          .catch(() => {});
      },
      { rootMargin: '120px' },
    );
    observe.observe(tile.current!);
    return () => {
      live = false;
      observe.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id, item.hash]);
  return (
    <div
      className="inline-video"
      ref={tile}
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
      ) : poster ? (
        <img alt="" src={poster} />
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
      {item.kind === 'note' ? (
        <article className="note-peek">
          <strong>{item.title}</strong>
          <ReactMarkdown
            skipHtml
            allowedElements={[
              'p',
              'h1',
              'h2',
              'h3',
              'strong',
              'em',
              'ul',
              'ol',
              'li',
              'blockquote',
              'pre',
              'code',
              'hr',
            ]}
            unwrapDisallowed
          >
            {item.body.slice(0, 1600) || 'Empty note'}
          </ReactMarkdown>
        </article>
      ) : item.mime.startsWith('image/') ? (
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
  label = 'Item actions',
}: {
  x: number;
  y: number;
  onClose: () => void;
  actions: { label: string; run: () => void }[];
  label?: string;
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
        aria-label={label}
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
