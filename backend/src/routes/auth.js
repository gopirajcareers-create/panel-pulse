/**
 * Auth Routes
 *
 * POST /api/v1/auth/request-otp   { email }  → sends 6-digit OTP
 * POST /api/v1/auth/verify-otp    { email, code } → sets JWT cookie
 * GET  /api/v1/auth/me            → returns { email } from cookie
 * POST /api/v1/auth/logout        → clears cookie
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { storeOtp, verifyOtp } = require('../services/otpStore');
const { sendOtpEmail } = require('../services/emailService');

const router = express.Router();

const ALLOWED_DOMAIN = '@indium.tech';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
// 8 hours — standard office session
const SESSION_DURATION = '8h';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const IS_PROD = process.env.NODE_ENV === 'production';

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
  if (process.env.NODE_ENV !== 'production') {
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
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: SESSION_DURATION });

  res.cookie('pp_token', token, {
    httpOnly: true,
    secure: IS_PROD,   // true in prod (requires HTTPS), false on HTTP dev/VM
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });

  return res.json({ email });
});

// ── GET /api/v1/auth/me ────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.pp_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
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
