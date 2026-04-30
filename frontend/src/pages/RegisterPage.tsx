import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle,
  Mail,
  Lock,
  User,
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import TermsModal from '../components/auth/TermsModal';

const ALLOWED_DOMAIN = '@indium.tech';

interface PasswordRule {
  label: string;
  test: (v: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v) => /[0-9]/.test(v) },
  { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function RegisterPage() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [empId, setEmpId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordRulesOk = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit =
    firstName.trim() &&
    lastName.trim() &&
    empId.trim() &&
    email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN) &&
    passwordRulesOk &&
    passwordsMatch &&
    termsAccepted &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.endsWith(ALLOWED_DOMAIN)) {
      setError(`Only ${ALLOWED_DOMAIN} addresses are allowed.`);
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/v1/auth/register', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        empId: empId.trim(),
        email: trimmedEmail,
        password,
        confirmPassword,
        termsAccepted,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: any) {
      setError(
        err?.response?.data?.details ||
          err?.response?.data?.error ||
          'Registration failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-surface flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md py-8">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary mb-4 shadow-lg">
            <CheckCircle className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Panel Pulse AI</h1>
        </div>

        {/* Card */}
        <div className="bg-bg-base border border-border-primary rounded-2xl p-8 shadow-2xl">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Account created!</h2>
              <p className="text-sm text-text-muted">Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Create account</h2>
                <p className="text-sm text-text-muted">
                  Use your <span className="text-text-secondary font-medium">INDIUM</span> email address.
                </p>
              </div>

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    First Name <span className="text-accent-primary">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                      placeholder="John"
                      autoComplete="given-name"
                      autoFocus
                      required
                      className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-3 py-3
                                 text-sm text-text-primary placeholder-text-muted
                                 focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                                 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Last Name <span className="text-accent-primary">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setError(''); }}
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                      className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-3 py-3
                                 text-sm text-text-primary placeholder-text-muted
                                 focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                                 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Emp ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Employee ID <span className="text-accent-primary">*</span>
                </label>
                <div className="relative">
                  <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={empId}
                    onChange={(e) => { setEmpId(e.target.value); setError(''); }}
                    placeholder="IND12345"
                    autoComplete="off"
                    required
                    className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-4 py-3
                               text-sm text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               transition-colors"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Work Email <span className="text-accent-primary">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="john.doe@indium.tech"
                    autoComplete="email"
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
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Password <span className="text-accent-primary">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    autoComplete="new-password"
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

                {/* Inline password rules */}
                {password.length > 0 && (
                  <ul className="grid grid-cols-2 gap-1 pt-1">
                    {PASSWORD_RULES.map((rule) => {
                      const ok = rule.test(password);
                      return (
                        <li
                          key={rule.label}
                          className={`text-[11px] flex items-center gap-1 transition-colors ${ok ? 'text-green-400' : 'text-text-muted'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-green-400' : 'bg-text-muted/40'}`} />
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Confirm Password <span className="text-accent-primary">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    className={`w-full bg-bg-surface border rounded-xl pl-10 pr-10 py-3 text-sm text-text-primary
                               placeholder-text-muted transition-colors
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50
                               ${confirmPassword.length > 0
                                 ? passwordsMatch
                                   ? 'border-green-500/50 focus:border-green-500'
                                   : 'border-accent-error/50 focus:border-accent-error'
                                 : 'border-border-primary focus:border-accent-primary'
                               }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-[11px] text-accent-error">Passwords do not match.</p>
                )}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <input
                  id="register-terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-accent-primary rounded cursor-pointer flex-shrink-0"
                />
                <label htmlFor="register-terms" className="text-sm text-text-muted leading-snug cursor-pointer select-none">
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

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-secondary
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold text-sm rounded-xl py-3 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
              </button>

              {/* Sign in link */}
              <p className="text-center text-sm text-text-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-accent-primary hover:text-accent-secondary transition-colors font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Terms modal */}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
