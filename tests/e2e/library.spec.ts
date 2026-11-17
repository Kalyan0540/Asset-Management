import { test, expect } from '@playwright/test';
test('create, relate, edit, search, export, trash and restore real library items', async ({
  page,
}) => {
  const unique = Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All items' })).toBeVisible();
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByLabel('Collection name').fill(`Project ${unique}`);
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Note title').fill(`Research ${unique}`);
  await page.getByRole('button', { name: 'Create note', exact: true }).click();
  await page.getByLabel('Markdown content').fill('# Research\n\nLocal notes with **context**.');
  await page.getByLabel('Tags', { exact: true }).fill('research, inspiration');
  await page.getByRole('checkbox', { name: `Project ${unique}`, exact: true }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page.reload();
  await page
    .getByRole('button')
    .filter({ hasText: `Research ${unique}` })
    .first()
    .click();
  await expect(page.getByLabel('Markdown content')).toHaveValue(
    '# Research\n\nLocal notes with **context**.',
  );
  await page.getByRole('button', { name: 'Close details' }).click();
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
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
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
  await page.getByRole('button', { name: 'Table view' }).click();
  await expect(page.getByRole('table')).toContainText(`reference-${unique}.png`);
  await page.getByLabel('Search library').fill('');
  await page.getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByLabel('Relations graph')).toBeVisible();
});
test('stale browser save preserves the draft and navigation can be cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const title = `Conflict ${Date.now()}`;
  await page.getByLabel('Note title').fill(title);
  await page.getByRole('button', { name: 'Create note', exact: true }).click();
  await page.getByLabel('Markdown content').fill('My unsaved draft');
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
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByLabel('Markdown content')).toHaveValue('My unsaved draft');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.getByLabel('Markdown content')).toHaveValue('My unsaved draft');
});
test('phone layout supports navigation and notes without horizontal page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  await expect(page.getByRole('heading', { name: /Notes/ })).toBeVisible();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Note title').fill('Phone note');
  await page.getByRole('button', { name: 'Create note', exact: true }).click();
  await expect(page.getByLabel('Markdown content')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
