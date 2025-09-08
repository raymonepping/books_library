module.exports = {
  connectionString: process.env.COUCHBASE_CONNSTR || "couchbase://localhost",
  username: process.env.COUCHBASE_USERNAME || "Administrator",
  password: process.env.COUCHBASE_PASSWORD || "p^f$bnCjVqtzMZ7c23!Y",
  bucketName: process.env.COUCHBASE_BUCKET || "demo",
  scopeName: process.env.COUCHBASE_SCOPE || "_default",
  collectionName: process.env.COUCHBASE_COLLECTION || "_default",
};
