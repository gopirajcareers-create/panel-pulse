/**
 * requireAuth middleware
 * Reads the pp_token httpOnly cookie, verifies the JWT, and attaches req.user.
 * Returns 401 JSON if missing or invalid — the frontend handles the redirect to /login.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function requireAuth(req, res, next) {
  const token = req.cookies?.pp_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { email: payload.email };
    next();
  } catch {
    res.clearCookie('pp_token', { path: '/' });
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

module.exports = requireAuth;
