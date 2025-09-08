// backend/controllers/flagController.js
const { getClusterCollection } = require('../services/couchbasePool');
const { getFlagSecret } = require('../services/vaultService'); // already exists



// ⚠️ This is the stub the player will complete
const submitFlag = async (req, res) => {
  try {
    const { username } = req.body;

    console.log(`[FLAG] Called with user: ${username}`);

    const { collection } = await getClusterCollection();
    const getResult = await collection.get(username);
    const player = getResult.content;

    const flag = await getFlagSecret();
    player.flag = flag;

    await collection.upsert(username, player);

    console.log(`[FLAG] Stored flag for ${username}: ${flag}`);
    return res.json({ success: true, message: 'Flag stored for validation.' });

  } catch (err) {
    console.error(`[FLAG_CONTROLLER] Error in submitFlag:`, err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

module.exports = { submitFlag };
