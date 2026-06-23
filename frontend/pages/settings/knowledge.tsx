import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { ArrowLeft, Plus, Trash2, Edit3, Cpu, Database, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function KnowledgePage() {
  useAssistantContext({ pageKey: 'settings:knowledge', description: 'Managing knowledge bases' });
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
          <div><h1 className="text-2xl font-bold text-gray-900">Knowledge Bases</h1><p className="text-sm text-gray-500 mt-1">Embedding providers and vector stores for RAG</p></div>
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
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Cpu className="w-4 h-4 text-blue-500" /> Embedding Providers</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"><Plus className="w-3 h-3" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          const body = { ...form, baseUrl: form.baseUrl || null };
          if (editingId) { await fetch(`${API_URL}/embedding-providers/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          else { await fetch(`${API_URL}/embedding-providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium">Name</span><input required className="mt-1 block w-full rounded border p-2 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <label className="block"><span className="text-xs font-medium">Provider</span><select className="mt-1 block w-full rounded border p-2 text-sm bg-white" value={form.providerType} onChange={e => setForm({...form, providerType: e.target.value})}><option value="openai">OpenAI</option><option value="litellm">LiteLLM</option></select></label>
            <label className="block"><span className="text-xs font-medium">Base URL</span><input className="mt-1 block w-full rounded border p-2 text-sm" value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})} placeholder="https://api.openai.com/v1" /></label>
            <label className="block"><span className="text-xs font-medium">API Key</span><input type="password" required={!editingId} className="mt-1 block w-full rounded border p-2 text-sm" value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})} /></label>
            <label className="block"><span className="text-xs font-medium">Model</span><input required className="mt-1 block w-full rounded border p-2 text-sm" value={form.model} onChange={e => setForm({...form, model: e.target.value})} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-gray-400">Loading...</p> : items.length === 0 ? <p className="text-sm text-gray-400">No embedding providers configured</p> : (
        <div className="space-y-2">
          {items.map((ep: any) => (
            <div key={ep.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">{ep.name}</p>
                <p className="text-xs text-gray-500">{ep.provider_type} · {ep.model} · {ep.base_url || 'default'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setForm({ name: ep.name, providerType: ep.provider_type, baseUrl: ep.base_url || '', apiKey: '', model: ep.model }); setEditingId(ep.id); setShowForm(true); }} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={async () => { if (!confirm('Delete?')) return; await fetch(`${API_URL}/embedding-providers/${ep.id}`, { method: 'DELETE' }); loadData(); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
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
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Database className="w-4 h-4 text-purple-500" /> Vector Stores</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"><Plus className="w-3 h-3" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          await fetch(`${API_URL}/vector-stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, storeType: form.storeType }) });
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium">Name</span><input required className="mt-1 block w-full rounded border p-2 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <label className="block">
              <span className="text-xs font-medium">Type</span>
              <select className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white" value={form.storeType} onChange={e => setForm({...form, storeType: e.target.value})}>
                <option value="qdrant">Qdrant</option>
                <option value="neo4j">Neo4j</option>
              </select>
            </label>
            <label className="block"><span className="text-xs font-medium">URL</span><input required className="mt-1 block w-full rounded border p-2 text-sm" value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="http://localhost:6333" /></label>
            <label className="block"><span className="text-xs font-medium">API Key</span><input type="password" className="mt-1 block w-full rounded border p-2 text-sm" value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-gray-400">Loading...</p> : items.length === 0 ? <p className="text-sm text-gray-400">No vector stores configured</p> : (
        <div className="space-y-2">
          {items.map((vs: any) => (
            <div key={vs.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">{vs.name}</p>
                <p className="text-xs text-gray-500">{vs.store_type} · {vs.url}</p>
              </div>
              <button onClick={async () => { if (!confirm('Delete?')) return; await fetch(`${API_URL}/vector-stores/${vs.id}`, { method: 'DELETE' }); loadData(); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
