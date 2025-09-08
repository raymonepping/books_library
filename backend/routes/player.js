const express = require('express');
const router = express.Router();
const cluster = require('../configurations/pool');

const {
  getPlayerState,
  updatePlayerState,
  upsertPlayer,
} = require('../controllers/playerController');

router.get('/test', (req, res) => res.json({ok: true}));

router.get('/:username', (req, res) => getPlayerState(req, res, cluster));
router.put('/:username', (req, res) => updatePlayerState(req, res, cluster));
router.post('/', (req, res) => upsertPlayer(req, res, cluster));

module.exports = router;
