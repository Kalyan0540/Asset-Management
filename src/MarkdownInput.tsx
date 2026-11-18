import { useLayoutEffect, useRef, type RefObject } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, Prec, Transaction } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view';

class InlineImage extends WidgetType {
  constructor(
    readonly id: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: InlineImage) {
    return other.id === this.id && other.alt === this.alt;
  }
  toDOM() {
    const image = document.createElement('img');
    image.src = '/api/items/' + this.id + '/content';
    image.alt = this.alt;
    image.loading = 'lazy';
    image.className = 'inline-note-image';
    return image;
  }
}

const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.read(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged)
        this.decorations = this.read(update.view);
    }
    read(view: EditorView) {
      const active = view.hasFocus ? view.state.selection.main : null;
      const lines = new Set<number>();
      for (const { from, to } of view.visibleRanges)
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          lines.add(line.number);
          pos = line.to + 1;
        }
      const ranges = [...lines].flatMap((number) => {
        const line = view.state.doc.line(number);
        if (active && active.from <= line.to && active.to >= line.from) return [];
        const decorations = [];
        const heading = /^(#{1,6}) +/.exec(line.text);
        if (heading) {
          decorations.push(
            Decoration.line({ class: 'live-h' + heading[1].length }).range(line.from),
          );
          decorations.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
        }
        const image = /^!\[([^\]]*)\]\(atlas:([\da-f-]{36})\)$/i.exec(line.text);
        if (image)
          decorations.push(
            Decoration.replace({ widget: new InlineImage(image[2], image[1]) }).range(
              line.from,
              line.to,
            ),
          );
        const bold = /\*\*([^*]+)\*\*/g;
        if (!image)
          for (const match of line.text.matchAll(bold)) {
            const start = line.from + match.index;
            const end = start + match[0].length;
            decorations.push(Decoration.replace({}).range(start, start + 2));
            decorations.push(Decoration.mark({ class: 'live-strong' }).range(start + 2, end - 2));
            decorations.push(Decoration.replace({}).range(end - 2, end));
          }
        return decorations;
      });
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const caretMemory = new Map<string, { anchor: number; head: number }>();

type Props = {
  workspaceKey: string;
  editor: RefObject<EditorView | null>;
  value: string;
  onUpdate: (update: ViewUpdate) => void;
  onKey: (event: KeyboardEvent) => boolean;
  onFiles: (files: File[]) => void;
};
export function MarkdownInput(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    const remembered = caretMemory.get(props.workspaceKey);
    const doc = latest.current.value;
    const selection = remembered && {
      anchor: Math.min(doc.length, remembered.anchor),
      head: Math.min(doc.length, remembered.head),
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc,
        selection,
        extensions: [
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder('Start writing…'),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown content' }),
          EditorState.changeFilter.of((transaction) => transaction.newDoc.length <= 1_000_000),
          liveMarkdown,
          EditorView.updateListener.of((change) => latest.current.onUpdate(change)),
          Prec.highest(
            EditorView.domEventHandlers({
              keydown: (event) => latest.current.onKey(event),
              paste: (event) => {
                const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
                  file.type.startsWith('image/'),
                );
                if (!files.length) return false;
                latest.current.onFiles(files);
                return true;
              },
              dragover: (event) => event.dataTransfer?.types.includes('Files') ?? false,
              drop: (event, editor) => {
                const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
                  file.type.startsWith('image/'),
                );
                if (!files.length) return false;
                const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos !== null) editor.dispatch({ selection: { anchor: pos } });
                latest.current.onFiles(files);
                return true;
              },
            }),
          ),
        ],
      }),
    });
    props.editor.current = view;
    view.focus();
    return () => {
      const { anchor, head } = view.state.selection.main;
      caretMemory.set(props.workspaceKey, { anchor, head });
      if (caretMemory.size > 100) caretMemory.delete(caretMemory.keys().next().value!);
      props.editor.current = null;
      view.destroy();
    };
  }, [props.editor, props.workspaceKey]);
  useLayoutEffect(() => {
    const view = props.editor.current;
    if (view && view.state.doc.toString() !== props.value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [props.editor, props.value]);
  return <div className="markdown-input" ref={host} />;
}
