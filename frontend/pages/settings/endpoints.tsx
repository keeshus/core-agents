import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, Plus, Trash2, Edit3, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';

const PROVIDER_STYLES: Record<string, string> = {
  anthropic: 'bg-blue-100 text-blue-700',
  openai: 'bg-green-100 text-green-700',
  litellm: 'bg-purple-100 text-purple-700',
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
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this endpoint?')) return;
    setDeleting(id);
    try {
      await api.llmEndpoints.delete(id);
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete endpoint');
    } finally {
      setDeleting(null);
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

  const toggleShowApiKey = (id: string) => {
    setShowApiKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">LLM Endpoints</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your LLM provider connections
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Endpoint
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 bg-white rounded-lg border p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-gray-900">
              {editingId ? 'Edit Endpoint' : 'New Endpoint'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Name</span>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Anthropic Key"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Provider Type</span>
                <select
                  required
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                  value={form.providerType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      providerType: e.target.value as 'anthropic' | 'openai' | 'litellm',
                    }))
                  }
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="litellm">LiteLLM</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  Base URL {form.providerType !== 'litellm' && <span className="text-gray-400">(optional)</span>}
                </span>
                <input
                  type="text"
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder={
                    form.providerType === 'litellm'
                      ? 'http://localhost:4000'
                      : 'https://api.anthropic.com'
                  }
                  required={form.providerType === 'litellm'}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  API Key {editingId && <span className="text-gray-400">(leave blank to keep current)</span>}
                </span>
                <input
                  type="password"
                  required={!editingId}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-ant-..."
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Default Model</span>
                {(() => {
                  const parsed = form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '');
                  if (parsed.length > 0) {
                    return (
                      <select
                        required
                        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                        value={form.defaultModel}
                        onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
                      >
                        <option value="">Select default...</option>
                        {parsed.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                      value={form.defaultModel}
                      onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
                      placeholder="claude-sonnet-4-20250514"
                    />
                  );
                })()}
              </label>
            </div>

            <div className="col-span-2">
              <span className="text-xs font-medium text-gray-700 block mb-1">Models</span>
              <div className="space-y-1.5">
                {(form.models ? form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '') : []).map((model, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                      value={model}
                      onChange={(e) => {
                        const list = form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '');
                        list[i] = e.target.value;
                        setForm((f) => ({ ...f, models: list.join(', ') }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = form.models.split(',').map(s => s.trim()).filter((s) => s.length > 0 || s === '');
                        list.splice(i, 1);
                        setForm((f) => ({ ...f, models: list.join(', ') }));
                      }}
                      className="px-1.5 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 shrink-0 font-bold"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, models: f.models ? f.models + ', ' : ' ' }))}
                  className="text-[11px] text-blue-600 hover:underline"
                >+ Add model</button>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Update Endpoint' : 'Create Endpoint'}
              </button>
            </div>
          </form>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">Loading endpoints...</div>
        )}

        {/* Empty state */}
        {!loading && !error && endpoints.length === 0 && (
          <div className="text-center py-16 bg-white rounded-lg border">
            <Cpu className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No endpoints configured</p>
            <p className="text-gray-400 text-sm mt-1">
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
                className="bg-white rounded-lg border p-4 flex items-start gap-4"
              >
                <div className="p-2 bg-gray-50 rounded-lg">
                  <Cpu className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900">{ep.name}</h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        PROVIDER_STYLES[ep.provider_type] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {PROVIDER_LABELS[ep.provider_type] || ep.provider_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Model: <span className="font-mono text-gray-600">{ep.default_model}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{(ep.models || []).length} model{(ep.models || []).length !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => toggleShowApiKey(ep.id)}
                      className="flex items-center gap-1 hover:text-gray-600 transition-colors"
                    >
                      {showApiKey[ep.id] ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>{(ep.api_key || '').slice(0, 8)}...</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>API Key hidden</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(ep)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit endpoint"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ep.id)}
                    disabled={deleting === ep.id}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    title="Delete endpoint"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
