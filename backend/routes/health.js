const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Vault CTF backend running!' })
})

module.exports = router
