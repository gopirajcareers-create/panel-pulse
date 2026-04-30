/**
 * User Service
 * Handles all user CRUD and password operations for MongoDB-backed auth.
 */

const bcrypt = require('bcrypt');
const { getDb } = require('./mongoClient');

const BCRYPT_ROUNDS = 12;
const COLLECTION = 'users';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

/**
 * Create a new user with a hashed password.
 * Role defaults to 'Admin' server-side — never accept from client.
 */
async function createUser({ firstName, lastName, empId, email, password }) {
  const c = await col();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();
  const doc = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    empId: empId.trim().toUpperCase(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: 'Admin',
    termsAccepted: true,
    termsVersion: '1.0',
    termsAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const result = await c.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/** Find a user by email (case-insensitive via stored lowercase). */
async function findUserByEmail(email) {
  const c = await col();
  return c.findOne({ email: email.trim().toLowerCase() });
}

/** Find a user by employee ID (stored uppercase). */
async function findUserByEmpId(empId) {
  const c = await col();
  return c.findOne({ empId: empId.trim().toUpperCase() });
}

/** Verify a plaintext password against a stored hash. */
async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

/** Public user shape — never include passwordHash in API responses. */
function safeUser(doc) {
  return {
    email: doc.email,
    firstName: doc.firstName,
    lastName: doc.lastName,
    empId: doc.empId,
    role: doc.role,
  };
}

module.exports = { createUser, findUserByEmail, findUserByEmpId, verifyPassword, safeUser };
