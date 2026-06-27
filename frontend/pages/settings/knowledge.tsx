import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { api } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function KnowledgePage() {
  useAssistantContext({ pageKey: 'settings:knowledge', description: 'Managing knowledge bases' });
  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant"><Icon name="arrow_back" className="text-base" /> <span>Back</span></Link>
          <div><h1 className="text-2xl font-bold text-on-surface">Knowledge Bases</h1><p className="text-sm text-on-surface-variant mt-1">Embedding providers and vector stores for RAG</p></div>
        </div>
        <EmbeddingProviders />
        <div className="mt-6"><VectorStores /></div>
      </div>
    </div>
  );
}

function EmbeddingProviders() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', model: 'text-embedding-ada-002' });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const res = await fetch(`${API_URL}/embedding-providers`);
    setItems(await res.json());
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const reset = () => { setForm({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', model: 'text-embedding-ada-002' }); setEditingId(null); setShowForm(false); };

  return (
    <div className="bg-surface rounded-lg border border-outline-variant p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-on-surface flex items-center gap-2"><Icon name="memory" className="text-base text-primary" /> Embedding Providers</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="m3-button"><Icon name="add" className="text-xs" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          const body = { ...form, baseUrl: form.baseUrl || null };
          if (editingId) { await fetch(`${API_URL}/embedding-providers/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          else { await fetch(`${API_URL}/embedding-providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-surface-container rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({...form, name: v})} />
            <SelectField label="Provider" value={form.providerType} onChange={(v) => setForm({...form, providerType: v})} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'litellm', label: 'LiteLLM' }]} />
            <TextField label="Base URL" value={form.baseUrl} onChange={(v) => setForm({...form, baseUrl: v})} />
            <TextField label="API Key" type="password" value={form.apiKey} onChange={(v) => setForm({...form, apiKey: v})} />
            <TextField label="Model" value={form.model} onChange={(v) => setForm({...form, model: v})} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-white rounded disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-on-surface-variant">Loading...</p> : items.length === 0 ? <p className="text-sm text-on-surface-variant">No embedding providers configured</p> : (
        <div className="space-y-2">
          {items.map((ep: any) => (
            <div key={ep.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">{ep.name}</p>
                <p className="text-xs text-on-surface-variant">{ep.provider_type} · {ep.model} · {ep.base_url || 'default'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setForm({ name: ep.name, providerType: ep.provider_type, baseUrl: ep.base_url || '', apiKey: '', model: ep.model }); setEditingId(ep.id); setShowForm(true); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-primary"><Icon name="edit" className="text-sm" /> Edit</button>
                <button onClick={async () => { if (!confirm('Delete?')) return; await fetch(`${API_URL}/embedding-providers/${ep.id}`, { method: 'DELETE' }); loadData(); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error"><Icon name="delete" className="text-sm" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VectorStores() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', apiKey: '', storeType: 'qdrant' });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const res = await fetch(`${API_URL}/vector-stores`);
    setItems(await res.json());
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const reset = () => { setForm({ name: '', url: '', apiKey: '', storeType: 'qdrant' }); setShowForm(false); };

  return (
    <div className="bg-surface rounded-lg border border-outline-variant p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-on-surface flex items-center gap-2"><Icon name="database" className="text-base text-primary" /> Vector Stores</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="m3-button"><Icon name="add" className="text-xs" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          await fetch(`${API_URL}/vector-stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, storeType: form.storeType }) });
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-surface-container rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({...form, name: v})} />
            <SelectField label="Type" value={form.storeType} onChange={(v) => setForm({...form, storeType: v})} options={[{ value: 'qdrant', label: 'Qdrant' }, { value: 'neo4j', label: 'Neo4j' }]} />
            <TextField label="URL" value={form.url} onChange={(v) => setForm({...form, url: v})} />
            <TextField label="API Key" type="password" value={form.apiKey} onChange={(v) => setForm({...form, apiKey: v})} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-white rounded disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-on-surface-variant">Loading...</p> : items.length === 0 ? <p className="text-sm text-on-surface-variant">No vector stores configured</p> : (
        <div className="space-y-2">
          {items.map((vs: any) => (
            <div key={vs.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">{vs.name}</p>
                <p className="text-xs text-on-surface-variant">{vs.store_type} · {vs.url}</p>
              </div>
              <button onClick={async () => { if (!confirm('Delete?')) return; await fetch(`${API_URL}/vector-stores/${vs.id}`, { method: 'DELETE' }); loadData(); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error"><Icon name="delete" className="text-sm" /> Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
