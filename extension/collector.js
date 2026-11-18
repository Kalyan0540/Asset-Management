// This function is serialized by Chrome and runs in the page's isolated extension world.
export function enableCollector({ drag, doubleClick }) {
  globalThis.atlasCollector?.abort();
  const controller = new AbortController();
  globalThis.atlasCollector = controller;
  const { signal } = controller;
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed!important;z-index:2147483647!important;right:18px!important;bottom:18px!important;display:none!important';
  const shadow = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.type = 'button';
  const style = document.createElement('style');
  style.textContent =
    'button{font:600 13px system-ui,sans-serif;background:#103834;color:#e6fbf4;padding:11px 16px;border:1px solid #7be9bc;border-radius:10px;box-shadow:0 8px 30px #10282850;cursor:pointer}button:focus-visible{outline:3px solid #ddffeb}';
  shadow.append(style, button);
  document.documentElement.append(host);
  signal.addEventListener('abort', () => host.remove(), { once: true });
  let pending;
  let hidden;

  function display(text) {
    clearTimeout(hidden);
    button.textContent = text;
    host.style.setProperty('display', 'block', 'important');
  }
  function hide() {
    pending = undefined;
    host.style.setProperty('display', 'none', 'important');
  }
  async function save(payload) {
    pending = undefined;
    display('Saving to Atlas…');
    try {
      const result = await chrome.runtime.sendMessage(payload);
      display(
        result.ok ? (result.value === 'review' ? 'Review opened' : 'Saved to Atlas') : result.error,
      );
    } catch {
      display('Open Atlas Capture and try again.');
    }
    hidden = setTimeout(hide, 3200);
  }
  if (drag) {
    document.addEventListener(
      'dragstart',
      (event) => {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        const image = event.target.closest('img');
        const link = event.target.closest('a[href]');
        const url = image?.currentSrc || image?.src || link?.href;
        if (!url || !/^https?:\/\//i.test(url)) return;
        pending = {
          action: 'drop',
          kind: image ? 'image' : 'link',
          title: image?.alt || link?.textContent || url,
          url,
        };
        host.style.setProperty('right', '18px', 'important');
        host.style.setProperty('bottom', '18px', 'important');
        host.style.removeProperty('left');
        host.style.removeProperty('top');
        display('Drop to save in Atlas');
      },
      { signal, capture: true },
    );
    document.addEventListener(
      'dragend',
      () => {
        if (pending?.action === 'drop') hide();
      },
      { signal },
    );
    button.addEventListener(
      'dragover',
      (event) => {
        if (!event.isTrusted || pending?.action !== 'drop') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      { signal },
    );
    button.addEventListener(
      'drop',
      (event) => {
        if (!event.isTrusted || pending?.action !== 'drop') return;
        event.preventDefault();
        event.stopPropagation();
        void save(pending);
      },
      { signal },
    );
  }
  if (doubleClick) {
    document.addEventListener(
      'dblclick',
      (event) => {
        if (
          !event.isTrusted ||
          !(event.target instanceof Element) ||
          event.target.closest('input, textarea, [contenteditable]')
        )
          return;
        const selection = getSelection();
        const text = selection?.toString().trim();
        if (!text || !selection.rangeCount) return;
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        pending = { action: 'selection', text: text.slice(0, 50_000) };
        host.style.setProperty(
          'left',
          `${Math.max(8, Math.min(rect.left, innerWidth - 182))}px`,
          'important',
        );
        host.style.setProperty(
          'top',
          `${Math.max(8, Math.min(rect.bottom + 9, innerHeight - 55))}px`,
          'important',
        );
        host.style.removeProperty('right');
        host.style.removeProperty('bottom');
        display('Save selection to Atlas');
        hidden = setTimeout(hide, 7000);
      },
      { signal },
    );
    button.addEventListener(
      'click',
      (event) => {
        if (event.isTrusted && pending?.action === 'selection') void save(pending);
      },
      { signal },
    );
  }
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && pending) hide();
    },
    { signal },
  );
}
