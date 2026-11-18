import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import { Focus, Search } from 'lucide-react';
import type { Item } from '../shared/model';
import { noteReferences } from './NoteEditor';

type Point = { x: number; y: number };
type GraphFilters = {
  focus: string;
  tag: string;
  relationship: string;
  onlyAssets: boolean;
  orphans: boolean;
  attachments: boolean;
};
const graphMemory = new Map<
  string,
  { zoom: number; pan: Point; positions: Map<string, Point>; filters: GraphFilters }
>();

export function GraphView({
  items,
  selected,
  onSelect,
  onOpenTab,
  initialFocus = '',
  workspaceKey,
}: {
  items: Item[];
  selected: string | null;
  onSelect: (id: string) => void;
  onOpenTab: (item: Item) => void;
  initialFocus?: string;
  workspaceKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<Core>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const camera = useRef(graphMemory.get(workspaceKey));
  const [focus, setFocus] = useState(camera.current?.filters.focus ?? initialFocus);
  const [current, setCurrent] = useState('');
  const [tag, setTag] = useState(camera.current?.filters.tag ?? '');
  const [relationship, setRelationship] = useState(camera.current?.filters.relationship ?? '');
  const [onlyAssets, setOnlyAssets] = useState(camera.current?.filters.onlyAssets ?? false);
  const [query, setQuery] = useState('');
  const [orphans, setOrphans] = useState(camera.current?.filters.orphans ?? true);
  const [attachments, setAttachments] = useState(camera.current?.filters.attachments ?? true);
  const mounted = useRef(false);
  const filters = useRef<GraphFilters>({
    focus,
    tag,
    relationship,
    onlyAssets,
    orphans,
    attachments,
  });
  filters.current = { focus, tag, relationship, onlyAssets, orphans, attachments };
  const positions = useRef(camera.current?.positions ?? new Map<string, Point>());
  const lastFocus = useRef(focus);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const links = useMemo(
    () =>
      items.flatMap((item) => {
        const relations = new Map(
          item.relations.map((relation) => [relation.target, relation.label]),
        );
        if (item.kind === 'note' && item.body.includes('atlas:')) {
          for (const id of noteReferences(item.body))
            if (!relations.has(id)) relations.set(id, 'Markdown link');
        }
        return [...relations]
          .filter(([target]) => target !== item.id && itemMap.has(target))
          .map(([target, label]) => ({
            id: `${item.id}:${target}`,
            source: item.id,
            target,
            label,
          }));
      }),
    [items, itemMap],
  );
  const elements = useMemo(() => {
    const matching = relationship ? links.filter((link) => link.label === relationship) : links;
    const neighborhood = new Set([focus]);
    if (focus)
      for (const link of matching) {
        if (link.source === focus) neighborhood.add(link.target);
        if (link.target === focus) neighborhood.add(link.source);
      }
    const shown = new Set(
      items
        .filter(
          (item) =>
            (!focus || neighborhood.has(item.id)) &&
            (!tag || item.tags.includes(tag) || item.id === focus) &&
            (!onlyAssets || item.kind === 'asset' || item.id === focus) &&
            (attachments || item.kind === 'note' || item.id === focus),
        )
        .map((item) => item.id),
    );
    const edges = matching.filter((link) => shown.has(link.source) && shown.has(link.target));
    const linked = new Set(edges.flatMap(({ source, target }) => [source, target]));
    const nodes = items.filter(
      (item) => shown.has(item.id) && (orphans || linked.has(item.id) || item.id === focus),
    );
    return [
      ...nodes.map((item): ElementDefinition => ({
        data: { id: item.id, label: item.title, kind: item.kind },
      })),
      ...edges.map((data): ElementDefinition => ({ data })),
    ];
  }, [items, links, focus, orphans, attachments, tag, relationship, onlyAssets]);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim();
    const ink = style.getPropertyValue('--ink').trim();
    const muted = style.getPropertyValue('--muted').trim();
    const instance = cytoscape({
      container: host.current!,
      minZoom: 0.08,
      maxZoom: 5,
      selectionType: 'single',
      wheelSensitivity: 0.23,
      hideEdgesOnViewport: true,
      textureOnViewport: true,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': muted,
            width: 12,
            height: 12,
            label: 'data(label)',
            color: ink,
            'font-size': 11,
            'min-zoomed-font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'text-max-width': '135px',
            'text-wrap': 'ellipsis',
          },
        },
        { selector: 'node[kind = "note"]', style: { 'background-color': accent } },
        {
          selector: 'edge',
          style: { width: 1, 'line-color': muted, opacity: 0.35, 'curve-style': 'haystack' },
        },
        {
          selector: 'node.emphasis',
          style: {
            width: 17,
            height: 17,
            'border-width': 2,
            'border-color': accent,
            'min-zoomed-font-size': 0,
            'z-index': 2,
          },
        },
        {
          selector: 'edge.emphasis',
          style: { 'line-color': accent, width: 2, opacity: 0.9, 'z-index': 1 },
        },
        { selector: '.dimmed', style: { opacity: 0.21 } },
      ],
    });
    graph.current = instance;
    function highlight(node?: NodeSingular) {
      instance.batch(() => {
        instance.elements().removeClass('dimmed emphasis');
        if (!node?.length) return;
        const connected = node.closedNeighborhood();
        instance.elements().difference(connected).addClass('dimmed');
        connected.addClass('emphasis');
      });
    }
    instance.on('mouseover', 'node', (event) => highlight(event.target));
    instance.on('mouseout', 'node', () => highlight(instance.nodes(':selected').first()));
    instance.on('select unselect', 'node', () => highlight(instance.nodes(':selected').first()));
    instance.on('tap', (event) => {
      if (event.target === instance) setCurrent('');
      else if (event.target.isNode()) setCurrent(event.target.id());
    });
    instance.on('dbltap', 'node', (event) => select.current(event.target.id()));
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(host.current!);
    return () => {
      resize.disconnect();
      instance.nodes().forEach((node) => {
        positions.current.set(node.id(), node.position());
      });
      const saved = { zoom: instance.zoom(), pan: instance.pan(), positions: positions.current };
      graphMemory.set(workspaceKey, saved);
      if (graphMemory.size > 16) graphMemory.delete(graphMemory.keys().next().value!);
      instance.destroy();
      graph.current = null;
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const instance = graph.current!;
    const wanted = new Set(elements.map((entry) => entry.data.id));
    instance.batch(() => {
      const leaving = instance.elements().filter((entry) => !wanted.has(entry.id()));
      leaving.nodes().forEach((node) => {
        positions.current.set(node.id(), node.position());
      });
      leaving.remove();
      const incoming = elements.filter((entry) => instance.getElementById(entry.data.id!).empty());
      instance.add(incoming);
      for (const entry of elements) {
        const element = instance.getElementById(entry.data.id!);
        if (element.data('label') !== entry.data.label) element.data('label', entry.data.label);
      }
      // Place new nodes near a connected neighbor. Falling back to a circle avoids a full relayout on edits.
      for (const entry of incoming.filter((entry) => !('source' in entry.data))) {
        const node = instance.getElementById(entry.data.id!);
        const saved = positions.current.get(node.id());
        if (saved) {
          node.position(saved);
          continue;
        }
        const anchor = node.neighborhood().nodes().first();
        const center = anchor.length ? anchor.position() : { x: 100, y: 100 };
        const seed = parseInt(entry.data.id!.slice(0, 7), 16);
        const angle = ((seed % 360) * Math.PI) / 180;
        const distance = 30 + (seed % 170);
        node.position({
          x: center.x + Math.cos(angle) * distance,
          y: center.y + Math.sin(angle) * distance,
        });
      }
    });
    if (!mounted.current && elements.length) {
      mounted.current = true;
      if (camera.current) {
        instance.viewport(camera.current);
        return;
      }
      instance
        .layout({
          name: elements.length < 275 ? 'cose' : 'circle',
          animate: false,
          fit: true,
          padding: 44,
        })
        .run();
    }
  }, [elements]);
  useEffect(() => {
    if (focus && lastFocus.current !== focus) graph.current?.fit(undefined, 72);
    lastFocus.current = focus;
  }, [focus]);

  const found = query.trim()
    ? items
        .filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 15)
    : [];
  function center(id: string) {
    const instance = graph.current;
    const node = instance?.getElementById(id);
    if (!node?.length) return;
    instance?.$('node:selected').unselect();
    node.select();
    setCurrent(id);
    instance?.animate({ center: { eles: node }, duration: 160 });
  }

  const context = itemMap.get(current || focus || selected || '');
  const neighbors = links
    .filter((edge) => edge.source === context?.id || edge.target === context?.id)
    .slice(0, 100);
  const allTags = [...new Set(items.flatMap((item) => item.tags))].sort();
  const labels = [...new Set(links.map((edge) => edge.label))].sort();
  return (
    <div className="graph-view">
      <div ref={host} className="graph-canvas" aria-label="Relations graph" />
      <section className="graph-controls" aria-label="Graph controls">
        <label className="graph-search">
          <Search size={14} />
          <input
            aria-label="Find graph item"
            placeholder="Find an item…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {query.trim() && (
          <ul className="graph-matches">
            {found.length ? (
              found.map((item) => (
                <li key={item.id}>
                  <button
                    className="text-button"
                    onClick={() => {
                      center(item.id);
                      setQuery('');
                    }}
                    onDoubleClick={() => onSelect(item.id)}
                  >
                    {item.title}
                  </button>
                  <button
                    className="icon-button"
                    title="Show local connections"
                    aria-label={`Show connections for ${item.title}`}
                    onClick={() => {
                      setFocus(item.id);
                      setQuery('');
                    }}
                  >
                    <Focus size={14} />
                  </button>
                </li>
              ))
            ) : (
              <li>No items match.</li>
            )}
          </ul>
        )}
        <label>
          <input
            type="checkbox"
            checked={attachments}
            onChange={(event) => setAttachments(event.target.checked)}
          />{' '}
          Include assets
        </label>
        <label>
          <input
            type="checkbox"
            checked={orphans}
            onChange={(event) => setOrphans(event.target.checked)}
          />{' '}
          Include unconnected items
        </label>
        <details className="graph-filter-details">
          <summary>Graph filters</summary>
          <label>
            Tag
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">All tags</option>
              {allTags.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
          <label>
            Connection
            <select value={relationship} onChange={(event) => setRelationship(event.target.value)}>
              <option value="">All relationship types</option>
              {labels.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyAssets}
              onChange={(event) => {
                setOnlyAssets(event.target.checked);
                if (event.target.checked) setAttachments(true);
              }}
            />{' '}
            Assets only
          </label>
        </details>
        <div className="graph-commands">
          {focus ? (
            <button className="text-button" onClick={() => setFocus('')}>
              Whole graph
            </button>
          ) : selected && itemMap.has(selected) ? (
            <button className="text-button" onClick={() => setFocus(selected)}>
              Local graph
            </button>
          ) : null}
          <button className="text-button" onClick={() => graph.current?.fit(undefined, 44)}>
            Fit graph
          </button>
        </div>
        {context && (
          <details className="graph-connection-list">
            <summary>
              Connections for {context.title} ({neighbors.length})
            </summary>
            <button className="text-button" onClick={() => onOpenTab(context)}>
              Open item in a new tab
            </button>
            {neighbors.map((edge) => {
              const target = itemMap.get(edge.source === context.id ? edge.target : edge.source);
              return (
                target && (
                  <button className="text-button" key={edge.id} onClick={() => onOpenTab(target)}>
                    {edge.source === context.id ? '→' : '←'} {target.title} · {edge.label}
                  </button>
                )
              );
            })}
          </details>
        )}
      </section>
    </div>
  );
}
