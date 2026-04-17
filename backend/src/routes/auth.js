/**
 * Auth Routes
 *
 * POST /api/v1/auth/register      { firstName, lastName, empId, email, password, confirmPassword, termsAccepted }
 * POST /api/v1/auth/login         { email, password, termsAccepted }
 * POST /api/v1/auth/request-otp   { email }  → sends 6-digit OTP (fallback)
 * POST /api/v1/auth/verify-otp    { email, code } → sets JWT cookie (fallback)
 * GET  /api/v1/auth/me            → returns user object from cookie
 * POST /api/v1/auth/logout        → clears cookie
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { storeOtp, verifyOtp } = require('../services/otpStore');
const { sendOtpEmail } = require('../services/emailService');
const { createUser, findUserByEmail, findUserByEmpId, verifyPassword, safeUser } = require('../services/userService');

const router = express.Router();

const ALLOWED_DOMAIN = '@indium.tech';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
// 8 hours — standard office session
const SESSION_DURATION = '8h';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const IS_PROD = process.env.NODE_ENV === 'production';

/** Validate password strength: min 8 chars, 1 uppercase, 1 digit, 1 symbol */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

/** Issue the standard pp_token cookie */
function issueSessionCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_DURATION });
  const secureCookie = process.env.COOKIE_SECURE !== 'false' && IS_PROD;
  res.cookie('pp_token', token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
  return token;
}

/** Generate a cryptographically random 6-digit code */
function generateOtp() {
  // crypto.randomInt is available in Node >= 14.10
  const { randomInt } = require('crypto');
  return String(randomInt(100000, 1000000)); // 100000–999999
}

/** Normalise and validate email */
function validateEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email.endsWith(ALLOWED_DOMAIN)) return null;
  // Basic RFC format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// ── POST /api/v1/auth/register ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const {
    firstName,
    lastName,
    empId,
    email: rawEmail,
    password,
    confirmPassword,
    termsAccepted,
  } = req.body || {};

  // Validate required fields
  const missing = ['firstName', 'lastName', 'empId', 'email', 'password', 'confirmPassword'].filter(
    (f) => !req.body?.[f]?.trim?.()
  );
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields.', fields: missing });
  }

  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must accept the terms and conditions.' });
  }

  const email = validateEmail(rawEmail);
  if (!email) {
    return res.status(400).json({
      error: 'Invalid email',
      details: `Only ${ALLOWED_DOMAIN} addresses are allowed.`,
    });
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  try {
    // Check uniqueness before insert
    const [existingEmail, existingEmpId] = await Promise.all([
      findUserByEmail(email),
      findUserByEmpId(empId),
    ]);

    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (existingEmpId) {
      return res.status(409).json({ error: 'An account with this Employee ID already exists.' });
    }

    await createUser({ firstName, lastName, empId, email, password });
    return res.status(201).json({ message: 'Account created. Please sign in.' });
  } catch (err) {
    // Handle MongoDB duplicate key race condition
    if (err.code === 11000) {
      const field = err.keyPattern?.email ? 'email' : 'Employee ID';
      return res.status(409).json({ error: `An account with this ${field} already exists.` });
    }
    console.error('[Auth] register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/v1/auth/login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email: rawEmail, password, termsAccepted } = req.body || {};

  if (!rawEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must accept the terms and conditions.' });
  }

  const email = validateEmail(rawEmail);
  if (!email) {
    return res.status(400).json({
      error: 'Invalid email',
      details: `Only ${ALLOWED_DOMAIN} addresses are allowed.`,
    });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash) {
      // No password account — suggest OTP fallback
      return res.status(401).json({
        error: 'Invalid email or password.',
        hint: 'If you have not registered yet, please create an account.',
      });
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const payload = safeUser(user);
    issueSessionCookie(res, payload);
    return res.json(payload);
  } catch (err) {
    console.error('[Auth] login error:', err);
    return res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

// ── POST /api/v1/auth/request-otp ──────────────────────────────────────────
router.post('/request-otp', async (req, res) => {
  const email = validateEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({
      error: 'Invalid email',
      details: `Only ${ALLOWED_DOMAIN} addresses are allowed.`,
    });
  }

  const code = generateOtp();

  try {
    await storeOtp(email, code);
  } catch (err) {
    if (err.message === 'RATE_LIMITED') {
      return res.status(429).json({
        error: 'Too many requests',
        details: 'You can request at most 3 codes per 15 minutes. Please wait.',
      });
    }
    console.error('[Auth] storeOtp error:', err);
    return res.status(500).json({ error: 'Failed to generate code. Please try again.' });
  }

  console.log(`[AUTH] OTP for ${email}: ${code}`);
  
  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[Auth] sendOtpEmail error:', err);
    // Bypass email delivery failure for testing/dev environments
    console.warn(`[Auth] Bypass enabled: OTP for ${email} is ${code}`);
  }

  const responseData = { message: 'Code sent. Check your terminal/email.' };
  // Return OTP in response when: not production, or SHOW_OTP_IN_RESPONSE=true (temp workaround for unverified domain)
  if (process.env.NODE_ENV !== 'production' || process.env.SHOW_OTP_IN_RESPONSE === 'true') {
    responseData.otp = code;
  }
  return res.json(responseData);
});

// ── POST /api/v1/auth/verify-otp ───────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const email = validateEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();

  if (!email || !code) {
    return res.status(400).json({ error: 'email and code are required.' });
  }

  const result = await verifyOtp(email, code);

  if (!result.valid) {
    const messages = {
      NOT_FOUND: 'No pending code for this email. Please request a new one.',
      EXPIRED: 'Code has expired. Please request a new one.',
      TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
      WRONG_CODE: 'Incorrect code. Please try again.',
    };
    const statusCodes = { NOT_FOUND: 404, EXPIRED: 410, TOO_MANY_ATTEMPTS: 429, WRONG_CODE: 401 };
    return res.status(statusCodes[result.reason] || 401).json({
      error: messages[result.reason] || 'Invalid code.',
    });
  }

  // Issue JWT
  // If user has a registered account, include richer payload
  let sessionPayload = { email };
  try {
    const userDoc = await findUserByEmail(email);
    if (userDoc) sessionPayload = safeUser(userDoc);
  } catch { /* fallback to email-only if lookup fails */ }

  // COOKIE_SECURE=false overrides the default so HTTP-only VMs work in production mode
  issueSessionCookie(res, sessionPayload);

  return res.json(sessionPayload);
});

// ── GET /api/v1/auth/me ────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const token = req.cookies?.pp_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Try to return the full user object from DB
    try {
      const userDoc = await findUserByEmail(payload.email);
      if (userDoc) return res.json(safeUser(userDoc));
    } catch { /* fall through to JWT payload */ }
    return res.json({ email: payload.email });
  } catch {
    res.clearCookie('pp_token', { path: '/' });
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
});

// ── POST /api/v1/auth/logout ───────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('pp_token', { path: '/' });
  return res.json({ message: 'Signed out.' });
});

module.exports = router;
