import { useEffect, useState } from 'react';
import type { Item } from '../shared/model';
import type { Dimensions } from './Gallery';

function colors(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, 40, 40);
  const { data } = ctx.getImageData(0, 0, 40, 40);
  const buckets = new Map<number, { count: number; rgb: number[] }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 180) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const key = (rgb[0] >> 5) * 64 + (rgb[1] >> 5) * 8 + (rgb[2] >> 5);
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    bucket.count++;
    rgb.forEach((channel, n) => {
      bucket.rgb[n] += channel;
    });
    buckets.set(key, bucket);
  }
  const selected: number[][] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    const rgb = bucket.rgb.map((value) => Math.round(value / bucket.count));
    if (selected.every((prior) => Math.hypot(...rgb.map((value, n) => value - prior[n])) >= 44))
      selected.push(rgb);
    if (selected.length === 5) break;
  }
  return selected.map(
    (rgb) =>
      '#' +
      rgb
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
  );
}
export function ImageProperties({ item }: { item: Item }) {
  const [palette, setPalette] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<Dimensions>();
  const [copied, setCopied] = useState('');
  useEffect(() => {
    setPalette([]);
    setDimensions(undefined);
    setCopied('');
    if (!item.mime.startsWith('image/')) return;
    const image = new Image();
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      try {
        setPalette(colors(image));
      } catch {}
    };
    image.src = `/api/items/${item.id}/content`;
    return () => {
      image.onload = null;
    };
  }, [item.id, item.mime]);
  const source = item.source?.metadata.url;
  const rawRating = item.source?.metadata.star ?? item.source?.metadata.rating;
  let url: URL | undefined;
  try {
    const parsed = new URL(typeof source === 'string' ? source : '');
    if (['https:', 'http:'].includes(parsed.protocol)) url = parsed;
  } catch {}
  if (!dimensions && !url && typeof rawRating !== 'number') return null;
  return (
    <div className="image-properties">
      {palette.length > 0 && (
        <div className="palette" aria-label="Image colors">
          {palette.map((color) => (
            <button
              type="button"
              key={color}
              title={`Copy ${color}`}
              aria-label={`Copy color ${color}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                void navigator.clipboard
                  .writeText(color)
                  .then(() => setCopied(color))
                  .catch(() => setCopied(''));
              }}
            />
          ))}
          {copied && <small role="status">Copied {copied}</small>}
        </div>
      )}
      {dimensions && (
        <div>
          {dimensions.width} × {dimensions.height} px
        </div>
      )}
      {typeof rawRating === 'number' && rawRating > 0 && <div>Eagle rating {rawRating}/5</div>}
      {url && (
        <a href={url.href} target="_blank" rel="noreferrer" title={url.href}>
          {url.hostname} ↗
        </a>
      )}
    </div>
  );
}
