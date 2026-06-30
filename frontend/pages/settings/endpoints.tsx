import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api-client';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useConfirm } from '@/lib/useConfirm';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { Tooltip } from '@/components/ui/Tooltip';

const PROVIDER_STYLES: Record<string, string> = {
  anthropic: 'bg-primary-container text-primary',
  openai: 'bg-success-container text-success',
  litellm: 'bg-secondary-container text-on-secondary-container',
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  litellm: 'LiteLLM',
};

interface FormState {
  name: string;
  providerType: 'anthropic' | 'openai' | 'litellm';
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  providerType: 'anthropic' as const,
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  models: '',
};

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteConfirm = useConfirm({ title: 'Delete endpoint?', message: 'Are you sure you want to delete this endpoint? This cannot be undone.' });
  useAssistantContext({ pageKey: 'settings:endpoints', description: 'Managing LLM endpoints' });

  const fetchEndpoints = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.llmEndpoints.list();
      setEndpoints(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load endpoints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (ep: any) => {
    setForm({
      name: ep.name,
      providerType: ep.provider_type,
      baseUrl: ep.base_url || '',
      apiKey: '',
      defaultModel: ep.default_model,
      models: (ep.models || []).join(', '),
    });
    setEditingId(ep.id);
    setShowForm(true);
  };

  const handleDelete = async (ep: any) => {
    if (ep.is_default) {
      setError('Cannot delete the default endpoint. Set another endpoint as default first.');
      return;
    }
    const confirmed = await deleteConfirm.confirm();
    if (!confirmed) return;
    setDeleting(ep.id);
    try {
      await api.llmEndpoints.delete(ep.id);
      setEndpoints((prev) => prev.filter((e) => e.id !== ep.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete endpoint');
    } finally {
      setDeleting(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.llmEndpoints.update(id, { isDefault: true });
      setEndpoints(await api.llmEndpoints.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const modelsList = form.models
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        const updateData: Record<string, unknown> = {
          name: form.name,
          providerType: form.providerType,
          baseUrl: form.baseUrl || null,
          defaultModel: form.defaultModel,
          models: modelsList,
        };
        if (form.apiKey) updateData.apiKey = form.apiKey;

        const updated = await api.llmEndpoints.update(editingId, updateData);
        setEndpoints((prev) =>
          prev.map((ep) => (ep.id === editingId ? updated : ep)),
        );
      } else {
        const created = await api.llmEndpoints.create({
          name: form.name,
          providerType: form.providerType,
          baseUrl: form.baseUrl || null,
          apiKey: form.apiKey,
          defaultModel: form.defaultModel,
          models: modelsList,
        });
        setEndpoints((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save endpoint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-on-surface">LLM Endpoints</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Manage your LLM provider connections
            </p>
            <p className="text-[10px] text-on-surface-variant mt-1">
              ⭐ The default endpoint is used by the Co-Pilot AI assistant for system-wide tasks like answering questions and helping you build flows.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="m3-button gap-2"
            >
              <Icon name="add" className="text-base" />
              Add Endpoint
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-error-container border border-red-200 rounded-lg flex items-center gap-2 text-sm text-error">
            <Icon name="error" className="text-base flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 bg-surface rounded-lg border border-outline-variant p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-on-surface">
              {editingId ? 'Edit Endpoint' : 'New Endpoint'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField
                label="Name"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              />

              <SelectField
                label="Provider Type"
                value={form.providerType}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    providerType: v as 'anthropic' | 'openai' | 'litellm',
                  }))
                }
                options={[
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'openai', label: 'OpenAI' },
                  { value: 'litellm', label: 'LiteLLM' },
                ]}
              />

              <TextField
                label="Base URL"
                value={form.baseUrl}
                onChange={(v) => setForm((f) => ({ ...f, baseUrl: v }))}
              />

              <TextField
                label="API Key"
                type="password"
                value={form.apiKey}
                onChange={(v) => setForm((f) => ({ ...f, apiKey: v }))}
                helpText={editingId ? 'Leave blank to keep current' : undefined}
              />

            <div className="col-span-2">
              <span className="text-xs font-medium text-on-surface-variant block mb-1">Models</span>
              <div className="space-y-1.5">
                {(() => {
                  const models = form.models ? form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '') : [];
                  const sorted = [...models].sort((a, b) => {
                    if (a === form.defaultModel) return -1;
                    if (b === form.defaultModel) return 1;
                    return 0;
                  });
                  return sorted.map((model, i) => (
                  <div key={i} className={`flex items-center gap-1 p-2 rounded transition-colors ${form.defaultModel === model ? 'bg-secondary-container ring-1 ring-primary' : ''}`}>
                    <span
                      onClick={() => setForm((f) => ({ ...f, defaultModel: model }))}
                      className="flex items-center cursor-pointer shrink-0 w-20 justify-center"
                    >
                      {form.defaultModel === model ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-on-primary font-medium">Default</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 text-on-surface-variant">Set default</span>
                      )}
                    </span>
                    <TextField
                      label="Model"
                      value={model}
                      onChange={(v) => {
                        const list = form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '');
                        const idx = list.findIndex(m => m === model);
                        if (idx !== -1) list[idx] = v;
                        setForm((f) => ({ ...f, models: list.join(', ') }));
                      }}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '');
                        const idx = list.findIndex(m => m === model);
                        if (idx !== -1) list.splice(idx, 1);
                        setForm((f) => ({ ...f, models: list.join(', ') }));
                      }}
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors"
                      aria-label="Remove model"
                    ><Icon name="close" className="text-sm" /></button>
                  </div>
                ));
                })()}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, models: f.models ? f.models + ', ' : ' ' }))}
                  className="text-[11px] text-primary hover:underline"
                >+ Add model</button>
              </div>
              <p className="mt-1 text-[10px] text-on-surface-variant">Click "Set default" to mark a model as the default for this endpoint.</p>
            </div>
          </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="m3-button disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingId ? 'Update Endpoint' : 'Create Endpoint'}
              </button>
            </div>
          </form>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-on-surface-variant text-sm">Loading endpoints...</div>
        )}

        {/* Empty state */}
        {!loading && !error && endpoints.length === 0 && (
          <div className="text-center py-16 bg-surface rounded-lg border border-outline-variant">
            <Icon name="memory" className="text-4xl text-on-surface-variant mx-auto mb-3" />
            <p className="text-on-surface-variant font-medium">No endpoints configured</p>
            <p className="text-on-surface-variant text-sm mt-1">
              Add an LLM endpoint to get started
            </p>
          </div>
        )}

        {/* Endpoint list */}
        {!loading && endpoints.length > 0 && (
          <div className="space-y-3">
            {endpoints.map((ep) => (
              <div
                key={ep.id}
                className="bg-surface rounded-lg border border-outline-variant p-4 flex items-start gap-4"
              >
                <div className="p-2 bg-surface-container rounded-lg">
                  <Icon name="memory" className="text-xl text-on-surface-variant" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-on-surface">{ep.name}</h3>
                    {ep.is_default && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-medium">⭐ Default</span>
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        PROVIDER_STYLES[ep.provider_type] || 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {PROVIDER_LABELS[ep.provider_type] || ep.provider_type}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Model: <span className="font-mono text-on-surface-variant">{ep.default_model}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
                    <span>{(ep.models || []).length} model{(ep.models || []).length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!ep.is_default && (
                    <Tooltip content="Use this endpoint for the Co-Pilot AI assistant">
                      <button
                        onClick={() => handleSetDefault(ep.id)}
                        className="text-[10px] px-2 py-1 rounded bg-secondary-container text-on-secondary-container"
                      >
                        Set as default
                      </button>
                    </Tooltip>
                  )}
                    <Tooltip content="Edit endpoint">
                      <button
                        onClick={() => handleEdit(ep)}
                        className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors"
                      >
                        <Icon name="edit" className="text-base" /> Edit
                      </button>
                    </Tooltip>
                    <Tooltip content="Delete endpoint">
                      <button
                        onClick={() => handleDelete(ep)}
                        disabled={deleting === ep.id}
                        className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors disabled:opacity-50"
                      >
                        <Icon name="delete" className="text-base" /> Delete
                      </button>
                    </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {deleteConfirm.dialog}
    </div>
  );
}
