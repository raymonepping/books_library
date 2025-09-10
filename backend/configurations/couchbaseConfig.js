module.exports = {
  connectionString: process.env.COUCHBASE_CONNSTR || "couchbase://couchbase_library",
  username: process.env.COUCHBASE_USERNAME || "Administrator",
  password: process.env.COUCHBASE_PASSWORD || "password",
  bucketName: process.env.COUCHBASE_BUCKET || "library",
  scopeName: process.env.COUCHBASE_SCOPE || "_default",
  collectionName: process.env.COUCHBASE_COLLECTION || "_default",
};
