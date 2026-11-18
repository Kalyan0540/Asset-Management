import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Item } from '../shared/model';
export type GalleryView = 'grid' | 'justified' | 'waterfall';
export type Dimensions = { width: number; height: number };
export function Gallery({
  items,
  view,
  size,
  dimensions,
  render,
}: {
  items: Item[];
  view: GalleryView;
  size: number;
  dimensions: Record<string, Dimensions>;
  render: (item: Item, height?: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const ratio = (i: Item) => {
    const d = dimensions[i.id];
    const w = d?.width ?? Number(i.source?.metadata.width);
    const h = d?.height ?? Number(i.source?.metadata.height);
    return w > 0 && h > 0 ? Math.max(0.23, Math.min(4, w / h)) : 1.25;
  };
  const gap = 10;
  if (view === 'justified' && width > 0) {
    const rows: { items: Item[]; ratio: number; height: number }[] = [];
    let row: Item[] = [],
      sum = 0;
    for (const item of items) {
      row.push(item);
      sum += ratio(item);
      if (sum * size + gap * (row.length - 1) >= width) {
        rows.push({
          items: row,
          ratio: sum,
          height: Math.max(1, (width - gap * (row.length - 1)) / sum),
        });
        row = [];
        sum = 0;
      }
    }
    if (row.length)
      rows.push({
        items: row,
        ratio: sum,
        height: Math.min(size, (width - gap * (row.length - 1)) / sum),
      });
    return (
      <div ref={ref} className="asset-layout justified-gallery">
        {rows.map((r) => (
          <div className="justified-row" key={r.items[0].id}>
            {r.items.map((i) => (
              <div key={i.id} style={{ width: ratio(i) * r.height }}>
                {render(i, r.height)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (view === 'waterfall' && width > 0) {
    const count = Math.max(1, Math.floor((width + gap) / (Math.min(size, width / 2 - gap) + gap)));
    const columnWidth = (width - (count - 1) * gap) / count;
    const heights = Array<number>(count).fill(0);
    const cards = items.map((item) => {
      const col = heights.indexOf(Math.min(...heights));
      const top = heights[col];
      const height = Math.round(Math.min(columnWidth / ratio(item), columnWidth * 3));
      heights[col] += height + 42 + gap;
      return { item, col, height, top };
    });
    return (
      <div
        ref={ref}
        className="asset-layout waterfall-gallery"
        style={{ height: Math.max(...heights) }}
      >
        {cards.map(({ item, col, height, top }) => (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              left: col * (columnWidth + gap),
              top,
              width: columnWidth,
            }}
          >
            {render(item, height)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="asset-grid"
      style={{ '--tile-size': `${size}px` } as React.CSSProperties}
    >
      {items.map((i) => render(i))}
    </div>
  );
}
