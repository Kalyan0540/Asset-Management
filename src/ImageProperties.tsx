import { useEffect, useState } from 'react';
import type { Item } from '../shared/model';
import type { Dimensions } from './Gallery';
import { normalizeHex } from '../shared/filters';

function imagePalette(image: HTMLImageElement) {
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
  const selected: { rgb: number[]; count: number }[] = [];
  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.count, 0);
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    const rgb = bucket.rgb.map((value) => Math.round(value / bucket.count));
    if (selected.every((prior) => Math.hypot(...rgb.map((value, n) => value - prior.rgb[n])) >= 44))
      selected.push({ rgb, count: bucket.count });
    if (selected.length === 5) break;
  }
  return selected.map(({ rgb, count }) => ({
    color: '#' + rgb.map((value) => value.toString(16).padStart(2, '0')).join(''),
    coverage: count / total,
  }));
}

export function imageColors(image: HTMLImageElement) {
  return imagePalette(image).map(({ color }) => color);
}

function formats(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const [red, green, blue] = [r, g, b].map((value) => value / 255);
  const max = Math.max(red, green, blue),
    min = Math.min(red, green, blue),
    delta = max - min;
  const light = (max + min) / 2;
  const hue = !delta
    ? 0
    : max === red
      ? (green - blue) / delta
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  const angle = Math.round((hue * 60 + 360) % 360) % 360;
  const percent = (value: number) => Math.round(value * 100) + '%';
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  const black = 1 - max;
  const cmy = [red, green, blue].map((channel) => percent(max ? (max - channel) / max : 0));
  return [
    ['HEX', hex],
    ['RGB', `rgb(${r}, ${g}, ${b})`],
    ['RGBA', `rgba(${r}, ${g}, ${b}, 1)`],
    ['HSL', `hsl(${angle}, ${percent(saturation)}, ${percent(light)})`],
    ['HSV', `hsv(${angle}, ${percent(max ? delta / max : 0)}, ${percent(max)})`],
    ['HWB', `hwb(${angle} ${percent(min)} ${percent(black)})`],
    ['CMYK', `cmyk(${[...cmy, percent(black)].join(', ')})`],
  ];
}
export function ImageProperties({
  item,
  onFilter,
  onPrimary,
}: {
  item: Item;
  onFilter: (color: string) => void;
  onPrimary: (color: string) => void;
}) {
  const [palette, setPalette] = useState<ReturnType<typeof imagePalette>>([]);
  const [dimensions, setDimensions] = useState<Dimensions>();
  const [swatch, setSwatch] = useState('');
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
        setPalette(imagePalette(image));
      } catch {}
    };
    image.src = `/api/items/${item.id}/content`;
    return () => {
      image.onload = null;
    };
  }, [item.id, item.mime]);
  const source = item.sourceUrl ?? item.source?.metadata.url;

  let url: URL | undefined;
  try {
    const parsed = new URL(typeof source === 'string' ? source : '');
    if (['https:', 'http:'].includes(parsed.protocol)) url = parsed;
  } catch {}
  const primary = normalizeHex(item.primaryColor ?? '');
  const colors: { color: string; coverage?: number }[] = [...palette].sort(
    (a, b) => Number(b.color === primary) - Number(a.color === primary),
  );
  if (primary && !colors.some((entry) => entry.color === primary))
    colors.unshift({ color: primary });
  function copy(color: string) {
    void navigator.clipboard
      .writeText(color)
      .then(() => setCopied(color))
      .catch(() => setCopied(''));
  }
  if (!dimensions && !url && !colors.length) return null;
  return (
    <div className="image-properties">
      {colors.length > 0 && (
        <div
          className="palette"
          aria-label="Image colors"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSwatch('');
          }}
        >
          {colors.map(({ color, coverage }) => (
            <button
              type="button"
              key={color}
              title={`${color.toUpperCase()}${coverage === undefined ? '' : ' · ' + (coverage * 100).toFixed(1) + '%'}${primary === color ? ' · Primary' : ''}`}
              aria-label={`Color ${color.toUpperCase()}`}
              aria-expanded={swatch === color}
              style={{ backgroundColor: color }}
              className={primary === color ? 'primary-swatch' : ''}
              onClick={() => setSwatch(swatch === color ? '' : color)}
              onContextMenu={(event) => {
                event.preventDefault();
                setSwatch(color);
              }}
            />
          ))}
          {swatch && (
            <div className="swatch-actions" role="group" aria-label="Color actions">
              <button
                type="button"
                onClick={() => {
                  onFilter(swatch);
                  setSwatch('');
                }}
              >
                Find similar colors
              </button>
              {formats(swatch).map(([format, value]) => (
                <button
                  type="button"
                  key={format}
                  title={value}
                  onClick={() => {
                    copy(value);
                    setSwatch('');
                  }}
                >
                  Copy {format}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onPrimary(swatch);
                  setSwatch('');
                }}
              >
                Set as primary color
              </button>
            </div>
          )}
          {copied && <small role="status">Copied {copied}</small>}
        </div>
      )}
      {dimensions && (
        <div>
          {dimensions.width} × {dimensions.height} px
        </div>
      )}
      {url && (
        <a href={url.href} target="_blank" rel="noreferrer" title={url.href}>
          {url.hostname} ↗
        </a>
      )}
    </div>
  );
}
