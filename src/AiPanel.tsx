import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, RefreshCw, Check, LoaderCircle } from 'lucide-react';
import type { Collection, Item } from '../shared/model';
import type { AiJob, WritingMode } from '../server/ai';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/ai' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result;
}
export function AiPanel({
  item,
  selected,
  catalog,
  collections,
  onClose,
  onApplied,
}: {
  item: Item | undefined;
  selected: Item[];
  catalog: Item[];
  collections: Collection[];
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const [models, setModels] = useState<string[]>([]),
    [model, setModel] = useState(''),
    [available, setAvailable] = useState<boolean | null>(null),
    [jobs, setJobs] = useState<AiJob[]>([]),
    [error, setError] = useState(''),
    [description, setDescription] = useState(false),
    [folders, setFolders] = useState(false),
    [connections, setConnections] = useState(false),
    [autoFile, setAutoFile] = useState(false),
    [writing, setWriting] = useState<WritingMode>('summarize');
  const reported = useRef(new Set<string>());
  const onCatalogChange = useRef(onApplied);
  onCatalogChange.current = onApplied;
  const refresh = async () => {
    try {
      const value = await request<{ available: boolean; models: string[] }>('/models');
      setAvailable(value.available);
      setModels(value.models);
      setModel((current) => (value.models.includes(current) ? current : (value.models[0] ?? '')));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const values = await request<AiJob[]>('/jobs');
        if (active) {
          setJobs(values);
          const applied = values.filter(
            (job) => job.autoFile && job.status === 'applied' && !reported.current.has(job.id),
          );
          if (applied.length) {
            for (const job of applied) reported.current.add(job.id);
            await onCatalogChange.current();
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void poll();
    const id = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  const perform = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      setJobs(await request<AiJob[]>('/jobs'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const own = jobs.filter((job) =>
    selected.length
      ? selected.some((entry) => entry.id === job.itemId)
      : item
        ? job.itemId === item.id
        : true,
  );
  return (
    <div className="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <header>
        <Sparkles size={20} />
        <h2 id="ai-title">AI suggestions</h2>
        <button className="icon-button" aria-label="Close AI" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <p>Write, tag, and organize with a model running on this computer.</p>
      {available === null ? (
        <p>Checking your local model service…</p>
      ) : !available ? (
        <div className="ai-setup">
          <h3>Connect Ollama</h3>
          <p>
            Install and open the free Ollama app, then download a vision model there for images (or
            a text model for notes). Return here and choose Refresh.
          </p>
          <a
            className="secondary"
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
          >
            Get Ollama
          </a>
          <button className="secondary" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <small>
            Image suggestions require a model that can see images. Model downloads can take several
            GB of storage.
          </small>
        </div>
      ) : (
        <>
          <label>
            Local model
            <select aria-label="AI model" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {models.length === 0 && (
            <p>No models are installed yet. Add one in Ollama, then refresh.</p>
          )}
          <button className="text-button" onClick={() => void refresh()}>
            Refresh models
          </button>
        </>
      )}
      <section className="ai-target">
        <span>SELECTED ITEM</span>
        <strong>
          {selected.length
            ? `${selected.length} selected items`
            : (item?.title ?? 'Select an image or note first')}
        </strong>
        <button
          className="primary full"
          disabled={
            (!item && !selected.length) ||
            !model ||
            !available ||
            own.some((job) => job.status === 'running' || job.status === 'queued')
          }
          onClick={() =>
            void perform(() =>
              selected.length
                ? request('/batch', { items: selected.map((entry) => entry.id), model, autoFile })
                : request('/jobs', { itemId: item!.id, model }),
            )
          }
        >
          <Sparkles size={15} />
          Suggest tags, folders & description
        </button>
        {selected.length > 0 && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={autoFile}
              onChange={(event) => setAutoFile(event.target.checked)}
            />
            Automatically add suggested tags and existing folders for this batch
          </label>
        )}
        {item?.kind === 'note' && !selected.length && (
          <>
            <label>
              Writing action
              <select
                aria-label="Writing action"
                value={writing}
                onChange={(event) => setWriting(event.target.value as WritingMode)}
              >
                <option value="outline">Outline</option>
                <option value="continue">Continue writing</option>
                <option value="rewrite">Rewrite</option>
                <option value="summarize">Summarize</option>
              </select>
            </label>
            <button
              className="secondary"
              disabled={!model || !available}
              onClick={() =>
                void perform(() => request('/jobs', { itemId: item.id, model, mode: writing }))
              }
            >
              Generate draft
            </button>
          </>
        )}
      </section>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {own.map((job) => (
        <article className="ai-job" key={job.id}>
          <p>{catalog.find((entry) => entry.id === job.itemId)?.title}</p>
          <div>
            <strong>
              {job.status === 'review'
                ? 'Ready to review'
                : job.status === 'queued'
                  ? 'Queued'
                  : job.status === 'running'
                    ? 'Analyzing…'
                    : job.status === 'applied'
                      ? 'Applied'
                      : job.status === 'stale'
                        ? 'Item changed'
                        : job.status === 'canceled'
                          ? 'Canceled'
                          : 'Could not finish'}
            </strong>
            <small>{job.model}</small>
          </div>
          {(job.status === 'running' || job.status === 'queued') && (
            <button
              className="text-button"
              onClick={() => void perform(() => request(`/jobs/${job.id}/cancel`, {}))}
            >
              Cancel
            </button>
          )}
          {job.error && <p>{job.error}</p>}
          {job.tags.length > 0 && (
            <div className="ai-tags">
              {job.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {job.description && <p>{job.description}</p>}
          {job.draft && <pre className="ai-draft">{job.draft}</pre>}
          {!!job.folders?.length && (
            <p>
              Folders ·{' '}
              {collections
                .filter((folder) => job.folders?.includes(folder.id))
                .map((folder) => folder.title ?? folder.name)
                .join(', ')}
            </p>
          )}
          {!!job.connections?.length && (
            <p>
              Connections ·{' '}
              {catalog
                .filter((entry) => job.connections?.includes(entry.id))
                .map((entry) => entry.title)
                .join(', ')}
            </p>
          )}
          {job.status === 'review' && (
            <>
              {!job.draft && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={description}
                      onChange={(e) => setDescription(e.target.checked)}
                    />
                    Replace the current description
                  </label>
                  {!!job.folders?.length && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={folders}
                        onChange={(e) => setFolders(e.target.checked)}
                      />
                      Add to suggested folders
                    </label>
                  )}
                  {!!job.connections?.length && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={connections}
                        onChange={(e) => setConnections(e.target.checked)}
                      />
                      Link suggested items
                    </label>
                  )}
                </>
              )}
              <button
                className="primary full"
                onClick={() =>
                  void perform(async () => {
                    await request(`/jobs/${job.id}/apply`, {
                      includeDescription: description,
                      includeFolders: folders,
                      includeConnections: connections,
                      includeDraft: !!job.draft,
                    });
                    await onApplied();
                  })
                }
              >
                <Check size={14} />
                {job.draft
                  ? job.mode === 'rewrite'
                    ? 'Replace note with draft'
                    : 'Append draft'
                  : 'Apply suggestions'}
              </button>
            </>
          )}
        </article>
      ))}
      <small className="ai-footnote">
        AI can make mistakes. Review its suggestions. Applied changes can be restored from the
        item's revision history.
      </small>
    </div>
  );
}
