/**
 * OTP Store — MongoDB-backed with TTL index
 *
 * Collection: otp_codes
 * Each document expires automatically via the TTL index on `expiresAt`.
 *
 * Rate limit: max 3 OTP requests per email per 15 minutes (enforced here).
 */

const { getDb } = require('./mongoClient');

const OTP_TTL_SECONDS = 10 * 60;          // OTP valid for 10 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60_000; // 15-minute window
const RATE_LIMIT_MAX = 3;                  // max OTP requests per window

let indexEnsured = false;

async function getCollection() {
  const db = await getDb();
  const col = db.collection('otp_codes');

  // Create TTL + lookup indexes once per process lifecycle
  if (!indexEnsured) {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await col.createIndex({ email: 1 });
    indexEnsured = true;
  }

  return col;
}

/**
 * Store a new OTP for an email, enforcing rate limits.
 * Deletes any previous pending OTP for the same email.
 * @throws {Error} with message 'RATE_LIMITED' if too many requests
 */
async function storeOtp(email, code) {
  const col = await getCollection();
  const now = new Date();

  // Rate limit check: count recent requests in the window
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await col.countDocuments({
    email,
    createdAt: { $gte: windowStart },
  });

  if (recentCount >= RATE_LIMIT_MAX) {
    throw new Error('RATE_LIMITED');
  }

  // Delete existing pending OTPs for this email
  await col.deleteMany({ email });

  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  await col.insertOne({
    email,
    code,
    createdAt: now,
    expiresAt,
    attempts: 0,
  });
}

/**
 * Verify an OTP for an email.
 * Increments attempt counter; invalidates after 5 wrong attempts.
 * Deletes the document on success (single-use).
 * @returns {{ valid: boolean, reason?: string }}
 */
async function verifyOtp(email, code) {
  const col = await getCollection();
  const doc = await col.findOne({ email });

  if (!doc) return { valid: false, reason: 'NOT_FOUND' };
  if (new Date() > doc.expiresAt) {
    await col.deleteOne({ email });
    return { valid: false, reason: 'EXPIRED' };
  }
  if (doc.attempts >= 5) {
    await col.deleteOne({ email });
    return { valid: false, reason: 'TOO_MANY_ATTEMPTS' };
  }
  if (doc.code !== code) {
    await col.updateOne({ email }, { $inc: { attempts: 1 } });
    return { valid: false, reason: 'WRONG_CODE' };
  }

  // Success — delete so it can't be reused
  await col.deleteOne({ email });
  return { valid: true };
}

module.exports = { storeOtp, verifyOtp };
