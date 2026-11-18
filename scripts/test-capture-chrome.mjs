import { chromium, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createBrowserCaptureServer } from '../server/browser-capture.ts';
import { Library } from '../server/library.ts';
import { captureExtensionOrigin, capturePort } from '../shared/capture.ts';

const folder = await mkdtemp(join(tmpdir(), 'atlas-browser-qa-'));
const library = new Library(join(folder, 'Capture test library'));
const pairing = '8c'.repeat(32);
const capture = createBrowserCaptureServer(
  () => library,
  () => pairing,
);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAQklEQVR4nO3OQQkAMBAEsfMvulTGziMQAbm7F7MfCAkJCcXsB0JCQkIx+4GQkJBQzH4gJCQkFLMfCAkJCcXsB+3QB5nf7nkkfiUoAAAAAElFTkSuQmCC',
  'base64',
);
const fixture = createServer((request, response) => {
  if (request.url?.endsWith('.png')) {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(png);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      '<title>Atlas capture sample</title><main style="min-height:1600px"><p>Collect this phrase</p><img src="/blue.png" alt="Blue sample"><p style="margin-top:740px">Lower on the page</p></main>',
    );
  }
});
let browser;
try {
  capture.listen(capturePort, '127.0.0.1');
  fixture.listen(0, '127.0.0.1');
  await Promise.all([once(capture, 'listening'), once(fixture, 'listening')]);
  const testExtension = join(folder, 'extension');
  await cp(resolve('extension'), testExtension, { recursive: true });
  const manifestPath = join(testExtension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // The test runner can't click Chrome's toolbar. Enable capture on the isolated fixture profile.
  manifest.host_permissions.push('<all_urls>');
  await writeFile(manifestPath, JSON.stringify(manifest));
  browser = await chromium.launchPersistentContext(join(folder, 'profile'), {
    channel: 'chromium',
    headless: true,
    ...(process.env.ATLAS_CAPTURE_CHROMIUM
      ? { executablePath: process.env.ATLAS_CAPTURE_CHROMIUM }
      : {}),
    args: [
      `--disable-extensions-except=${testExtension}`,
      `--load-extension=${testExtension}`,
      '--host-resolver-rules=MAP capture.test 127.0.0.1',
      '--no-proxy-server',
    ],
  });
  const options = await browser.newPage();
  await options.goto(captureExtensionOrigin + '/preferences.html');
  await expect(options.getByRole('status')).toHaveText('Ready to pair');
  await options.getByLabel('Pairing key').fill(pairing);
  await options.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(options.getByRole('status')).toHaveText('Connected to Capture test library');
  await options.getByLabel('Default tags').fill('from Chrome');
  await options.getByLabel('Appearance').selectOption('dark');
  await options.getByLabel('Show a save action on double-clicked text').check();

  const source = await browser.newPage();
  const url = `http://capture.test:${fixture.address().port}/`;
  await source.goto(url);
  const id = await options.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
    url,
  );
  const action = (name) =>
    options.evaluate((request) => chrome.runtime.sendMessage(request), { tabId: id, action: name });
  expect((await action('save-url')).ok).toBe(true);
  expect(library.list()[0].sourceUrl).toBe(url);
  expect(library.list()[0].tags).toEqual(['from Chrome']);
  expect((await action('enable-drag')).ok).toBe(true);
  await source.getByText('Collect this phrase').dblclick({ position: { x: 13, y: 5 } });
  const sheet = source.locator('div[style*="2147483647"]').last();
  await expect(sheet).toBeVisible();
  const menuPosition = await sheet.boundingBox();
  await source.mouse.click(
    menuPosition.x + menuPosition.width / 2,
    menuPosition.y + menuPosition.height / 2,
  );
  await expect
    .poll(() => library.list().filter((item) => item.body.startsWith('> Collect')).length)
    .toBe(1);

  const newPage = browser.waitForEvent('page');
  expect((await action('review')).ok).toBe(true);
  const review = await newPage;
  await review.getByRole('checkbox', { name: 'Select Blue sample' }).check();
  await review.getByRole('button', { name: 'Save 1 to Atlas' }).click();
  await expect(review.locator('#status')).toContainText('1 saved');
  expect(
    library.list().some((item) => item.kind === 'asset' && item.title === 'Blue sample.png'),
  ).toBe(true);
  await review.close();

  await source.bringToFront();
  expect((await action('visible')).ok).toBe(true);
  await source.evaluate(() => scrollTo(0, 75));
  expect((await action('page')).ok).toBe(true);
  expect(await source.evaluate(() => scrollY)).toBe(75);
  const selection = action('area');
  await expect(source.locator('div[style*="inset"][style*="2147483647"]')).toBeVisible();
  await source.mouse.move(30, 65);
  await source.mouse.down();
  await source.mouse.move(160, 155, { steps: 5 });
  await source.mouse.up();
  expect((await selection).ok).toBe(true);
  const area = library.list().find((item) => item.title.endsWith('Area.png'));
  const data = await readFile(join(library.root, 'blobs', area.hash));
  expect(data.readUInt32BE(16)).toBe(130);
  expect(data.readUInt32BE(20)).toBe(90);
  console.log('CHROME_CAPTURE_OK');
} finally {
  await browser?.close();
  capture.close();
  capture.closeAllConnections();
  fixture.close();
  fixture.closeAllConnections();
  library.close();
  await rm(folder, { recursive: true, force: true });
}
