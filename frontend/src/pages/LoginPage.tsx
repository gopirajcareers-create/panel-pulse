import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Code } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ParticleBackground } from '@/components/ui/ParticleBackground';

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
  const [isDevLoading, setIsDevLoading] = useState(false);

  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const ssoError = searchParams.get('error');
  const errorMessage = ssoError ? (SSO_ERROR_MESSAGES[ssoError] || 'Sign-in failed. Please try again.') : '';

  const handleDevLogin = async () => {
    setIsDevLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/v1/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        navigate('/', { replace: true });
      } else {
        console.error('Dev login failed');
      }
    } catch (error) {
      console.error('Dev login error:', error);
    } finally {
      setIsDevLoading(false);
    }
  };

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
          <a
            href="/api/v1/auth/azure/login"
            className="inline-flex items-center justify-center gap-3 bg-[#E8641F] hover:bg-[#D65F1A] text-white font-semibold text-base px-10 py-3.5 rounded-full shadow-lg shadow-orange-600/40 transition-all duration-200 hover:shadow-orange-600/60 hover:scale-[1.03] active:scale-[0.98] w-full max-w-[280px]"
          >
            Sign In
          </a>

          {/* Dev Login Bypass - Only shown in development */}
          {isDev && (
            <button
              onClick={handleDevLogin}
              disabled={isDevLoading}
              className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-medium text-sm px-6 py-2.5 rounded-full shadow-md transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] w-full max-w-[280px]"
            >
              <Code className="w-4 h-4" />
              {isDevLoading ? 'Logging in...' : 'Dev Login (Skip SSO)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}