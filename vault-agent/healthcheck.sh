#!/usr/bin/env bash
set -euo pipefail

TOKEN_FILE="${TOKEN_FILE:-/vault/secrets/token}"
VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
ROLE="${VAULT_DB_ROLE:-readwrite}"

# token file must exist and be non-empty
[[ -s "$TOKEN_FILE" ]] || { echo "token file missing/empty"; exit 1; }

# Validate token can access DB creds (policy in place)
TOKEN=$(cat "$TOKEN_FILE")
curl -fsS -H "X-Vault-Token: $TOKEN" "$VAULT_ADDR/v1/database/creds/$ROLE" >/dev/null \
  || { echo "token cannot read db creds"; exit 1; }

echo "ok"
