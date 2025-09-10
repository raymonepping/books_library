// Assumes you have a Couchbase cluster helper that returns a connected Cluster
// e.g. services/couchbase.js exporting getCluster()
const { getCluster } = require('../services/couchbasePool');

const BUCKET = 'library';
const SCOPE = 'books';
const COLLECTION = 'authors';

// GET /api/authors/:id   (id like "jo-nesbo"; key is author::<id>)
async function getAuthor(req, res) {
  const id = req.params.id;
  const key = `author::${id}`;

  try {
    const cluster = await getCluster();
    const doc = await cluster
      .bucket(BUCKET)
      .scope(SCOPE)
      .collection(COLLECTION)
      .get(key);

    return res.json(doc.content);
  } catch (err) {
    if (err?.context?.first_error_code === 13 /* KeyNotFound */) {
      return res.status(404).json({ error: 'Author not found', id });
    }
    console.error('[getAuthor] error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
}

// GET /api/authors   (optional: list authors; uses your PRIMARY index)
async function listAuthors(req, res) {
  try {
    const cluster = await getCluster();
    const q = `
      SELECT a.*
      FROM \`${BUCKET}\`.\`${SCOPE}\`.\`${COLLECTION}\` a
      WHERE a.type = "author"
      ORDER BY a.name ASC
      LIMIT $limit OFFSET $offset
    `;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const { rows } = await cluster.query(q, { parameters: { limit, offset } });
    return res.json({ items: rows, pagination: { limit, offset } });
  } catch (err) {
    console.error('[listAuthors] error:', err);
    return res.status(500).json({ error: 'Query error' });
  }
}

module.exports = { getAuthor, listAuthors };
