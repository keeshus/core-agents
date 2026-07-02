import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { API_URL, api } from '@/lib/api-client';
import { useConfirm } from '@/lib/useConfirm';
import { useAuth } from '@/lib/auth-context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { Tooltip } from '@/components/ui/Tooltip';

interface Secret {
  id: string;
  name: string;
  scope: string;
  scope_id: string | null;
  updated_at: string;
  created_at: string;
}

type Scope = 'app' | 'group' | 'flow';

interface FormState {
  name: string;
  value: string;
}

const EMPTY_FORM: FormState = { name: '', value: '' };

export default function SecretsPage() {
  const { user, userGroups } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const canAdmin = can('admin');

  const [scope, setScope] = useState<Scope>('app');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formValue, setFormValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, { value: string; expiresAt: number }>>({});
  const [now, setNow] = useState(Date.now());
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [formScope, setFormScope] = useState<Scope>('app');
  const [formScopeId, setFormScopeId] = useState('');
  const [rotating, setRotating] = useState(false);
  const [reEncrypting, setReEncrypting] = useState(false);
  const [vaults, setVaults] = useState<any[]>([]);

  const deleteConfirm = useConfirm({ title: 'Delete secret?', message: 'Are you sure you want to delete this secret? This cannot be undone.' });
  const rotateConfirm = useConfirm({ title: 'Rotate encryption key?', message: 'Rotate the root encryption key used to encrypt all secrets at rest? Existing secrets will be re-encrypted automatically.' });
  const reEncryptConfirm = useConfirm({ title: 'Re-encrypt secrets?', message: 'Re-encrypt all secrets with the current key? Use this after a data breach or as a security best practice.' });

  useAssistantContext({ pageKey: 'settings:secrets', description: 'Managing secrets' });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scope === 'flow' && flows.length === 0 && !flowsLoading) {
      setFlowsLoading(true);
      api.flows.list({ limit: 1000 })
        .then((data) => setFlows(Array.isArray(data.data) ? data.data.map((f: any) => ({ id: f.id, name: f.name })) : []))
        .catch(() => {})
        .finally(() => setFlowsLoading(false));
    }
  }, [scope, flows.length, flowsLoading]);

  useEffect(() => {
    api.secretVaults.list()
      .then((data) => setVaults(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchSecrets = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (scopeId) params.set('scopeId', scopeId);
      const res = await fetch(`${API_URL}/secrets?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load secrets');
      const data = await res.json();
      setSecrets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, [scope, scopeId]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormValue('');
    setEditingId(null);
    setShowForm(false);
    setFormScope('app');
    setFormScopeId('');
  };

  const handleEdit = (secret: Secret) => {
    setForm({ name: secret.name, value: '' });
    setFormValue('');
    setEditingId(secret.id);
    setFormScope(secret.scope as Scope);
    setFormScopeId(secret.scope_id || '');
    setShowForm(true);
  };

  const handleDelete = async (secret: Secret) => {
    const confirmed = await deleteConfirm.confirm({ message: `Delete secret "${secret.name}"? This cannot be undone.` });
    if (!confirmed) return;
    setDeleting(secret.id);
    try {
      const res = await fetch(`${API_URL}/secrets/${secret.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      setSecrets((prev) => prev.filter((s) => s.id !== secret.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete secret');
    } finally {
      setDeleting(null);
    }
  };

  const handleReveal = async (secret: Secret) => {
    const confirmed = await deleteConfirm.confirm({ title: 'Reveal secret?', message: `Reveal the value of "${secret.name}"? It will be visible for 10 seconds.` });
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_URL}/secrets/${secret.id}/reveal`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to reveal secret');
      const data = await res.json();
      const expiresAt = Date.now() + 10000;
      setRevealedSecrets((prev) => ({ ...prev, [secret.id]: { value: data.value, expiresAt } }));
      setTimeout(() => {
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[secret.id];
          return next;
        });
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal secret');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const res = await fetch(`${API_URL}/secrets/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value: formValue }),
        });
        if (!res.ok) throw new Error('Failed to update secret');
        resetForm();
      } else {
        const body: Record<string, unknown> = { name: form.name, value: formValue, scope: formScope };
        if (formScope !== 'app') body.scopeId = formScopeId;
        const res = await fetch(`${API_URL}/secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create secret');
        resetForm();
      }
      await fetchSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  const handleRotateKey = async () => {
    const confirmed = await rotateConfirm.confirm();
    if (!confirmed) return;
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/secrets/rotate-key`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to rotate key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setRotating(false);
    }
  };

  const handleReEncrypt = async () => {
    const confirmed = await reEncryptConfirm.confirm();
    if (!confirmed) return;
    setReEncrypting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/secrets/re-encrypt`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to re-encrypt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-encrypt');
    } finally {
      setReEncrypting(false);
    }
  };

  const currentVault = scope === 'group' && scopeId ? vaults.find((v) => v.group_id === scopeId) : null;

  const scopeLabel = scope === 'app' ? 'App-wide' : scope === 'group' ? (userGroups.find((g) => g.id === scopeId)?.name || 'Group') : (flows.find((f) => f.id === scopeId)?.name || 'Flow');

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-on-surface">Secrets</h1>
            <p className="text-sm text-on-surface-variant mt-1">Manage encrypted secrets across app, groups, and flows</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="m3-button gap-2">
              <Icon name="add" className="text-base" />
              Add Secret
            </button>
          )}
        </div>

        {/* Scope switcher */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setScope('app'); setScopeId(null); }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              scope === 'app' ? 'bg-primary text-on-primary shadow-m3-1' : 'bg-surface border border-outline text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <Icon name="public" className="text-sm mr-1" /> App-wide
          </button>
          {userGroups.length > 0 && (
            <SelectField
              label="Group"
              value={scope === 'group' ? (scopeId || '') : ''}
              onChange={(v) => { setScope('group'); setScopeId(v || null); }}
              options={userGroups.map((g) => ({ value: g.id, label: g.name }))}
              className="w-48"
            />
          )}
          <SelectField
            label="Flow"
            value={scope === 'flow' ? (scopeId || '') : ''}
            onChange={(v) => { setScope('flow'); setScopeId(v || null); }}
            options={flows.map((f) => ({ value: f.id, label: f.name }))}
            className="w-48"
          />
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
          <form onSubmit={handleSubmit} className="mb-6 bg-surface rounded-lg border border-outline-variant p-5 space-y-4">
            <h2 className="text-base font-semibold text-on-surface">
              {editingId ? `Edit Secret: ${form.name}` : 'New Secret'}
            </h2>

            {!editingId && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <TextField label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                </div>
                <SelectField
                  label="Scope Type"
                  value={formScope}
                  onChange={(v) => { setFormScope(v as Scope); setFormScopeId(''); }}
                  options={[
                    { value: 'app', label: 'App-wide' },
                    { value: 'group', label: 'Group' },
                    { value: 'flow', label: 'Flow' },
                  ]}
                />
              </div>
            )}
            {!editingId && formScope === 'group' && userGroups.length > 0 && (
              <SelectField
                label="Select Group"
                value={formScopeId}
                onChange={setFormScopeId}
                options={userGroups.map((g) => ({ value: g.id, label: g.name }))}
              />
            )}
            {!editingId && formScope === 'flow' && flows.length > 0 && (
              <SelectField
                label="Select Flow"
                value={formScopeId}
                onChange={setFormScopeId}
                options={flows.map((f) => ({ value: f.id, label: f.name }))}
              />
            )}

            <TextField
              label="Value"
              type="password"
              value={formValue}
              onChange={setFormValue}
              helpText={editingId ? 'Enter new value to update' : undefined}
            />

            <div className="flex items-center gap-2 justify-end">
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="m3-button disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving...' : editingId ? 'Update Secret' : 'Create Secret'}
              </button>
            </div>
          </form>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-on-surface-variant text-sm">Loading secrets...</div>
        )}

        {/* Empty state */}
        {!loading && !error && secrets.length === 0 && (
          <div className="text-center py-16 bg-surface rounded-lg border border-outline-variant">
            <Icon name="key" className="text-5xl text-on-surface-variant mx-auto mb-3" />
            <p className="text-on-surface-variant font-medium">No secrets in {scopeLabel}</p>
            <p className="text-on-surface-variant text-sm mt-1">Add a secret to get started</p>
          </div>
        )}

        {/* Secret list */}
        {!loading && secrets.length > 0 && (
          <div className="space-y-3">
            {secrets.map((secret) => {
              const revealed = revealedSecrets[secret.id];
              const remaining = revealed ? Math.max(0, Math.floor((revealed.expiresAt - now) / 1000)) : 0;
              return (
                <div key={secret.id} className="bg-surface rounded-lg border border-outline-variant p-4 flex items-start gap-4">
                  <div className="p-2 bg-surface-container rounded-lg">
                    <Icon name="key" className="text-xl text-on-surface-variant" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-on-surface">{secret.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-medium">
                        {secret.scope === 'app' ? 'App' : secret.scope === 'group' ? (userGroups.find((g) => g.id === secret.scope_id)?.name || 'Group') : (flows.find((f) => f.id === secret.scope_id)?.name || 'Flow')}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Updated {new Date(secret.updated_at).toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {revealed ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary-container rounded-lg">
                        <span className="text-xs font-mono text-on-surface max-w-[200px] truncate">{revealed.value}</span>
                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap">expires in {remaining}s</span>
                      </div>
                    ) : (
                      <Tooltip content="Reveal secret value">
                        <button
                          onClick={() => handleReveal(secret)}
                          className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-warning hover:bg-secondary-container rounded transition-colors"
                        >
                          <Icon name="visibility" className="text-base" /> Reveal
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip content="Edit secret value">
                      <button
                        onClick={() => handleEdit(secret)}
                        className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors"
                      >
                        <Icon name="edit" className="text-base" /> Edit
                      </button>
                    </Tooltip>
                    <Tooltip content="Delete secret">
                      <button
                        onClick={() => handleDelete(secret)}
                        disabled={deleting === secret.id}
                        className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors disabled:opacity-50"
                      >
                        {deleting === secret.id ? <Icon name="sync" className="text-base animate-spin" /> : <Icon name="delete" className="text-base" />} Delete
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin: Key rotation section */}
        {canAdmin && (
          <div className="mt-8 bg-surface rounded-lg border border-outline-variant p-5">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2 mb-1">
              <Icon name="encryption" className="text-base text-primary" /> Encryption Key Management
            </h2>
            <p className="text-xs text-on-surface-variant mb-4">
              Rotate the root encryption key or re-encrypt all secrets with the current key.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRotateKey}
                disabled={rotating}
                className="m3-button-outlined disabled:opacity-50 disabled:cursor-not-allowed gap-2"
              >
                {rotating ? <Icon name="sync" className="text-base animate-spin" /> : <Icon name="vpn_key" className="text-base" />}
                {rotating ? 'Rotating...' : 'Rotate Key'}
              </button>
              <button
                onClick={handleReEncrypt}
                disabled={reEncrypting}
                className="m3-button-outlined disabled:opacity-50 disabled:cursor-not-allowed gap-2"
              >
                {reEncrypting ? <Icon name="sync" className="text-base animate-spin" /> : <Icon name="refresh" className="text-base" />}
                {reEncrypting ? 'Re-encrypting...' : 'Re-encrypt'}
              </button>
            </div>
          </div>
        )}

        {/* CyberArk / Vault info section */}
        {currentVault && (
          <div className="mt-6 bg-surface rounded-lg border border-outline-variant p-5">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2 mb-1">
              <Icon name="lock" className="text-base text-primary" /> External Vault
            </h2>
            <p className="text-xs text-on-surface-variant mb-3">
              This group has an external secret vault bound. Secrets managed through the vault take precedence over locally stored secrets.
            </p>
            <div className="bg-surface-container rounded-lg p-3 flex items-center gap-3">
              <Icon name="dns" className="text-xl text-primary" />
              <div>
                <p className="text-sm font-medium text-on-surface">{currentVault.name || 'CyberArk Vault'}</p>
                <p className="text-xs text-on-surface-variant">{currentVault.vault_type || 'CyberArk'} — {currentVault.url || 'Connected'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      {deleteConfirm.dialog}
      {rotateConfirm.dialog}
      {reEncryptConfirm.dialog}
    </div>
  );
}
