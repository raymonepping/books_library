// configurations/flagConfig.js
const { getFlagSecret } = require('../services/vaultService');

const loadFlag = async () => {
  try {
    const flag = await getFlagSecret();
    return flag;
  } catch (err) {
    console.error(`[FLAG_CONFIG] Could not fetch flag: ${err.message}`);
    return null;
  }
};

module.exports = { loadFlag };
