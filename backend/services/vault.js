const vault = require('node-vault');
const logger = require("../configurations/logger");

class VaultService {
  constructor() {
    this.client = vault({
      endpoint: process.env.VAULT_ADDR || 'http://vault-service.vault.svc.cluster.local:8200',
      token: process.env.VAULT_TOKEN || '',
    });
  }

  async fetchDynamicCredentials(path) {
    try {
      const response = await this.client.read(path);
      const { lease_id, lease_duration, data: credentials } = response;

      logger.debug('Fetched dynamic credentials:', credentials);
      logger.info(`Lease ID: ${lease_id}, Lease Duration: ${lease_duration}s`);

      return credentials; // Return username and password
    } catch (error) {
      logger.error(`Error fetching dynamic credentials from Vault at path "${path}":`, error.message);
      throw error;
    }
  }
}

module.exports = new VaultService();
