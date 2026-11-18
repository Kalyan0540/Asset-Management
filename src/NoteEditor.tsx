import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { ArrowLeft, ImagePlus, Link2 } from 'lucide-react';
import type { Item, ItemPatch } from '../shared/model';
import { fileType } from '../shared/filters';
import { MarkdownInput } from './MarkdownInput';

const itemId = (url: string) => /^atlas:([a-f0-9-]{36})$/i.exec(url)?.[1];
export function noteReferences(body: string) {
  const targets = new Set<string>();
  function visit(
    node: ReturnType<typeof fromMarkdown>['children'][number] | ReturnType<typeof fromMarkdown>,
  ) {
    if ('url' in node) {
      const id = itemId(node.url);
      if (id) targets.add(id);
    }
    if ('children' in node) node.children.forEach((child) => visit(child as typeof node));
  }
  visit(fromMarkdown(body));
  return [...targets];
}

type Range = { from: number; to: number };
type Anchor = { left: number; top: number; bottom: number };
type Mode = 'link' | 'embed' | 'connect';
type Popup =
  | { range: Range; anchor: Anchor; kind: 'slash'; query: string }
  | { range: Range; anchor: Anchor; kind: 'picker'; mode: Mode };

const commands = [
  { name: 'Heading 1', text: '# ' },
  { name: 'Heading 2', text: '## ' },
  { name: 'Heading 3', text: '### ' },
  { name: 'Bullet list', text: '- ' },
  { name: 'Numbered list', text: '1. ' },
  { name: 'Quote', text: '> ' },
  { name: 'Code block', text: '\x60\x60\x60\n\n\x60\x60\x60', cursor: 4 },
  { name: 'Link an Atlas item', mode: 'link' },
  { name: 'Embed Atlas images', mode: 'embed' },
  { name: 'Connect Atlas items', mode: 'connect' },
] as const;

function reference(target: Item, embed = false) {
  const title = target.title.replace(/[\\\[\]]/g, '\\$&').replace(/\s+/g, ' ');
  return `${embed ? '!' : ''}[${title}](atlas:${target.id})`;
}

export function NoteEditor({
  item,
  workspaceKey,
  items,
  onChange,
  onConnect,
  onImport,
  onBack,
  onOpen,
  saveStatus,
  rendered,
  setRendered,
}: {
  item: Item;
  workspaceKey: string;
  items: Item[];
  onChange: (key: 'body' | 'title', value: string) => void;
  onConnect: (fields: Partial<ItemPatch>) => void;
  onImport: (file: File, tags: string[]) => Promise<Item>;
  onBack: () => void;
  onOpen: (id: string) => void;
  saveStatus: ReactNode;
  rendered: boolean;
  setRendered: (rendered: boolean) => void;
}) {
  const editor = useRef<EditorView>(null);
  const uploader = useRef<HTMLInputElement>(null);
  const pending = useRef<Range>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [popup, setPopup] = useState<Popup | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<string[]>([]);
  const [relation, setRelation] = useState('related to');
  const [commandIndex, setCommandIndex] = useState(0);
  const matches = commands.filter((command) => {
    const term = popup?.kind === 'slash' ? popup.query : '';
    return (
      command.name.toLowerCase().includes(term) ||
      ('mode' in command && command.mode.startsWith(term))
    );
  });
  const targets = items
    .filter((target) => {
      if (
        target.id === item.id ||
        target.trashed ||
        (popup?.kind === 'picker' && popup.mode === 'embed' && !target.mime.startsWith('image/'))
      )
        return false;
      return `${target.title} ${fileType(target)} ${target.kind}`
        .toLowerCase()
        .includes(query.toLowerCase().trim());
    })
    .sort((a, b) => {
      if (sort === 'date') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'type')
        return fileType(a).localeCompare(fileType(b)) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    })
    .slice(0, 60);

  function anchor(view: EditorView, position: number) {
    return view.coordsAtPos(position) ?? view.dom.getBoundingClientRect();
  }
  function close() {
    setPopup(null);
    editor.current?.focus();
  }
  function replace(range: Range, text: string, caret = text.length) {
    const view = editor.current;
    if (!view || view.state.doc.length - (range.to - range.from) + text.length > 1_000_000) return;
    view.dispatch({
      changes: { ...range, insert: text },
      selection: { anchor: range.from + caret },
      scrollIntoView: true,
    });
    close();
  }
  function openPicker(mode: Mode, range: Range, at: Anchor) {
    setQuery('');
    setSelected([]);
    setPopup({ kind: 'picker', mode, range, anchor: at });
  }
  function run(command: (typeof commands)[number]) {
    if (popup?.kind !== 'slash') return;
    if ('mode' in command) openPicker(command.mode, popup.range, popup.anchor);
    else replace(popup.range, command.text, 'cursor' in command ? command.cursor : undefined);
  }
  function insert(picked: Item[]) {
    if (popup?.kind !== 'picker' || !picked.length) return;
    if (popup.mode === 'connect') {
      const label = relation.trim() || 'related to';
      const additions = picked.filter(
        (target) =>
          !item.relations.some((edge) => edge.target === target.id && edge.label === label),
      );
      if (item.relations.length + additions.length > 500) return;
      onConnect({
        relations: [
          ...item.relations,
          ...additions.map((target) => ({ target: target.id, label })),
        ],
      });
      replace(popup.range, '');
    } else {
      const embed = popup.mode === 'embed';
      const text = picked.map((target) => reference(target, embed)).join(embed ? '\n\n' : ', ');
      replace(popup.range, embed ? '\n\n' + text + '\n\n' : text);
    }
  }
  function update(change: ViewUpdate) {
    if (!change.docChanged) {
      if (!change.selectionSet || popup?.kind !== 'slash') return;
    }
    if (pending.current && change.docChanged)
      pending.current = {
        from: change.changes.mapPos(pending.current.from, 1),
        to: change.changes.mapPos(pending.current.to, 1),
      };
    const doc = change.state.doc.toString();
    if (change.docChanged && doc !== item.body) onChange('body', doc);
    const end = change.state.selection.main.head;
    const start = change.state.doc.lineAt(end).from;
    const match = /^\/([^/]{0,35})$/.exec(doc.slice(start, end));
    setCommandIndex(0);
    setPopup(
      match
        ? {
            kind: 'slash',
            range: { from: start, to: end },
            query: match[1].toLowerCase(),
            anchor: anchor(change.view, end),
          }
        : null,
    );
  }
  async function importImages(files: File[]) {
    const view = editor.current;
    if (!view || pending.current) return;
    pending.current = view.state.selection.main;
    setUploading(true);
    setUploadError('');
    const assets: Item[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        assets.push(await onImport(file, item.tags));
      } catch {
        failed.push(file.name);
      }
    }
    const insertion = pending.current;
    pending.current = null;
    if (editor.current === view && insertion && assets.length)
      replace(
        insertion,
        '\n\n' + assets.map((asset) => reference(asset, true)).join('\n\n') + '\n\n',
      );
    setUploading(false);
    if (failed.length) setUploadError('Could not import ' + failed.join(', '));
  }
  const resolve = (url?: string) =>
    items.find((target) => url && target.id === itemId(url) && !target.trashed);
  const backlinks = items.filter(
    (target) =>
      target.kind === 'note' &&
      target.id !== item.id &&
      !target.trashed &&
      (target.relations.some((edge) => edge.target === item.id) ||
        (target.body.includes('atlas:' + item.id) &&
          noteReferences(target.body).includes(item.id))),
  );
  const popupWidth = popup?.kind === 'picker' ? 420 : 260;
  const above =
    popup &&
    popup.anchor.bottom > window.innerHeight - 380 &&
    popup.anchor.top > window.innerHeight / 2;
  return (
    <section className="note-workspace" aria-label="Note editor">
      <div className="note-toolbar">
        <button type="button" className="secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Library
        </button>
        <div className="note-modes">
          <button className="secondary" aria-pressed={!rendered} onClick={() => setRendered(false)}>
            Write
          </button>
          <button
            className="secondary"
            aria-pressed={rendered}
            onClick={() => {
              setRendered(true);
              setPopup(null);
            }}
          >
            Read
          </button>
        </div>
        {saveStatus}
      </div>
      <div className="note-page">
        <input
          className="note-title"
          aria-label="Note title"
          value={item.title}
          maxLength={250}
          onChange={(event) => onChange('title', event.target.value)}
        />
        {rendered ? (
          <article className="markdown-reading">
            <ReactMarkdown
              urlTransform={(url) => (itemId(url) ? url : defaultUrlTransform(url))}
              components={{
                a: ({ href, children }) => {
                  const target = resolve(href);
                  return href && itemId(href) ? (
                    target ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onOpen(target.id)}
                      >
                        {children}
                      </button>
                    ) : (
                      <span>{children} (unavailable)</span>
                    )
                  ) : (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  );
                },
                img: ({ src, alt }) => {
                  const target = resolve(src);
                  return target?.mime.startsWith('image/') ? (
                    <img
                      src={`/api/items/${target.id}/content`}
                      alt={alt ?? target.title}
                      loading="lazy"
                    />
                  ) : (
                    <span>{alt || 'Image unavailable'}</span>
                  );
                },
              }}
            >
              {item.body || '*This note is empty.*'}
            </ReactMarkdown>
          </article>
        ) : (
          <>
            <div className="note-insert">
              <button
                type="button"
                className="text-button"
                onClick={(event) => {
                  const view = editor.current;
                  if (view)
                    openPicker(
                      'link',
                      view.state.selection.main,
                      event.currentTarget.getBoundingClientRect(),
                    );
                }}
              >
                <Link2 size={15} /> Link an item
              </button>
              <button
                type="button"
                className="text-button"
                disabled={uploading}
                onClick={() => uploader.current?.click()}
              >
                <ImagePlus size={15} /> Add images
              </button>
              <input
                ref={uploader}
                hidden
                type="file"
                multiple
                accept="image/*"
                onChange={(event) => {
                  void importImages(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              {uploading && <small role="status">Importing images…</small>}
              {uploadError && <small role="alert">{uploadError}</small>}
            </div>
            <MarkdownInput
              workspaceKey={workspaceKey}
              editor={editor}
              value={item.body}
              onUpdate={update}
              onFiles={(files) => void importImages(files)}
              onKey={(event) => {
                if (!popup || event.isComposing) return false;
                if (event.key === 'Escape') {
                  close();
                  return true;
                }
                if (popup.kind !== 'slash' || !matches.length) return false;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  setCommandIndex(
                    (index) =>
                      (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) %
                      matches.length,
                  );
                  return true;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  run(matches[commandIndex % matches.length]);
                  return true;
                }
                return false;
              }}
            />
          </>
        )}
        {!!backlinks.length && (
          <div className="note-backlinks">
            <strong>Linked from</strong>
            {backlinks.map((note) => (
              <button key={note.id} className="text-button" onClick={() => onOpen(note.id)}>
                {note.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {popup &&
        createPortal(
          <div
            className={`note-flyout ${popup.kind === 'slash' ? 'note-commands' : 'note-picker'}`}
            style={{
              left: Math.max(
                8,
                Math.min(
                  popup.anchor.left,
                  window.innerWidth - Math.min(popupWidth, window.innerWidth - 16) - 8,
                ),
              ),
              width: popupWidth,
              ...(above
                ? { bottom: window.innerHeight - popup.anchor.top + 6 }
                : { top: popup.anchor.bottom + 6 }),
              maxHeight: Math.max(
                90,
                above ? popup.anchor.top - 14 : window.innerHeight - popup.anchor.bottom - 14,
              ),
            }}
            aria-label={popup.kind === 'slash' ? 'Markdown commands' : 'Attach Atlas items'}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
            }}
          >
            {popup.kind === 'slash' ? (
              matches.map((command, index) => (
                <button
                  type="button"
                  key={command.name}
                  className={`note-choice ${index === commandIndex ? 'current' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(command)}
                >
                  {command.name}
                </button>
              ))
            ) : (
              <>
                <div className="note-insert">
                  <input
                    autoFocus
                    aria-label="Find Atlas item"
                    placeholder="Find an image or note…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <select
                    aria-label="Sort link options"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="name">Name</option>
                    <option value="date">Newest</option>
                    <option value="type">Type</option>
                  </select>
                  <button className="text-button" onClick={close}>
                    Cancel
                  </button>
                </div>
                {popup.mode === 'connect' && (
                  <label>
                    Relationship{' '}
                    <input
                      maxLength={80}
                      value={relation}
                      onChange={(event) => setRelation(event.target.value)}
                    />
                  </label>
                )}
                {targets.map((target) => (
                  <div className="note-target" key={target.id}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${target.title}`}
                      checked={selected.includes(target.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, target.id]
                            : ids.filter((id) => id !== target.id),
                        )
                      }
                    />
                    <button type="button" className="note-choice" onClick={() => insert([target])}>
                      {target.title}
                      <small>{fileType(target)}</small>
                    </button>
                    <div className="note-target-preview">
                      {target.mime.startsWith('image/') ? (
                        <img alt="" loading="lazy" src={`/api/items/${target.id}/content`} />
                      ) : target.kind === 'note' ? (
                        target.body.slice(0, 220) || target.title
                      ) : (
                        target.description || target.filename
                      )}
                    </div>
                  </div>
                ))}
                {!targets.length && <p>No matching items</p>}
                {!!selected.length && (
                  <button
                    className="secondary"
                    onClick={() => insert(items.filter((target) => selected.includes(target.id)))}
                  >
                    Attach {selected.length} items
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
