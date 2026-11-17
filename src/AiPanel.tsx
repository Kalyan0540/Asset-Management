import { useEffect, useState } from 'react';
import { Sparkles, X, RefreshCw, Check, LoaderCircle } from 'lucide-react';
import type { Item } from '../shared/model';
import type { AiJob } from '../server/ai';
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
  onClose,
  onApplied,
}: {
  item: Item | undefined;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const [models, setModels] = useState<string[]>([]),
    [model, setModel] = useState(''),
    [available, setAvailable] = useState<boolean | null>(null),
    [jobs, setJobs] = useState<AiJob[]>([]),
    [error, setError] = useState(''),
    [description, setDescription] = useState(false);
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
        if (active) setJobs(values);
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
  const own = jobs.filter((j) => j.itemId === item?.id);
  return (
    <div className="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <header>
        <Sparkles size={20} />
        <h2 id="ai-title">AI suggestions</h2>
        <button className="icon-button" aria-label="Close AI" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <p>
        Suggest tags and descriptions with a model running on this computer. Nothing is sent to a
        hosted AI service.
      </p>
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
        <strong>{item?.title ?? 'Select an image or note first'}</strong>
        <button
          className="primary full"
          disabled={!item || !model || !available || own.some((j) => j.status === 'running')}
          onClick={() => void perform(() => request('/jobs', { itemId: item!.id, model }))}
        >
          <Sparkles size={15} />
          Suggest tags & description
        </button>
      </section>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {own.map((job) => (
        <article className="ai-job" key={job.id}>
          <div>
            <strong>
              {job.status === 'review'
                ? 'Ready to review'
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
          {job.status === 'running' && (
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
          {job.status === 'review' && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={description}
                  onChange={(e) => setDescription(e.target.checked)}
                />
                Also replace the current description
              </label>
              <button
                className="primary full"
                onClick={() =>
                  void perform(async () => {
                    await request(`/jobs/${job.id}/apply`, { includeDescription: description });
                    await onApplied();
                  })
                }
              >
                <Check size={14} />
                Apply suggestions
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
