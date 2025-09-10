const { getBucket } = require('../services/couchbasePool');

const BUCKET = 'library';
const SCOPE = 'books';
const COLLECTION = 'authors';

// GET /api/authors/:id   (id like "jo-nesbo"; key is author::<id>)
async function getAuthor(req, res) {
  const id = req.params.id;
  const key = `author::${id}`;

  try {
    const bucket = getBucket();
    const doc = await bucket
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

// GET /api/authors   (list authors; uses primary index on the collection)
async function listAuthors(req, res) {
  try {
    const bucket = getBucket();
    const scope = bucket.scope(SCOPE);

    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    // Scoped N1QL: FROM uses just the collection name within the scope
    const q = `
      SELECT a.*
      FROM \`${COLLECTION}\` a
      WHERE a.type = "author"
      ORDER BY a.name ASC
      LIMIT $limit OFFSET $offset
    `;

    const { rows } = await scope.query(q, { parameters: { limit, offset } });
    return res.json({ items: rows, pagination: { limit, offset } });
  } catch (err) {
    console.error('[listAuthors] error:', err);
    return res.status(500).json({ error: 'Query error' });
  }
}

module.exports = { getAuthor, listAuthors };
