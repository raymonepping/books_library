// controllers/playerController.js
const { getClusterCollection } = require('../services/couchbasePool');
const logger = require('../configurations/logger'); // ✅ Import Winston logger

const getPlayerState = async (req, res) => {
  try {
    const username = req.params.username;
    const { collection } = await getClusterCollection();
    const getResult = await collection.get(username);
    const player = getResult.content;

    logger.info(`[PLAYER] Retrieved player: ${username}`);
    res.status(200).json(player);
  } catch (error) {
    logger.error(`[PLAYER] Failed to retrieve player: ${error.message}`);
    res.status(404).json({ error: 'Player not found' });
  }
};

const upsertPlayer = async (req, res) => {
  try {
    const playerDoc = req.body;
    const username = playerDoc.username;
    const { collection } = await getClusterCollection();

    await collection.upsert(username, playerDoc);

    logger.info(`[PLAYER] Created or updated player: ${username}`);
    res.status(200).json({ message: 'Player created/updated', player: playerDoc });
  } catch (error) {
    logger.error(`[PLAYER] Failed to upsert player: ${error.message}`);
    res.status(500).json({ error: 'Failed to create or update player' });
  }
};

module.exports = {
  getPlayerState,
  upsertPlayer,
};