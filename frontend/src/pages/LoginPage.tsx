import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, apiClient } from '@/lib/api/client';
import { ParticleBackground } from '@/components/ui/ParticleBackground';

const SSO_BASE = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_denied: 'Sign-in was cancelled or denied.',
  sso_no_code: 'Sign-in did not complete. Please try again.',
  sso_token_failed: 'Failed to complete sign-in. Please try again.',
  sso_init_failed: 'SSO is not configured on the server. Contact IT support.',
  unauthorized_domain: 'Only @indium.tech accounts are allowed.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [searchParams] = useSearchParams();

  const [showTestSignIn, setShowTestSignIn] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const ssoError = searchParams.get('error');
  const errorMessage = ssoError ? (SSO_ERROR_MESSAGES[ssoError] || 'Sign-in failed. Please try again.') : '';

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-bg-surface">
      <ParticleBackground />

      <div className="absolute top-6 right-8">
        <img src="/logo.png" alt="Indium" className="h-8 object-contain" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Welcome to Panel Pulse AI
          </h1>
          <p className="text-base text-white/60">
            An AI Powered Panel Evaluation system
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-sm w-full">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-4 w-full items-center">
          {/* Main Auth */}
          <div className="w-full flex flex-col items-center gap-2">
          <a
            href={`${SSO_BASE}/api/v1/auth/azure/login`}
            className="inline-flex items-center justify-center gap-3 bg-[#E8641F] hover:bg-[#D65F1A] text-white font-semibold text-base px-10 py-3.5 rounded-full shadow-lg shadow-orange-600/40 transition-all duration-200 hover:shadow-orange-600/60 hover:scale-[1.03] active:scale-[0.98] w-full max-w-[280px]"
          >
            Sign In
          </a>
          
          {!showTestSignIn ? (
            <button
              onClick={() => setShowTestSignIn(true)}
              className="inline-flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium text-sm px-6 py-2.5 rounded-full border border-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] w-full max-w-[280px]"
            >
              Test Signin
            </button>
          ) : (
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setTestError('');
                try {
                  const res = await apiClient.post('/api/v1/auth/bypass', { email: testEmail, password: testPassword });
                  setUser(res.data);
                  navigate('/', { replace: true });
                } catch (err: any) {
                  setTestError(err.response?.data?.error || "Test login failed");
                }
              }}
              className="w-full max-w-[280px] flex flex-col gap-3"
            >
              <div className="text-left w-full">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1 ml-1">Test Email</label>
                <input 
                  type="email" 
                  placeholder="e.g. deepak@test.tech" 
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="text-left w-full">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1 ml-1">Password</label>
                <input 
                  type="password" 
                  placeholder="Enter TEST123" 
                  value={testPassword}
                  onChange={e => setTestPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                  required
                  autoComplete="off"
                />
              </div>
              {testError && <p className="text-xs text-red-400 text-center">{testError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium text-sm px-4 py-2.5 rounded-lg border border-white/10 transition-all duration-200"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowTestSignIn(false)}
                  className="flex-1 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}