import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { API_URL } from '@/lib/api-client';
import { Tooltip } from '@/components/ui/Tooltip';

interface Role {
  id: string;
  name: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role_id: string | null;
  role_name: string | null;
  provider: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function UsersSettingsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  useAssistantContext({ pageKey: 'settings:users', description: 'Managing users' });
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleCreate = async () => {
    if (!newName || !newEmail || !newPassword) { setCreateError('All fields required'); return; }
    if (newPassword.length < 8) { setCreateError('Password must be at least 8 characters'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: newEmail, password: newPassword, name: newName }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Registration failed' })); throw new Error(err.error); }
      setShowCreate(false);
      setNewName(''); setNewEmail(''); setNewPassword('');
      await load();
    } catch (err: any) { setCreateError(err.message); }
    finally { setCreating(false); }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch(`${API_URL}/users`, { credentials: 'include' }),
        fetch(`${API_URL}/roles`, { credentials: 'include' }),
      ]);
      if (!usersRes.ok || !rolesRes.ok) throw new Error('Failed to load');
      setUsers(await usersRes.json());
      setRoles(await rolesRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId: string, roleId: string) => {
    try {
      const res = await fetch(`${API_URL}/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role_id: roleId || null }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        const role = roles.find(r => r.id === roleId);
        return { ...u, role_id: roleId || null, role_name: role?.name || null };
      }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    setDeleting(userId);
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-on-surface">Users</h1>
            <p className="text-sm text-on-surface-variant mt-1">Manage user accounts and roles</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="m3-button">
            <Icon name="add" className="text-xs" /> Create User
          </button>

        </div>

        {error && (
          <div className="bg-error-container border border-red-200 text-error text-sm rounded p-3 mb-4 flex items-center gap-2">
            <Icon name="warning" className="text-base shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Icon name="sync" className="text-2xl text-on-surface-variant animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border border-outline-variant">
            <Icon name="shield" className="text-5xl text-on-surface-variant mx-auto mb-3" />
            <p className="text-on-surface-variant font-medium">No users</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-container">
                  <th className="text-left p-3 font-medium text-on-surface-variant text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left p-3 font-medium text-on-surface-variant text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left p-3 font-medium text-on-surface-variant text-xs uppercase tracking-wider">Role</th>
                  <th className="text-left p-3 font-medium text-on-surface-variant text-xs uppercase tracking-wider">Provider</th>
                  <th className="text-left p-3 font-medium text-on-surface-variant text-xs uppercase tracking-wider">Last Login</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-surface-container-high">
                    <td className="p-3 font-medium text-on-surface">{u.name}</td>
                    <td className="p-3 text-on-surface-variant">{u.email}</td>
                    <td className="p-3">
                      <SelectField
                        label="Role"
                        value={u.role_id || roles[0]?.id || ''}
                        onChange={(v) => handleRoleChange(u.id, v)}
                        options={roles.map(r => ({ value: r.id, label: r.name }))}
                      />
                    </td>
                    <td className="p-3 text-on-surface-variant capitalize">{u.provider}</td>
                    <td className="p-3 text-on-surface-variant text-xs">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'never'}
                    </td>
                    <td className="p-3 text-right">
                      <Tooltip content="Delete user">
                        <button
                          onClick={() => handleDelete(u.id)}
                          disabled={deleting === u.id}
                          className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error disabled:opacity-50 transition-colors"
                        >
                          {deleting === u.id ? <Icon name="sync" className="text-base animate-spin" /> : <Icon name="delete" className="text-base" />} Delete
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-surface rounded-lg shadow-m3-4 max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-on-surface">Create User</h3>
              <button onClick={() => setShowCreate(false)} className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface-variant"><Icon name="close" className="text-base" /> Close</button>
            </div>
            {createError && <div className="bg-error-container border border-red-200 text-error text-sm rounded p-3 mb-4">{createError}</div>}
            <div className="space-y-3">
              <TextField label="Name" value={newName} onChange={setNewName} />
              <TextField label="Email" type="email" value={newEmail} onChange={setNewEmail} />
              <TextField label="Password" type="password" value={newPassword} onChange={setNewPassword} helpText="Minimum 8 characters" />
              <button onClick={handleCreate} disabled={creating} className="w-full m3-button disabled:opacity-50">
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
