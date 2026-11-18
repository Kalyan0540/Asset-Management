import { applyTheme, imageOrigin, preferences, send } from './settings.js';

const get = (id) => document.getElementById(id);
const status = get('status');
const grid = get('images');
const selected = new Set();
const saved = new Set();
const key = location.hash.slice(1);
const stored = key.startsWith('batch:') ? (await chrome.storage.session.get(key))[key] : null;
const settings = await preferences();
applyTheme(settings.theme);
get('tags').value = settings.tags;
void send('status').then(
  ({ library }) => {
    get('destination').textContent = library;
  },
  () => {
    get('destination').textContent = 'Pair in Preferences';
  },
);

if (!stored) {
  status.textContent =
    'This review expired. Open Atlas Capture on the source page and choose Batch save again.';
  throw new Error('No capture review');
}
for (const url of stored.saved ?? []) saved.add(url);
const images = stored.images.map((image) => {
  const url = new URL(image.url);
  const match = /\.(png|jpe?g|gif|webp|avif)$/i.exec(url.pathname);
  const format = match?.[1].toLowerCase().replace('jpeg', 'jpg') ?? 'unknown';
  return { ...image, domain: url.hostname, format };
});

for (const key of ['format', 'domain'])
  for (const value of [...new Set(images.map((image) => image[key]))].sort()) {
    const option = new Option(value === 'unknown' ? 'Unknown type' : value, value);
    get(key).add(option);
  }

let busy = false;
function visible() {
  const q = get('search').value.trim().toLowerCase();
  const size = get('size').value;
  const format = get('format').value;
  const domain = get('domain').value;
  return images.filter(
    (image) =>
      (!q || `${image.title} ${image.domain}`.toLowerCase().includes(q)) &&
      (size === 'all' ||
        (size === 'large'
          ? Math.max(image.width, image.height) >= 800
          : Math.max(image.width, image.height) < 800)) &&
      (format === 'all' || format === image.format) &&
      (domain === 'all' || domain === image.domain),
  );
}
function controls() {
  get('save').disabled = busy || !selected.size;
  get('save').textContent = selected.size ? `Save ${selected.size} to Atlas` : 'Save to Atlas';
  get('select').disabled = busy;
  get('clear').disabled = busy || !selected.size;
}

function render() {
  const available = visible();
  grid.replaceChildren();
  get('empty').hidden = available.length > 0;
  for (const item of available) {
    const choice = document.createElement('label');
    choice.className = 'image-choice';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = selected.has(item.url) || saved.has(item.url);
    check.disabled = busy || saved.has(item.url);
    check.setAttribute('aria-label', `Select ${item.title}`);
    check.addEventListener('change', () => {
      if (!check.checked) selected.delete(item.url);
      else if (selected.size < 60) selected.add(item.url);
      else {
        check.checked = false;
        status.textContent = 'Choose up to 60 images at a time.';
      }
      controls();
    });
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.src = item.url;
    image.addEventListener('error', () => image.removeAttribute('src'), { once: true });
    const name = document.createElement('strong');
    name.textContent = item.title;
    const detail = document.createElement('small');
    detail.textContent = saved.has(item.url)
      ? 'Saved'
      : [
          item.width && item.height ? `${item.width} × ${item.height}` : '',
          item.format !== 'unknown' ? item.format.toUpperCase() : '',
          item.domain,
        ]
          .filter(Boolean)
          .join(' · ');
    choice.append(image, check, name, detail);
    grid.append(choice);
  }
  controls();
}

for (const id of ['search', 'size', 'format', 'domain']) get(id).addEventListener('input', render);
get('select').addEventListener('click', () => {
  for (const item of visible())
    if (selected.size < 60 && !saved.has(item.url)) selected.add(item.url);
  if (selected.size === 60) status.textContent = 'Selected up to 60 images for this batch.';
  render();
});
get('clear').addEventListener('click', () => {
  selected.clear();
  render();
});
get('save').addEventListener('click', async () => {
  if (busy || !selected.size) return;
  const urls = [...selected];
  const tags = get('tags').value;
  busy = true;
  render();
  try {
    const origins = [...new Set(urls.map(imageOrigin))];
    if (origins.length && !(await chrome.permissions.request({ origins })))
      throw new Error(
        'Allow access to the selected image sites, or choose images from the current site.',
      );
    status.textContent = `Saving ${urls.length}…`;
    const results = await send('save-batch', { key, urls, tags });
    for (const result of results)
      if (result.saved) {
        selected.delete(result.url);
        saved.add(result.url);
      }
    const failure = results.find((result) => result.error);
    const count = results.filter((result) => result.saved).length;
    status.textContent = `${count} saved${failure ? `. ${results.length - count} failed. ${failure.error}` : ' to Atlas.'}`;
    status.dataset.error = String(!!failure);
  } catch (error) {
    status.textContent = error.message;
    status.dataset.error = 'true';
  } finally {
    busy = false;
    render();
  }
});
render();
