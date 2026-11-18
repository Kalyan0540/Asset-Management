import { test, expect, type Page } from '@playwright/test';

async function newNote(page: Page) {
  await page.getByText('New', { exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
}
const saved = (page: Page) => expect(page.locator('.draft-status')).toHaveText('Changes saved');

test('the integrated type filter, center image canvas and panel shortcut work together', async ({
  page,
}) => {
  await page.goto('/');
  const title = `Detail-${Date.now()}`;
  const pixel = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#1c4087';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL().split(',')[1];
    }),
    'base64',
  );
  await page.getByLabel('Import files', { exact: true }).setInputFiles([
    { name: `${title}-A.png`, mimeType: 'image/png', buffer: pixel },
    { name: `${title}-B.png`, mimeType: 'image/png', buffer: pixel },
    { name: `${title}-C.txt`, mimeType: 'text/plain', buffer: Buffer.from('reference') },
  ]);
  await expect(page.getByLabel('Item title')).toHaveValue(`${title}-C.txt`);
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.getByLabel('Search library').fill(title);
  await page.getByLabel('Filter file types').click();
  await page.getByRole('checkbox', { name: 'Include png' }).check();
  await page.getByLabel('Find a file type').press('Escape');
  const tiles = page.locator('.asset-open');
  await expect(tiles).toHaveCount(2);
  await tiles.first().focus();
  await tiles.first().press('ArrowRight');
  await expect(tiles.nth(1)).toBeFocused();
  await tiles.nth(1).press('Enter');
  const detail = page.getByRole('region', { name: 'Image detail' });
  await expect(detail).toBeVisible();
  const photo = detail.locator('img');
  await expect(photo).toHaveJSProperty('naturalHeight', 1200);
  const viewportBounds = await detail.getByLabel('Image canvas').boundingBox();
  await expect
    .poll(async () => (await photo.boundingBox())!.height)
    .toBeLessThanOrEqual(viewportBounds!.height);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();
  const readout = detail.locator('output');
  const before = parseInt((await readout.textContent())!);
  await detail.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => parseInt((await readout.textContent())!)).toBeGreaterThan(before);
  await page.keyboard.press('Control+/');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.inspector')).toBeHidden();
  await page.keyboard.press('Control+/');
  await expect(page.locator('.sidebar')).toBeVisible();
  await detail.getByRole('button', { name: 'Back to gallery' }).click();
  await expect(tiles.nth(1)).toBeFocused();
});

test('a video gets a reusable poster and Markdown peeks render headings', async ({ page }) => {
  await page.goto('/');
  const filename = `Poster-${Date.now()}.webm`;
  // A synthetic 32 × 32 VP8 clip without audio.
  const clip = Buffer.from(
    'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDMWVK5ryK4BAAAAAAAAP9eBAXPFiHUaTQIn55bxnIEAIrWcg3VuZIiBAIaFVl9WUDiDgQEj44OEC+vCAOCQsIEguoEgmoECVbCEVbmBARJUw2fXc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwM3NzsmPAi2PFiHUaTQIn55bxZ8ihRaOHRU5DT0RFUkSHlExhdmM2MS4xOS4xMDEgbGlidnB4H0O2dUCI54EAo76BAACAEAMAnQEqIAAgAABHCIWFiIWEiAICAnWqA/gD+gIIWQy9AP79bvP/45k3MMT/jm3/8WE8DijI//FRAKOVgQDIALEBAAUQrAAYABhYL/QACHAAo5WBAZAAsQEABRCsABgAGFgv9AAIcACjlYECWACxAQAFEKwAGAAYWC/0AAhwAA==',
    'base64',
  );
  await page
    .getByLabel('Import files', { exact: true })
    .setInputFiles({ name: filename, mimeType: 'video/webm', buffer: clip });
  await expect(page.getByLabel('Item title')).toHaveValue(filename);
  await page.getByRole('button', { name: 'Close details' }).click();
  const tile = page.locator('.asset-card').filter({ hasText: filename });
  await expect(tile.locator('.inline-video img')).toHaveJSProperty('naturalWidth', 32);
  const id = await tile.getAttribute('data-item-id');
  await expect
    .poll(async () => (await page.request.get(`/api/items/${id}/poster`)).status())
    .toBe(200);
  await newNote(page);
  const note = `Markdown peek ${Date.now()}`;
  await page.getByLabel('Note title').fill(note);
  await page.getByLabel('Markdown content').fill('## Rendered preview');
  await saved(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: `Preview ${note}` }).focus();
  await expect(page.locator('.note-peek h2')).toHaveText('Rendered preview');
});

test('tag workspace reviews and applies a merge before relabeling items', async ({ page }) => {
  const stamp = Date.now();
  const from = `Draft-${stamp}`;
  const to = `Reference-${stamp}`;
  await page.goto('/');
  await newNote(page);
  await page.getByLabel('Note title').fill(`Tag cleanup ${stamp}`);
  await page.getByLabel('Tags', { exact: true }).fill(`${from}, ${to}`);
  await saved(page);
  await page
    .getByRole('button', { name: /^All Tags/i })
    .first()
    .click();
  await page.getByRole('button', { name: `Manage tag ${from}` }).click();
  const dialog = page.getByRole('dialog', { name: `Manage #${from}` });
  await dialog.getByLabel('Rename or merge into').fill(to);
  await dialog.getByRole('button', { name: 'Review changes' }).click();
  await expect(dialog.getByRole('status')).toContainText(`Merge #${from} into #${to} on 1 items`);
  await expect(page.locator('.tag-results button.tag').filter({ hasText: from })).toBeVisible();
  await dialog.getByRole('button', { name: 'Merge tags' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.tag-results button.tag').filter({ hasText: from })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`#${to}`) }).click();
  await expect(
    page.locator('.asset-open').filter({ hasText: `Tag cleanup ${stamp}` }),
  ).toBeVisible();
});

test('desktop reverse image search waits for the provider choice and user action', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'atlasDesktop', {
      value: {
        appearance: async () => 'system',
        libraries: async () => ({ active: '/atlas', entries: [] }),
        imageSearch: async (id: string, provider: string, png?: Uint8Array) =>
          sessionStorage.setItem(
            'image-search-test',
            JSON.stringify({ id, provider, hadPng: !!png }),
          ),
      },
    });
  });
  await page.goto('/');
  const filename = `Search-${Date.now()}.png`;
  await page.getByLabel('Import files', { exact: true }).setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByLabel('Item title')).toHaveValue(filename);
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.locator('.asset-open').filter({ hasText: filename }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Search web by image…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Search web by image' });
  await dialog.getByLabel('Search provider').selectOption('tineye');
  expect(await page.evaluate(() => sessionStorage.getItem('image-search-test'))).toBeNull();
  await dialog.getByRole('button', { name: 'Open TinEye' }).click();
  await expect(dialog.getByRole('status')).toContainText('Image copy ready');
  const call = await page.evaluate(() => JSON.parse(sessionStorage.getItem('image-search-test')!));
  expect(call).toEqual({
    provider: 'tineye',
    hadPng: false,
    id: expect.stringMatching(/^[\da-f-]{36}$/),
  });
});
test('bulk organization, sorting and full-screen preview work together', async ({ page }) => {
  await page.goto('/');
  const title = `Bulk preview ${Date.now()}`;
  await newNote(page);
  await page.getByLabel('Note title').fill(title);
  await page.getByLabel('Markdown content').fill('# A larger preview');
  await saved(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel(`Select ${title}`, { exact: true }).check();
  await page.getByLabel('Bulk tag').fill('batch-tag');
  await page.getByRole('button', { name: 'Add tag', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 items updated');
  await page.getByLabel('Sort items').selectOption('name');
  await page.getByRole('button', { name: `Preview ${title}`, exact: true }).focus();
  await page.getByRole('button', { name: `Preview ${title}`, exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: `Preview ${title}` })).toContainText(
    '# A larger preview',
  );
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI suggestions' })).toBeVisible();
  await page.getByRole('button', { name: 'Close AI' }).click();
});
test('create, relate, edit, search, export, trash and restore real library items', async ({
  page,
}) => {
  const unique = Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All items' })).toBeVisible();
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByLabel('Folder name').fill(`Project ${unique}`);
  await page.getByLabel('Folder name').press('Enter');
  await expect(
    page.getByRole('button', { name: new RegExp(`Project ${unique}`) }).first(),
  ).toBeVisible();
  await newNote(page);
  await page.getByLabel('Note title').fill(`Research ${unique}`);
  await page.getByLabel('Markdown content').fill('# Research\n\nLocal notes with **context**.');
  await page.getByLabel('Tags', { exact: true }).fill('research, inspiration');
  await page.getByText('Add or remove folders', { exact: true }).click();
  await page.getByRole('checkbox', { name: `Project ${unique}`, exact: true }).check();
  await saved(page);
  await page.reload();
  await page
    .getByRole('button')
    .filter({ hasText: `Research ${unique}` })
    .first()
    .click();
  await expect(page.getByLabel('Markdown content')).toHaveValue(
    '# Research\n\nLocal notes with **context**.',
  );
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Import files', { exact: true }).setInputFiles({
    name: `reference-${unique}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByLabel('Item title')).toHaveValue(`reference-${unique}.png`);
  await expect(page.locator('.preview img')).toHaveJSProperty('naturalWidth', 1);
  await page.getByLabel('Related item').selectOption({ label: `Research ${unique}` });
  await page.getByLabel('Add relation', { exact: true }).click();
  await saved(page);
  await expect(page.getByText('related to', { exact: false }).first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export original' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(`reference-${unique}.png`);
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(page.getByRole('button', { name: 'Restore item' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore item' }).click();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'All items', exact: false }).click();
  await page.getByLabel('Search library').fill(`reference-${unique}`);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('table')).toContainText(`reference-${unique}.png`);
  await page.getByLabel('Search library').fill('');
  await page.getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByLabel('Relations graph')).toBeVisible();
});
test('autosave preserves overlapping local and external edits until resolved', async ({ page }) => {
  await page.goto('/');
  await newNote(page);
  const title = `Autosave conflict ${Date.now()}`;
  await page.getByLabel('Note title').fill(title);
  await saved(page);
  await page.evaluate(async (title) => {
    const library = await (await fetch('/api/library')).json();
    const note = library.items.find((item: { title: string }) => item.title === title);
    const response = await fetch(`/api/items/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: note.revision, body: 'External writer' }),
    });
    if (!response.ok) throw new Error('Fixture update failed');
  }, title);
  await page.getByLabel('Markdown content').fill('My unsaved draft');
  await expect(page.getByRole('alert')).toContainText('edited elsewhere');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.reload();
  await page.locator('.asset-open').filter({ hasText: title }).click();
  await expect(page.getByLabel('Markdown content')).toHaveValue('My unsaved draft');
  await page.getByRole('button', { name: 'Keep my edits' }).click();
  await saved(page);
});
test('phone layout supports navigation and notes without horizontal page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  await expect(page.getByRole('heading', { name: /Notes/ })).toBeVisible();
  await newNote(page);
  await page.getByLabel('Note title').fill('Phone note');
  await page.getByLabel('Markdown content').fill('Phone draft');
  await saved(page);
  await expect(page.getByLabel('Markdown content')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('image quick preview, colors, gallery layouts and linked note editing', async ({ page }) => {
  await page.goto('/');
  const filename = `Canvas-${Date.now()}.png`;
  await page.getByLabel('Import files', { exact: true }).setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByLabel('Image colors')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  for (const view of ['Justified', 'Waterfall']) {
    await page.getByLabel('View options').click();
    await page.getByRole('button', { name: `${view} view` }).click();
    await expect(page.locator('.asset-open').filter({ hasText: filename })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Grid view' }).click();
  const card = page.locator('.asset-card').filter({ hasText: filename });
  await card.hover();
  await card.getByRole('button', { name: `Preview ${filename}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Preview ${filename}` })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await newNote(page);
  await page.getByLabel('Note title').fill('Reference study');
  const editor = page.getByLabel('Markdown content');
  await editor.fill('/heading 2');
  await editor.press('Enter');
  await expect(editor).toHaveValue('## ');
  await editor.pressSequentially('Palette');
  await editor.press('Enter');
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Link an item', exact: true }).click();
  await page.getByLabel('Find Atlas item').fill(filename);
  await page.getByLabel('Embed images').check();
  await page.getByRole('button', { name: new RegExp(filename) }).click();
  await expect(editor).toHaveValue(/## Palette\n\n!\[Canvas.*\]\(atlas:/);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await saved(page);
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Palette' })).toBeVisible();
  await expect(page.getByRole('img', { name: filename })).toBeVisible();
});

test('saving with a selected related item keeps the link and lets you open it', async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `Linked note ${suffix}`;
  const filename = `Linked asset ${suffix}.txt`;
  await page.goto('/');
  await newNote(page);
  await page.getByLabel('Note title').fill(title);
  await saved(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Library navigation' })
    .getByRole('button', { name: /^All items/ })
    .click();
  await page.getByLabel('Import files', { exact: true }).setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('Linked original'),
  });
  await expect(page.getByLabel('Item title')).toHaveValue(filename);
  await page.getByLabel('Related item').selectOption({ label: title });
  await page.getByLabel('Add relation', { exact: true }).click();
  await saved(page);
  await expect(page.getByLabel('Related item')).toHaveValue('');
  await page.reload();
  await page.getByLabel('Search library').fill(filename);
  await page.locator('.asset-open').filter({ hasText: filename }).click();
  await page.getByRole('button', { name: `Open linked item: ${title}` }).click();
  await expect(page.getByLabel('Note title')).toHaveValue(title);
});

test('nested folder, clipboard import, Smart Folder, and Trash Undo work across themes', async ({
  page,
}) => {
  const suffix = Date.now();
  const parent = `Project Tree ${suffix}`;
  const child = `Pasted Images ${suffix}`;
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Appearance').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Appearance').selectOption('system');
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('Folder name').fill(parent);
  await page.getByLabel('Folder name').press('Enter');
  await page
    .getByRole('navigation', { name: 'Folder tree' })
    .getByRole('button', { name: new RegExp(`^${parent}`) })
    .click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Folder actions' })
    .getByRole('button', { name: 'New subfolder' })
    .click();
  await page.getByLabel('Folder name').fill(child);
  await page.getByLabel('Folder name').press('Enter');
  await expect(page.getByRole('heading', { name: new RegExp(child) })).toBeVisible();
  await page.locator('main').evaluate((main) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    );
    data.items.add(new File([bytes], 'captured.png', { type: 'image/png' }));
    main.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByLabel('Item title')).toHaveValue(/^Clipboard /);
  const title = await page.getByLabel('Item title').inputValue();
  const tree = page.getByRole('navigation', { name: 'Folder tree' });
  await tree.getByRole('button', { name: `Collapse ${parent}` }).click();
  await expect(tree.getByRole('button', { name: new RegExp(child) })).toHaveCount(0);
  await tree.getByRole('button', { name: new RegExp(`^${parent} 1$`) }).click();
  await expect(page.getByRole('region', { name: 'Subfolders' }).getByText(child)).toBeVisible();
  await expect(page.locator('.asset-open').filter({ hasText: title })).toHaveCount(0);
  await page.getByLabel('Show subfolder contents').check();
  await expect(page.locator('.asset-open').filter({ hasText: title })).toBeVisible();
  const smart = `Rule ${suffix}`;
  await page.getByRole('button', { name: 'New Smart Folder', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Smart Folder' });
  await dialog.getByLabel('Name', { exact: true }).fill(smart);
  await dialog.getByLabel('Name filter value').fill(title);
  await expect(dialog.getByRole('status')).toHaveText('1 matching items');
  await dialog.getByRole('button', { name: 'Save Smart Folder' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(smart) })).toBeVisible();
  await page.locator('.asset-open').filter({ hasText: title }).click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Item actions' })
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await expect(page.locator('.asset-open').filter({ hasText: title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.asset-open').filter({ hasText: title })).toBeVisible();
});
