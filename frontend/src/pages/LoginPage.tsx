import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle,
  Mail,
  Lock,
  KeyRound,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/context/AuthContext';
import TermsModal from '@/components/auth/TermsModal';

const ALLOWED_DOMAIN = '@indium.tech';
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

type Mode = 'password' | 'otp-email' | 'otp-code';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Mode: password login (default), OTP email step, OTP code step
  const [mode, setMode] = useState<Mode>('password');

  // Password login state
  const [pwEmail, setPwEmail] = useState('');
  const [pwPassword, setPwPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [resendCountdown, setResendCountdown] = useState(0);
  const [testOtp, setTestOtp] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // Auto-focus first OTP box
  useEffect(() => {
    if (mode === 'otp-code') setTimeout(() => otpRefs.current[0]?.focus(), 80);
  }, [mode]);

  // ── Password login ──────────────────────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = pwEmail.trim().toLowerCase();
    if (!trimmedEmail.endsWith(ALLOWED_DOMAIN)) {
      setError(`Only ${ALLOWED_DOMAIN} addresses are allowed.`);
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms & Conditions to continue.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<AuthUser>('/api/v1/auth/login', {
        email: trimmedEmail,
        password: pwPassword,
        termsAccepted,
      });
      setUser(res.data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.details ||
          err?.response?.data?.error ||
          'Sign in failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── OTP: request code ───────────────────────────────────────────────────────
  const handleOtpEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = otpEmail.trim().toLowerCase();
    if (!trimmed.endsWith(ALLOWED_DOMAIN)) {
      setError(`Only ${ALLOWED_DOMAIN} addresses are allowed.`);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<{ otp?: string }>('/api/v1/auth/request-otp', { email: trimmed });
      if (res.data.otp) setTestOtp(res.data.otp);
      setOtpEmail(trimmed);
      setMode('otp-code');
      setResendCountdown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(
        err?.response?.data?.details ||
          err?.response?.data?.error ||
          'Failed to send code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── OTP: digit input handling ───────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError('');
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (digit && next.every(Boolean)) submitOtp(next.join(''));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index]) { const next = [...otp]; next[index] = ''; setOtp(next); }
      else if (index > 0) otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;
    const next = Array(OTP_LENGTH).fill('');
    digits.split('').forEach((d, i) => { next[i] = d; });
    setOtp(next);
    const focusIdx = Math.min(digits.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
    if (digits.length === OTP_LENGTH) submitOtp(digits);
  };

  const submitOtp = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post<AuthUser>('/api/v1/auth/verify-otp', { email: otpEmail, code });
      setUser(res.data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Incorrect or expired code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setError('');
    setOtp(Array(OTP_LENGTH).fill(''));
    setLoading(true);
    try {
      const res = await apiClient.post<{ otp?: string }>('/api/v1/auth/request-otp', { email: otpEmail });
      if (res.data.otp) setTestOtp(res.data.otp);
      setResendCountdown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(err?.response?.data?.details || err?.response?.data?.error || 'Failed to resend.');
    } finally {
      setLoading(false);
    }
  };

  const switchToOtp = () => {
    setError('');
    setOtpEmail(pwEmail); // pre-fill OTP email from password form if typed
    setMode('otp-email');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary mb-4 shadow-lg">
            <CheckCircle className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Panel Pulse AI</h1>
        </div>

        {/* Card */}
        <div className="bg-bg-base border border-border-primary rounded-2xl p-8 shadow-2xl">

          {/* ── Password login (default) ── */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-5" noValidate>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Sign in</h2>
                <p className="text-sm text-text-muted">
                  Use your <span className="text-text-secondary font-medium">INDIUM</span> account.
                </p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="pw-email" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    id="pw-email"
                    type="email"
                    value={pwEmail}
                    onChange={(e) => { setPwEmail(e.target.value); setError(''); }}
                    placeholder="john.doe@indium.tech"
                    autoComplete="email"
                    autoFocus
                    required
                    className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-4 py-3
                               text-sm text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="pw-password" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    id="pw-password"
                    type={showPassword ? 'text' : 'password'}
                    value={pwPassword}
                    onChange={(e) => { setPwPassword(e.target.value); setError(''); }}
                    placeholder="Your password"
                    autoComplete="current-password"
                    required
                    className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-10 py-3
                               text-sm text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <input
                  id="login-terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => { setTermsAccepted(e.target.checked); setError(''); }}
                  className="mt-0.5 w-4 h-4 accent-accent-primary rounded cursor-pointer flex-shrink-0"
                />
                <label htmlFor="login-terms" className="text-sm text-text-muted leading-snug cursor-pointer select-none">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-accent-primary underline underline-offset-2 hover:text-accent-secondary transition-colors"
                  >
                    Terms &amp; Conditions
                  </button>
                </label>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !pwEmail.trim() || !pwPassword || !termsAccepted}
                className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-secondary
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold text-sm rounded-xl py-3 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </button>

              <div className="flex items-center justify-between text-xs text-text-muted pt-1">
                <Link to="/register" className="hover:text-accent-primary transition-colors">
                  Create an account
                </Link>
                <button
                  type="button"
                  onClick={switchToOtp}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  <KeyRound className="w-3 h-3" /> Sign in with email code
                </button>
              </div>
            </form>
          )}

          {/* ── OTP: email step ── */}
          {mode === 'otp-email' && (
            <form onSubmit={handleOtpEmailSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Sign in with code</h2>
                <p className="text-sm text-text-muted">
                  Enter your <span className="text-text-secondary font-medium">INDIUM</span> email.
                  We'll send you a one-time code.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="otp-email" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    id="otp-email"
                    type="email"
                    value={otpEmail}
                    onChange={(e) => { setOtpEmail(e.target.value); setError(''); }}
                    placeholder="john.doe@indium.tech"
                    autoComplete="email"
                    autoFocus
                    required
                    className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-4 py-3
                               text-sm text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               transition-colors"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !otpEmail.trim()}
                className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-secondary
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold text-sm rounded-xl py-3 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send code <ArrowRight className="w-4 h-4" /></>}
              </button>

              <button
                type="button"
                onClick={() => { setMode('password'); setError(''); }}
                className="w-full text-xs text-text-muted hover:text-text-secondary transition-colors text-center"
              >
                ← Back to password sign in
              </button>
            </form>
          )}

          {/* ── OTP: code entry step ── */}
          {mode === 'otp-code' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Check your email</h2>
                <p className="text-sm text-text-muted">
                  We sent a 6-digit code to{' '}
                  <span className="text-text-secondary font-medium">{otpEmail}</span>.
                </p>
              </div>

              {/* Test OTP display */}
              {testOtp && (
                <div className="p-4 rounded-xl border border-accent-primary/30 bg-accent-primary/5">
                  <p className="text-[10px] text-text-muted uppercase tracking-[0.3em] font-bold mb-3 text-center">
                    Testing Verification Code
                  </p>
                  <div className="bg-bg-surface border border-accent-primary/20 py-4 rounded-xl text-center">
                    <span className="text-4xl font-mono font-black text-accent-primary tracking-[0.4em]">
                      {testOtp}
                    </span>
                  </div>
                </div>
              )}

              {/* OTP boxes */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    className="w-11 h-14 text-center text-xl font-bold bg-bg-surface border border-border-primary
                               rounded-xl text-text-primary caret-accent-primary
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               disabled:opacity-50 transition-colors"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                </div>
              )}

              {error && (
                <p className="text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2 text-center">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-text-muted">
                <button
                  onClick={() => { setMode('otp-email'); setError(''); setOtp(Array(OTP_LENGTH).fill('')); }}
                  className="hover:text-text-secondary transition-colors"
                >
                  ← Change email
                </button>
                <button
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading}
                  className="flex items-center gap-1 hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
