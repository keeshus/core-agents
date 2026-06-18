import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Trash2, Shield, Loader2, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

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
  const [error, setError] = useState('');

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
          <button onClick={load} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50">
            <Loader2 className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
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
                        value={u.role_id || ''}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="">None</option>
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
    </div>
  );
}
