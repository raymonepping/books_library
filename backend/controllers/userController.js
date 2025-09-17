const couchbase = require('couchbase');
const { getBucket } = require('../services/couchbasePool');

const SCOPE = 'credentials';
const COLLECTION = 'users';
const keyFor = (email) => `user::${email.toLowerCase()}`;

async function getByEmail(email) {
  const col = getBucket().scope(SCOPE).collection(COLLECTION);
  try {
    const { content } = await col.get(keyFor(email));
    return content;
  } catch (e) {
    if (e instanceof couchbase.DocumentNotFoundError) return null;
    if (e?.cause?.code === 101) return null;
    if (e?.context?.status_code === 1) return null;
    return null;
  }
}

async function upsert(user) {
  const col = getBucket().scope(SCOPE).collection(COLLECTION);
  if (!user.created_at) user.created_at = new Date().toISOString();
  user.updated_at = new Date().toISOString();
  await col.upsert(keyFor(user.email), user);
  return user;
}

async function approve(email) {
  const user = await getByEmail(email);
  if (!user) return null;
  user.status = 'active';
  await upsert(user);
  return user;
}

/** List users by status (pending|active|disabled) with pagination */
async function listByStatus(status = 'pending', limit = 50, offset = 0) {
  // NOTE: scope.query allows using the collection name directly inside the scope.
  // Make sure your query service is up in Couchbase.
  const scope = getBucket().scope(SCOPE);
  const q = `
    SELECT u.*
    FROM \`${COLLECTION}\` u
    WHERE u.type = "user" AND u.status = $status
    ORDER BY u.created_at DESC
    LIMIT $limit OFFSET $offset
  `;
  const { rows } = await scope.query(q, { parameters: { status, limit, offset } });
  return rows;
}

/** Replace roles array */
async function setRoles(email, roles = []) {
  const user = await getByEmail(email);
  if (!user) return null;
  user.roles = Array.isArray(roles) ? roles : [];
  await upsert(user);
  return user;
}

/** Change status */
async function setStatus(email, status) {
  const user = await getByEmail(email);
  if (!user) return null;
  user.status = status;
  await upsert(user);
  return user;
}

/** Delete user */
async function remove(email) {
  const col = getBucket().scope(SCOPE).collection(COLLECTION);
  try {
    await col.remove(keyFor(email));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getByEmail,
  upsert,
  approve,
  listByStatus,
  setRoles,
  setStatus,
  remove,
};