const path = require('path');

function loadConfig(modulePath) {
  try {
    const resolvedPath = require.resolve(modulePath);
    delete require.cache[resolvedPath];
    return require(modulePath);
  } catch (err) {
    console.error(`❌ Failed to load config from ${modulePath}:`, err.message);
    return null;
  }
}

module.exports = { loadConfig };
