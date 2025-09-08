const { getDynamicCouchbaseCreds } = require('../services/vaultService')
const couchbase = require('couchbase')

const COUCHBASE_HOST = process.env.COUCHBASE_HOST || 'couchbase://nosql'
const BUCKET_NAME = 'game_samples'
const DOC_KEY = 'vault_demo_doc'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * POST /api/couchbase-demo/write
 */
const writeDemoDoc = async (req, res) => {
  try {
    const creds = await getDynamicCouchbaseCreds('readwrite')
    if (!creds) return res.status(500).json({ success: false, message: 'Could not get write credentials from Vault.' })

    await wait(2000)
    const cluster = await couchbase.connect(COUCHBASE_HOST, {
      username: creds.username,
      password: creds.password
    })
    const bucket = cluster.bucket(BUCKET_NAME)
    const collection = bucket.defaultCollection()
    const payload = {
      type: 'ctf_demo',
      challenge: req.body.challenge || 'dynamic-vault-credential',
      written_by: creds.username,
      written_at: new Date().toISOString(),
      payload: { message: 'Congrats, you used Vault to create and access a dynamic Couchbase credential!' }
    }
    await collection.upsert(DOC_KEY, payload)
    await cluster.close()
    return res.json({ success: true, message: 'Document written using Vault dynamic credential.', doc: payload })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/couchbase-demo/read
 */
const readDemoDoc = async (req, res) => {
  try {
    const creds = await getDynamicCouchbaseCreds('readonly')
    if (!creds) return res.status(500).json({ success: false, message: 'Could not get read credentials from Vault.' })

    await wait(2000)
    const cluster = await couchbase.connect(COUCHBASE_HOST, {
      username: creds.username,
      password: creds.password
    })
    const bucket = cluster.bucket(BUCKET_NAME)
    const collection = bucket.defaultCollection()
    const result = await collection.get(DOC_KEY)
    await cluster.close()
    return res.json({ success: true, doc: result.content, reader: creds.username })
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message })
  }
}

module.exports = { writeDemoDoc, readDemoDoc }
