import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Maximize, Minus, Plus } from 'lucide-react';
import type { Item } from '../shared/model';

type Position = { x: number; y: number };
const reset = { x: 0, y: 0, zoom: 1 };

export function ImageDetail({
  item,
  onBack,
  onStep,
}: {
  item: Item;
  onBack: () => void;
  onStep: (direction: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Position>());
  const [transform, setTransform] = useState(reset);
  const [gesturing, setGesturing] = useState(false);
  const [actualZoom, setActualZoom] = useState(1);

  function zoomBy(multiplier: number, point?: Position) {
    setTransform((current) => {
      const zoom = Math.max(0.24, Math.min(16, current.zoom * multiplier));
      if (!point || !viewport.current) return { ...current, zoom };
      const box = viewport.current.getBoundingClientRect();
      const x = point.x - box.left - box.width / 2;
      const y = point.y - box.top - box.height / 2;
      const ratio = zoom / current.zoom;
      return { zoom, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio };
    });
  }

  function dimensions() {
    if (image.current?.clientWidth)
      setActualZoom(image.current.naturalWidth / image.current.clientWidth);
  }

  useEffect(() => {
    const region = viewport.current!;
    region.focus();
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.008), { x: event.clientX, y: event.clientY });
    };
    const observer = new ResizeObserver(dimensions);
    observer.observe(region);
    region.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      region.removeEventListener('wheel', wheel);
    };
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, next);
    if (other) {
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0 && after > 0)
        zoomBy(after / before, { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 });
    } else
      setTransform((current) => ({
        ...current,
        x: current.x + next.x - last.x,
        y: current.y + next.y - last.y,
      }));
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) setGesturing(false);
  }

  return (
    <section
      className="image-detail"
      aria-label="Image detail"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === 'Escape') {
          event.stopPropagation();
          onBack();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onStep(event.key === 'ArrowLeft' ? -1 : 1);
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          zoomBy(1.2);
        } else if (event.key === '-') {
          event.preventDefault();
          zoomBy(1 / 1.2);
        }
      }}
    >
      <header>
        <button
          type="button"
          className="icon-button"
          aria-label="Back to gallery"
          title="Back to gallery (Esc)"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
        </button>
        <span>{item.title}</span>
      </header>
      <div
        className="image-detail-stage"
        ref={viewport}
        tabIndex={0}
        aria-label="Image canvas"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          setGesturing(true);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <img
          ref={image}
          draggable={false}
          alt={item.title}
          src={`/api/items/${item.id}/content`}
          onLoad={dimensions}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
            transition: gesturing ? 'none' : undefined,
          }}
        />
      </div>
      <footer className="image-detail-controls" aria-label="Image zoom controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => zoomBy(1 / 1.2)}
        >
          <Minus size={16} />
        </button>
        <output>{Math.round((transform.zoom / actualZoom) * 100)}%</output>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => zoomBy(1.2)}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setTransform({ ...reset, zoom: actualZoom })}
        >
          1:1
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Fit to view"
          title="Fit to view"
          onClick={() => setTransform(reset)}
        >
          <Maximize size={15} />
        </button>
      </footer>
    </section>
  );
}
