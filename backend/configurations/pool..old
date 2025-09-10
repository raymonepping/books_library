// ./configurations/pool.js
const couchbase = require('couchbase');

const connectToCouchbase = async (config) => {
  try {
    // Connect to Couchbase cluster
    const cluster = await couchbase.connect(config.endpoint, {
      username: config.username,
      password: config.password,
    });

    // Get bucket and scope
    const bucket = cluster.bucket(config.bucket);
    const scope = bucket.scope(config.scope);
    const collection = scope.collection(config.collection);

    console.log('Couchbase connected successfully');
    
    return { bucket, scope, collection };
  } catch (error) {
    console.error('Couchbase connection failed:', error);
    throw error;
  }
};

module.exports = { connectToCouchbase };
