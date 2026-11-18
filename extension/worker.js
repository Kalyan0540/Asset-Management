import { captureTags, imageOrigin, limit, pageUrl, preferences } from './settings.js';
import { captureScreen, findImages } from './screen.js';
import { enableCollector } from './collector.js';

void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

const bridge = 'http://127.0.0.1:38471';
let captureRunning = false;
const activeBatches = new Set();
const menus = [
  ['save-page', 'Save page to Atlas', ['page']],
  ['save-link', 'Save link to Atlas', ['link']],
  ['save-text', 'Save selection to Atlas', ['selection']],
  ['save-image', 'Save image to Atlas', ['image']],
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title, contexts] of menus)
      chrome.contextMenus.create({
        id,
        title,
        contexts,
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      });
  });
});

async function notify(tabId, message, ok) {
  if (tabId === undefined) return;
  const title = ok ? message : `Atlas Capture · ${message}`;
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: ok ? 'OK' : '!' }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#237f67' : '#b04840' }),
    chrome.action.setTitle({ tabId, title }),
    chrome.storage.session.set({ [`notice:${tabId}`]: { message, ok, time: Date.now() } }),
  ]);
}

export async function localCapture(path, { body, query, key } = {}) {
  key ??= (await preferences()).key;
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Pair Atlas in Preferences before saving.');
  let response;
  try {
    response = await fetch(bridge + path + (query ? `?${query}` : ''), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body
          ? {
              'Content-Type':
                body instanceof Blob ? 'application/octet-stream' : 'application/json',
            }
          : {}),
      },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      body: body instanceof Blob ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(18_000),
    });
  } catch {
    throw new Error('Open the Atlas desktop build that supports Browser Capture, then try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? 'Atlas could not store the capture.');
  return result;
}

const titleOf = (value, fallback = 'Browser capture') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || fallback;

async function saveNote(title, source, text) {
  return localCapture('/note', {
    body: {
      title: titleOf(title),
      source: pageUrl(source),
      tags: captureTags((await preferences()).tags),
      ...(text ? { text: text.trim().slice(0, 50_000) } : {}),
    },
  });
}

async function saveImage(title, source, blob, queryTags) {
  if (blob.size > limit) throw new Error('The image exceeds the 24 MB capture limit.');
  const query = new URLSearchParams({ title: titleOf(title), source: pageUrl(source) });
  for (const tag of captureTags(queryTags ?? (await preferences()).tags)) query.append('tag', tag);
  return localCapture('/image', { body: blob, query });
}

async function readImage(address, page) {
  const url = pageUrl(address);
  const origin = imageOrigin(url);
  if (
    new URL(url).origin !== new URL(page).origin &&
    !(await chrome.permissions.contains({ origins: [origin] }))
  )
    throw new Error('Allow access to the image site in the capture review.');
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12_000),
  });
  if (
    !response.ok ||
    !/^image\/(png|jpeg|gif|webp|avif)(?:;|$)/i.test(response.headers.get('content-type') ?? '')
  )
    throw new Error('The site did not return a supported image.');
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('The image exceeds the 24 MB capture limit.');
  const stream = response.body.getReader();
  const parts = [];
  let length = 0;
  while (true) {
    const { done, value } = await stream.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await stream.cancel();
      throw new Error('The image exceeds the 24 MB capture limit.');
    }
    parts.push(value);
  }
  return new Blob(parts);
}

async function browserTab(id) {
  const tab =
    typeof id === 'number'
      ? await chrome.tabs.get(id)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab?.id || !tab.url) throw new Error('Open a web page and select the extension again.');
  pageUrl(tab.url);
  return tab;
}

async function review(tab, images) {
  const key = 'batch:' + crypto.randomUUID();
  const stored = await chrome.storage.session.get();
  const expired = Object.keys(stored).filter(
    (entry) => entry.startsWith('batch:') && Date.now() - stored[entry].created > 3600_000,
  );
  if (expired.length) await chrome.storage.session.remove(expired);
  await chrome.storage.session.set({ [key]: { source: tab.url, images, created: Date.now() } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') + '#' + key });
  return 'review';
}

async function saveSelection(key, urls, tags) {
  if (activeBatches.has(key)) throw new Error('This batch is already saving.');
  activeBatches.add(key);
  try {
    return await importSelection(key, urls, tags);
  } finally {
    activeBatches.delete(key);
  }
}

async function importSelection(key, urls, tags) {
  const session = (await chrome.storage.session.get(key))[key];
  if (!session || Date.now() - session.created > 3600_000)
    throw new Error('This capture review expired. Scan the page again.');
  const chosen = new Set(urls);
  const saved = new Set(session.saved ?? []);
  const images = session.images.filter((image) => chosen.has(image.url));
  if (!images.length || images.length > 60) throw new Error('Choose up to 60 images each time.');
  await localCapture('/status');
  const results = [];
  for (const image of images) {
    if (saved.has(image.url)) {
      results.push({ url: image.url, saved: true });
      continue;
    }
    try {
      const blob = await readImage(image.url, session.source);
      await saveImage(image.title, session.source, blob, tags);
      results.push({ url: image.url, saved: true });
      saved.add(image.url);
      await chrome.storage.session
        .set({ [key]: { ...session, saved: [...saved] } })
        .catch(() => {});
    } catch (error) {
      results.push({ url: image.url, error: error.message });
    }
  }
  return results;
}

function extensionPage(sender) {
  return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message !== 'object') return;
  const fromPage = extensionPage(sender);
  const dragMessage =
    !fromPage &&
    sender.id === chrome.runtime.id &&
    sender.tab?.id &&
    sender.frameId === 0 &&
    ['drop', 'selection'].includes(message.action);
  if (!fromPage && !dragMessage) return;
  void (async () => {
    const { action } = message;
    if (action === 'status') return localCapture('/status');
    if (action === 'check-key' && fromPage) return localCapture('/status', { key: message.key });
    if (action === 'save-batch') return saveSelection(message.key, message.urls, message.tags);
    const tab = await browserTab(dragMessage ? sender.tab.id : message.tabId);
    if (dragMessage && sender.url !== tab.url)
      throw new Error('The browser page changed. Try again.');
    if (action === 'save-url') return saveNote(tab.title, tab.url);
    if (action === 'review') {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: findImages,
      });
      const images = (result ?? []).filter((image) => {
        try {
          imageOrigin(image.url);
          return true;
        } catch {
          return false;
        }
      });
      if (!images.length) throw new Error('No supported image addresses were found on this page.');
      return review(tab, images);
    }
    if (action === 'enable-drag') {
      const { drag, doubleClick } = await preferences();
      if (!drag && !doubleClick) throw new Error('Turn on page tools in Preferences first.');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: enableCollector,
        args: [{ drag, doubleClick }],
      });
      return;
    }
    if (dragMessage) {
      const settings = await preferences();
      if (action === 'selection') {
        if (!settings.doubleClick || typeof message.text !== 'string' || !message.text.trim())
          throw new Error('Text quick actions are disabled.');
        return saveNote(`Excerpt · ${tab.title}`, tab.url, message.text);
      }
      if (!settings.drag) throw new Error('Dragging to Atlas is disabled in Preferences.');
      if (message.kind === 'link') return saveNote(message.title, message.url);
      const url = pageUrl(message.url);
      if (
        new URL(url).origin !== new URL(tab.url).origin &&
        !(await chrome.permissions.contains({ origins: [imageOrigin(url)] }))
      )
        return review(tab, [{ url, title: titleOf(message.title, 'Image') }]);
      return saveImage(message.title, tab.url, await readImage(url, tab.url));
    }
    if (['visible', 'area', 'page'].includes(action)) {
      if (captureRunning) throw new Error('A screen capture is already running.');
      captureRunning = true;
      try {
        await localCapture('/status');
        const image = await captureScreen(tab, action);
        await saveImage(
          `${tab.title} · ${action === 'area' ? 'Area' : action === 'page' ? 'Page' : 'Visible'}`,
          tab.url,
          image,
        );
        await notify(tab.id, 'Screenshot saved to Atlas', true);
      } catch (error) {
        await notify(tab.id, error.message, false);
        throw error;
      } finally {
        captureRunning = false;
      }
      return;
    }
    throw new Error('Unknown capture action.');
  })().then(
    (value) => respond({ ok: true, value }),
    (error) => respond({ ok: false, error: error.message }),
  );
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void (async () => {
    const current = await browserTab(tab.id);
    if (info.menuItemId === 'save-text') {
      const text = info.selectionText?.trim();
      if (!text) throw new Error('Select some text first.');
      await saveNote(`Excerpt · ${current.title}`, current.url, text);
    } else if (info.menuItemId === 'save-link') await saveNote(info.linkUrl, info.linkUrl);
    else if (info.menuItemId === 'save-image') {
      const url = pageUrl(info.srcUrl);
      const title = titleOf(new URL(url).pathname.split('/').at(-1), 'Image');
      if (
        new URL(url).origin !== new URL(current.url).origin &&
        !(await chrome.permissions.contains({ origins: [imageOrigin(url)] }))
      ) {
        await review(current, [{ url, title }]);
        return;
      }
      await saveImage(title, current.url, await readImage(url, current.url));
    } else await saveNote(current.title, current.url);
    await notify(tab.id, 'Saved to Atlas', true);
  })().catch((error) => notify(tab.id, error.message, false));
});
