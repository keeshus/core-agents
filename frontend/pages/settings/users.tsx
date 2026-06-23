import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Trash2, Shield, Loader2, AlertTriangle, Plus, X } from 'lucide-react';
import { API_URL } from '@/lib/api-client';

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">Manage user accounts and roles</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus className="w-3 h-3" /> Create User
          </button>

        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No users</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left p-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left p-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Role</th>
                  <th className="text-left p-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Provider</th>
                  <th className="text-left p-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Login</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{u.name}</td>
                    <td className="p-3 text-gray-600">{u.email}</td>
                    <td className="p-3">
                      <select
                        value={u.role_id || roles[0]?.id || ''}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-gray-600 capitalize">{u.provider}</td>
                    <td className="p-3 text-gray-500 text-xs">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'never'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deleting === u.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                        title="Delete user"
                      >
                        {deleting === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/settings" className="text-sm text-blue-600 hover:underline">← Back to settings</Link>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create User</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {createError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{createError}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" />
                <p className="text-[10px] text-gray-400 mt-1">Minimum 8 characters</p>
              </div>
              <button onClick={handleCreate} disabled={creating} className="w-full bg-gray-900 text-white rounded p-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
