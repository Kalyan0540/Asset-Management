import { useState } from 'react';
import type { Collection, Item } from '../shared/model';
import { WorkspaceDialog } from './WorkspaceTools';

function download(data: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export function exportCsv(items: Item[], folders: Collection[]) {
  const folderNames = new Map(folders.map(({ id, name }) => [id, name]));
  const rows = [
    [
      'Title',
      'Filename',
      'Type',
      'Bytes',
      'Tags',
      'Folders',
      'Rating',
      'Source',
      'Description',
      'Created',
      'Modified',
      'Imported',
    ],
    ...items.map((item) => [
      item.title,
      item.filename,
      item.mime,
      item.size,
      item.tags.join('; '),
      item.collections
        .map((id) => folderNames.get(id))
        .filter(Boolean)
        .join('; '),
      item.rating ?? '',
      item.sourceUrl ?? '',
      item.description,
      item.createdAt,
      item.updatedAt,
      item.importedAt ?? '',
    ]),
  ];
  const safe = (raw: string | number) => {
    const value = String(raw);
    const spreadsheet =
      /^[\s\uFEFF]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + spreadsheet.replaceAll('"', '""') + '"';
  };
  const csv = rows.map((row) => row.map(safe).join(',')).join('\r\n');
  download(
    new Blob(['\uFEFF', csv, '\r\n'], { type: 'text/csv;charset=utf-8' }),
    'Atlas metadata.csv',
  );
}

export function ImageExport({ item, onClose }: { item: Item; onClose: () => void }) {
  const [format, setFormat] = useState('png');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function convert() {
    if (working) return;
    setError('');
    setWorking(true);
    try {
      const image = new Image();
      image.src = '/api/items/' + item.id + '/content';
      await image.decode();
      const maxWidth = width ? Number(width) : Infinity;
      const maxHeight = height ? Number(height) : Infinity;
      const ratio =
        width || height
          ? Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
          : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      if (
        canvas.width > 12000 ||
        canvas.height > 12000 ||
        canvas.width * canvas.height > 40_000_000
      )
        throw new Error('Choose a size below 40 megapixels and 12,000 pixels per side.');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Atlas could not prepare this image.');
      if (format === 'jpeg') {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const mime = 'image/' + format;
      const result = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, 0.92),
      );
      if (!result || result.type !== mime) throw new Error('This format is unavailable.');
      const name =
        item.filename.replace(/\.[^.]*$/, '') + ' · ' + canvas.width + '×' + canvas.height;
      download(result, name + '.' + (format === 'jpeg' ? 'jpg' : format));
      onClose();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <WorkspaceDialog title="Export image" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void convert();
        }}
      >
        <p>{item.title}</p>
        <label>
          Format{' '}
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <p>Enter maximum dimensions to resize the image while keeping its proportions.</p>
        <label>
          Maximum width{' '}
          <input
            type="number"
            min="1"
            max="12000"
            placeholder="Original width"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </label>
        <label>
          Maximum height{' '}
          <input
            type="number"
            min="1"
            max="12000"
            placeholder="Original height"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={working}>
          {working ? 'Preparing…' : 'Export image'}
        </button>
      </form>
    </WorkspaceDialog>
  );
}
