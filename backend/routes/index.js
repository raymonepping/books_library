const express = require('express');
const router = express.Router()

// Import route modules
const healthRoutes = require('./health')
const pingRoutes = require('./ping')
const couchbaseSeedRoutes = require('./couchbaseSeed')
const authorRoutes = require('./authorRoutes');

// Use the route modules
router.use('/health', healthRoutes)
router.use('/ping', pingRoutes)
router.use('/couchbase-demo', couchbaseSeedRoutes)
router.use('/authors', authorRoutes);

module.exports = router
