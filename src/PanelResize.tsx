import { useRef } from 'react';
export function PanelResize({
  side,
  width,
  onResize,
}: {
  side: 'left' | 'right';
  width: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number }>(null);
  const direction = side === 'left' ? 1 : -1;
  return (
    <div
      className={`panel-resize panel-resize-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side === 'left' ? 'folder sidebar' : 'inspector'}`}
      tabIndex={0}
      aria-valuenow={width}
      aria-valuemin={side === 'left' ? 155 : 190}
      aria-valuemax={360}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onResize(drag.current.width + (event.clientX - drag.current.x) * direction);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onResize(width + (event.key === 'ArrowRight' ? 12 : -12) * direction);
      }}
    />
  );
}
