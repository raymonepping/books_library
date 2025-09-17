const { getBucket } = require('../services/couchbasePool');

const BUCKET = 'library';
const SCOPE = 'books';
const COLLECTION = 'book'; // <— collection name is `book`

// GET /api/books/:id   (id like "the-snowman"; key is book::<id>)
async function getBook(req, res) {
  const id = req.params.id;
  const key = `book::${id}`;

  try {
    const bucket = getBucket();
    const doc = await bucket
      .scope(SCOPE)
      .collection(COLLECTION)
      .get(key);

    return res.json(doc.content);
  } catch (err) {
    if (err?.context?.first_error_code === 13 /* KeyNotFound */) {
      return res.status(404).json({ error: 'Book not found', id });
    }
    console.error('[getBook] error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
}

// GET /api/books   (list books; uses primary index on the collection)
async function listBooks(req, res) {
  try {
    const bucket = getBucket();
    const scope = bucket.scope(SCOPE);

    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    // Scoped N1QL: FROM uses just the collection name when using scope.query()
    const q = `
      SELECT b.*
      FROM \`${COLLECTION}\` b
      WHERE b.type = "book"
      ORDER BY b.title ASC
      LIMIT $limit OFFSET $offset
    `;

    const { rows } = await scope.query(q, { parameters: { limit, offset } });
    return res.json({ items: rows, pagination: { limit, offset } });
  } catch (err) {
    console.error('[listBooks] error:', err);
    return res.status(500).json({ error: 'Query error' });
  }
}

module.exports = { getBook, listBooks };
