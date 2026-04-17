/**
 * Azure AD SSO Auth Routes
 *
 * GET  /api/v1/auth/azure/login     → Redirects browser to Microsoft login page
 * GET  /api/v1/auth/azure/callback  → Microsoft redirects back here with auth code
 * GET  /api/v1/auth/azure/logout    → Clears session and redirects to Microsoft logout
 */

const express = require('express');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const jwt = require('jsonwebtoken');

const router = express.Router();

const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_REDIRECT_URI  = process.env.AZURE_REDIRECT_URI || 'https://10.10.142.91/api/v1/auth/azure/callback';
const JWT_SECRET          = process.env.JWT_SECRET || 'change-me-in-production';
const ALLOWED_DOMAIN      = '@indium.tech';
const SESSION_DURATION    = '8h';
const COOKIE_MAX_AGE_MS   = 8 * 60 * 60 * 1000;
const IS_PROD             = process.env.NODE_ENV === 'production';

// Validate Azure config on startup
if (!AZURE_CLIENT_ID || !AZURE_TENANT_ID || !AZURE_CLIENT_SECRET) {
  console.warn('⚠️  Azure SSO not fully configured. Set AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET in .env');
}

// MSAL Confidential Client (server-side OAuth flow)
function getMsalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId:     AZURE_CLIENT_ID,
      clientSecret: AZURE_CLIENT_SECRET,
      authority:    `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    },
  });
}

/** Issue the same pp_token cookie used by the existing auth system */
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
}

/**
 * GET /api/v1/auth/azure/login
 * Redirects the browser to the Microsoft Azure login page.
 */
router.get('/login', async (req, res) => {
  if (!AZURE_CLIENT_ID || !AZURE_TENANT_ID || !AZURE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Azure SSO is not configured on the server.' });
  }

  try {
    const msalClient = getMsalClient();
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: AZURE_REDIRECT_URI,
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('[AzureSSO] Failed to build auth URL:', err.message);
    res.redirect('/login?error=sso_init_failed');
  }
});

/**
 * GET /api/v1/auth/azure/callback
 * Microsoft redirects here after the user logs in.
 * Exchanges the `code` for tokens, extracts user info, and issues a session cookie.
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('[AzureSSO] Callback error from Azure:', error, error_description);
    return res.redirect('/login?error=sso_denied');
  }

  if (!code) {
    return res.redirect('/login?error=sso_no_code');
  }

  try {
    const msalClient = getMsalClient();

    // Exchange auth code for tokens
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: AZURE_REDIRECT_URI,
    });

    const account = tokenResponse.account;
    const email   = (account?.username || '').toLowerCase();

    // Enforce @indium.tech domain
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      console.warn(`[AzureSSO] Rejected non-indium login attempt: ${email}`);
      return res.redirect('/login?error=unauthorized_domain');
    }

    const firstName = account?.name?.split(' ')[0] || '';
    const lastName  = account?.name?.split(' ').slice(1).join(' ') || '';

    // Issue the standard pp_token cookie (same as password/OTP login)
    issueSessionCookie(res, {
      email,
      firstName,
      lastName,
      authMethod: 'azure_sso',
    });

    console.log(`[AzureSSO] ✓ User logged in via SSO: ${email}`);

    // Redirect to main app
    res.redirect('/');
  } catch (err) {
    console.error('[AzureSSO] Token exchange failed:', err.message);
    res.redirect('/login?error=sso_token_failed');
  }
});

/**
 * GET /api/v1/auth/azure/logout
 * Clears the local session cookie and redirects to Microsoft logout.
 */
router.get('/logout', (req, res) => {
  res.clearCookie('pp_token', { path: '/' });

  if (AZURE_TENANT_ID) {
    const origin = `${req.protocol}://${req.get('host')}`;
    const msLogoutUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/logout`
      + `?post_logout_redirect_uri=${encodeURIComponent(origin + '/login')}`;
    return res.redirect(msLogoutUrl);
  }

  res.redirect('/login');
});

module.exports = router;
