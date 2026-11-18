export const defaults = { theme: 'system', tags: '', drag: true, doubleClick: false, key: '' };
export const limit = 24 * 1024 * 1024;

export function preferences() {
  return chrome.storage.local.get(defaults);
}

export function pageUrl(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2048
  )
    throw new Error('Open an ordinary HTTP or HTTPS page to capture it.');
  return url.href;
}

export function imageOrigin(value) {
  const url = new URL(pageUrl(value));
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.startsWith('[') ||
    !host.includes('.') ||
    /^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host)
  )
    throw new Error('This image address is on a private network. Use a screenshot instead.');
  return `${url.protocol}//${url.hostname}/*`;
}

export function captureTags(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40)),
    ),
  ].slice(0, 12);
}

export function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
}

export async function send(action, payload = {}) {
  const result = await chrome.runtime.sendMessage({ action, ...payload });
  if (!result?.ok) throw new Error(result?.error ?? 'Atlas Capture could not finish.');
  return result.value;
}
