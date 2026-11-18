import { pageUrl } from './settings.js';

export function findImages() {
  const unique = new Map();
  for (const image of document.images) {
    const url = image.currentSrc || image.src;
    if (!/^https?:\/\//i.test(url) || url.length > 2048 || unique.has(url)) continue;
    if (image.naturalWidth && Math.min(image.naturalWidth, image.naturalHeight) < 32) continue;
    const title = (image.alt || new URL(url).pathname.split('/').at(-1) || 'Image')
      .trim()
      .slice(0, 160);
    unique.set(url, {
      url,
      title: title || 'Image',
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    if (unique.size >= 300) break;
  }
  return [...unique.values()];
}

function measure() {
  return {
    x: scrollX,
    y: scrollY,
    width: innerWidth,
    height: innerHeight,
    total: Math.max(document.documentElement.scrollHeight, innerHeight),
  };
}

function scrollToRow(x, y) {
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight });
    };
    const timer = setTimeout(done, 350);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

function pickArea() {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    const shadow = layer.attachShadow({ mode: 'closed' });
    layer.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important';
    shadow.innerHTML = `<style>
      .region{position:absolute;inset:0;touch-action:none;cursor:crosshair;background:#0c233344;color:#fff;font:14px system-ui,sans-serif}
      p{position:absolute;top:14px;left:50%;transform:translateX(-50%);border-radius:8px;background:#173638;padding:9px 13px;margin:0;pointer-events:none}
      .box{position:absolute;display:none;box-sizing:border-box;border:2px solid #94edbd;background:#94edbd22;pointer-events:none}
    </style><div class="region" tabindex="0" aria-label="Select screenshot area"><p>Drag to capture an area · Esc cancels</p><div class="box"></div></div>`;
    const region = shadow.querySelector('.region');
    const box = shadow.querySelector('.box');
    let start;
    const width = innerWidth;
    const height = innerHeight;
    const before = document.activeElement;
    function finish(result) {
      clearTimeout(timer);
      layer.remove();
      before?.focus?.({ preventScroll: true });
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    }
    const timer = setTimeout(() => finish(null), 24_000);
    const rectangle = (event) => {
      const end = {
        x: Math.max(0, Math.min(width, event.clientX)),
        y: Math.max(0, Math.min(height, event.clientY)),
      };
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
        width,
        height,
      };
    };
    region.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    });
    region.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    region.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted || event.button !== 0 || start) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      region.setPointerCapture(event.pointerId);
    });
    region.addEventListener('pointermove', (event) => {
      if (start?.id !== event.pointerId) return;
      const r = rectangle(event);
      box.style.cssText = `display:block;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    });
    region.addEventListener('pointerup', (event) => {
      if (start?.id !== event.pointerId) return;
      const selection = rectangle(event);
      if (selection.w < 4 || selection.h < 4) {
        start = undefined;
        box.style.display = 'none';
        return;
      }
      finish(selection);
    });
    region.addEventListener('pointercancel', () => finish(null));
    document.documentElement.append(layer);
    region.focus({ preventScroll: true });
  });
}

async function inject(tab, func, args) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return result?.result;
}

async function checkActive(tab) {
  const [active] = await chrome.tabs.query({ windowId: tab.windowId, active: true });
  if (active?.id !== tab.id || !active.url || pageUrl(active.url) !== tab.url)
    throw new Error('Keep the original page selected until capture finishes.');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastCapture = 0;

async function pixels(tab) {
  await wait(Math.max(0, 550 - (Date.now() - lastCapture)));
  await checkActive(tab);
  const data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  lastCapture = Date.now();
  await checkActive(tab);
  return (await fetch(data)).blob();
}

export async function captureScreen(tab, mode) {
  if (mode === 'visible') return pixels(tab);
  if (mode === 'area') {
    const region = await inject(tab, pickArea);
    if (!region) throw new Error('Area capture cancelled.');
    const bitmap = await createImageBitmap(await pixels(tab));
    try {
      const sx = bitmap.width / region.width;
      const sy = bitmap.height / region.height;
      const width = Math.max(1, Math.round(region.w * sx));
      const height = Math.max(1, Math.round(region.h * sy));
      const canvas = new OffscreenCanvas(width, height);
      canvas
        .getContext('2d')
        .drawImage(bitmap, region.x * sx, region.y * sy, width, height, 0, 0, width, height);
      return canvas.convertToBlob({ type: 'image/png' });
    } finally {
      bitmap.close();
    }
  }
  const original = await inject(tab, measure);
  if (!original?.height || original.total / original.height > 12)
    throw new Error(
      'This page is too long for a single capture. Try Capture visible or Capture area.',
    );
  let canvas;
  let scaleY;
  let filled = 0;
  try {
    for (let index = 0; filled < original.total && index < 13; index++) {
      await checkActive(tab);
      const frame = await inject(tab, scrollToRow, [original.x, filled]);
      if (
        frame.width !== original.width ||
        frame.height !== original.height ||
        frame.y > filled + 1 ||
        frame.y + frame.height <= filled
      )
        throw new Error('The page could not be scrolled consistently. Try Capture visible.');
      // Let lazy content finish painting before sampling each viewport.
      await wait(150);
      const image = await createImageBitmap(await pixels(tab));
      try {
        if (!canvas) {
          scaleY = image.height / original.height;
          const height = Math.round(original.total * scaleY);
          if (height > 16_000 || image.width * height > 25_000_000)
            throw new Error('The page is too large for a single image. Try Capture area.');
          canvas = new OffscreenCanvas(image.width, height);
        }
        if (canvas.width !== image.width || Math.abs(image.height / frame.height - scaleY) > 0.01)
          throw new Error('The window resized. Try the capture again.');
        const top = Math.round((filled - frame.y) * scaleY);
        const next = Math.min(original.total, frame.y + frame.height);
        const to = Math.round(filled * scaleY);
        const crop = Math.round(next * scaleY) - to;
        canvas
          .getContext('2d')
          .drawImage(image, 0, Math.max(0, top), canvas.width, crop, 0, to, canvas.width, crop);
        filled = next;
      } finally {
        image.close();
      }
    }
    if (!canvas || filled < original.total)
      throw new Error('The full page could not be captured. Try Capture visible.');
    if ((await inject(tab, measure)).total !== original.total)
      throw new Error('The page grew while scrolling. Try Capture visible or Capture area.');
    return canvas.convertToBlob({ type: 'image/png' });
  } finally {
    // Restore only the original document after a switch, cancellation or failure.
    const existing = await chrome.tabs.get(tab.id).catch(() => null);
    if (existing?.url === tab.url)
      await inject(tab, (x, y) => window.scrollTo({ left: x, top: y, behavior: 'instant' }), [
        original.x,
        original.y,
      ]).catch(() => {});
  }
}
