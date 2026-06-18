import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const authConfig = useAuthConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasSso = authConfig?.sso != null;
  const ssoName = authConfig?.sso?.name || 'SSO';

  // Read error from URL params (SSO callback errors)
  useEffect(() => {
    const errParam = router.query.error as string;
    if (errParam === 'sso_failed') setError('SSO login failed. Please try again.');
    else if (errParam === 'missing_sso_state') setError('SSO session expired. Please try again.');
    else if (errParam === 'no_user_info') setError('Could not retrieve user info from SSO provider.');
  }, [router.query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Sign In</h1>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}

          {hasSso && (
            <>
              <a
                href={`${API_URL}/auth/sso/login`}
                className="flex items-center justify-center gap-2 w-full border-2 border-gray-300 text-gray-700 rounded p-2.5 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors mb-4"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3" />
                </svg>
                Sign in with {ssoName}
              </a>
            </>
          )}

          {hasSso && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white rounded p-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Don&apos;t have an account? <Link href="/register" className="text-blue-600 hover:underline">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
