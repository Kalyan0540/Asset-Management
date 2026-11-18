import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { ArrowLeft, Link2 } from 'lucide-react';
import type { Item } from '../shared/model';

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
const commands = [
  { name: 'Heading 1', text: '# ' },
  { name: 'Heading 2', text: '## ' },
  { name: 'Heading 3', text: '### ' },
  { name: 'Bullet list', text: '- ' },
  { name: 'Numbered list', text: '1. ' },
  { name: 'Quote', text: '> ' },
  { name: 'Code block', text: '```\n\n```', cursor: 4 },
  { name: 'Link an Atlas item' },
];
export function NoteEditor({
  item,
  items,
  onChange,
  onBack,
  onOpen,
  saveStatus,
  rendered,
  setRendered,
}: {
  item: Item;
  items: Item[];
  onChange: (key: 'body' | 'title', value: string) => void;
  onBack: () => void;
  onOpen: (id: string) => void;
  saveStatus: ReactNode;
  rendered: boolean;
  setRendered: (rendered: boolean) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const cursorAfterEdit = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (cursorAfterEdit.current === null || !textarea.current) return;
    const cursor = cursorAfterEdit.current;
    cursorAfterEdit.current = null;
    textarea.current.focus();
    textarea.current.setSelectionRange(cursor, cursor);
  });
  const [slash, setSlash] = useState<{ start: number; end: number; query: string } | null>(null);
  const [link, setLink] = useState<{ start: number; end: number } | null>(null);
  const [query, setQuery] = useState('');
  const [embed, setEmbed] = useState(false);
  const matches = commands.filter((c) => c.name.toLowerCase().includes(slash?.query ?? ''));
  const [commandIndex, setCommandIndex] = useState(0);
  const targets = items
    .filter(
      (i) => i.id !== item.id && !i.trashed && i.title.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 30);
  const replace = (start: number, end: number, text: string, cursor = text.length) => {
    const body = item.body.slice(0, start) + text + item.body.slice(end);
    if (body.length > 1_000_000) return;
    cursorAfterEdit.current = start + cursor;
    onChange('body', body);
    setSlash(null);
    setLink(null);
  };
  const openPicker = (range: { start: number; end: number }) => {
    setRendered(false);
    setSlash(null);
    setQuery('');
    setEmbed(false);
    setLink(range);
  };
  const run = (command: (typeof commands)[number]) => {
    if (!slash) return;
    if (command.text !== undefined) replace(slash.start, slash.end, command.text, command.cursor);
    else openPicker(slash);
  };
  const resolve = (url: string | undefined) =>
    items.find((i) => url && i.id === itemId(url) && !i.trashed);
  return (
    <section className="note-workspace" aria-label="Note editor">
      <div className="note-toolbar">
        <button type="button" className="secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Library
        </button>
        <div className="note-modes">
          <button
            type="button"
            className="secondary"
            aria-pressed={!rendered}
            onClick={() => setRendered(false)}
          >
            Write
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={rendered}
            onClick={() => {
              setRendered(true);
              setSlash(null);
              setLink(null);
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

          onChange={(e) => onChange('title', e.target.value)}
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

                onClick={() =>
                  openPicker({
                    start: textarea.current?.selectionStart ?? item.body.length,
                    end: textarea.current?.selectionEnd ?? item.body.length,
                  })
                }
              >
                <Link2 size={15} /> Link an item
              </button>
              <small>Type / at the start of a line for commands</small>
            </div>
            {link && (
              <div className="note-picker">
                <div className="note-insert">
                  <input
                    autoFocus
                    aria-label="Find Atlas item"
                    placeholder="Find an image or note…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setLink(null);
                        textarea.current?.focus();
                      }
                    }}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={embed}
                      onChange={(e) => setEmbed(e.target.checked)}
                    />{' '}
                    Embed images
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setLink(null);
                      textarea.current?.focus();
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {targets.length ? (
                  targets.map((target) => (
                    <button
                      type="button"
                      className="note-choice"
                      key={target.id}
                      onClick={() => {
                        const title = target.title
                          .replace(/[\\\[\]]/g, '\\$&')
                          .replace(/\s+/g, ' ');
                        replace(
                          link.start,
                          link.end,
                          `${embed && target.mime.startsWith('image/') ? '!' : ''}[${title}](atlas:${target.id})`,
                        );
                      }}
                    >
                      {target.title}
                      <small>{target.kind}</small>
                    </button>
                  ))
                ) : (
                  <p>No matching items</p>
                )}
              </div>
            )}
            <div className="note-writing">
              <textarea
                ref={textarea}
                autoFocus
                aria-label="Markdown content"
                placeholder="Start writing…"
                maxLength={1_000_000}

                value={item.body}
                onChange={(e) => {
                  const { value, selectionStart } = e.currentTarget;
                  onChange('body', value);
                  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
                  const match = /^\/([^/]{0,35})$/.exec(value.slice(start, selectionStart));
                  setSlash(
                    match ? { start, end: selectionStart, query: match[1].toLowerCase() } : null,
                  );
                  setCommandIndex(0);
                }}
                onClick={() => setSlash(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSlash(null);
                  if (!slash || !matches.length || e.nativeEvent.isComposing) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCommandIndex(
                      (n) =>
                        (n + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length,
                    );
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    run(matches[commandIndex]);
                  }
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) setSlash(null);
                }}
              />
              {slash && matches.length > 0 && (
                <div className="note-commands" aria-label="Markdown commands">
                  {matches.map((c, n) => (
                    <button
                      type="button"
                      className={`note-choice ${n === commandIndex ? 'current' : ''}`}
                      key={c.name}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => run(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {items.some(
          (i) =>
            i.id !== item.id &&
            !i.trashed &&
            i.kind === 'note' &&
            i.body.includes(`atlas:${item.id}`),
        ) && (
          <div className="note-backlinks">
            <strong>Linked from</strong>
            {items
              .filter(
                (i) =>
                  i.id !== item.id &&
                  !i.trashed &&
                  i.kind === 'note' &&
                  i.body.includes(`atlas:${item.id}`) &&
                  noteReferences(i.body).includes(item.id),
              )
              .map((i) => (
                <button
                  type="button"
                  className="text-button"
                  key={i.id}
                  onClick={() => onOpen(i.id)}
                >
                  {i.title}
                </button>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
