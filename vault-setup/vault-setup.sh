#!/usr/bin/env bash
# vault-setup.sh — one-time Vault cluster configuration for Bibliotheek.
#
# Prerequisites:
#   - vault CLI installed and authenticated as an admin token
#   - VAULT_ADDR exported (defaults to http://haproxy:8210)
#   - COUCHBASE_ADMIN_PASSWORD exported (Vault's own service account on CB)
#   - GOOGLE_BOOKS_API_KEY exported
#
# Safe to inspect and run section by section.

set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://haproxy:8210}"
export VAULT_ADDR

: "${COUCHBASE_ADMIN_PASSWORD:?COUCHBASE_ADMIN_PASSWORD must be set}"
: "${GOOGLE_BOOKS_API_KEY:?GOOGLE_BOOKS_API_KEY must be set}"

echo "==> Vault address: ${VAULT_ADDR}"
echo "==> Checking vault status..."
vault status

# ------------------------------------------------------------------------------
# 1. Database secrets engine
# ------------------------------------------------------------------------------
echo ""
echo "==> [1/7] Enabling database secrets engine..."
if vault secrets list | grep -q '^database/'; then
  echo "    already enabled — skipping"
else
  vault secrets enable database
fi

# ------------------------------------------------------------------------------
# 2. Couchbase database plugin configuration
#    Uses the community couchbase-database-plugin shipped with Vault Enterprise.
# ------------------------------------------------------------------------------
echo ""
echo "==> [2/7] Configuring Couchbase plugin (library-couchbase)..."
vault write database/config/library-couchbase \
  plugin_name=couchbase-database-plugin \
  hosts="couchbase://couchbase" \
  username="vault-admin" \
  password="${COUCHBASE_ADMIN_PASSWORD}" \
  bucket_name="library" \
  allowed_roles="library-backend"

# ------------------------------------------------------------------------------
# 3. Database role — 1h TTL, bucket_full_access
# ------------------------------------------------------------------------------
echo ""
echo "==> [3/7] Creating database role library-backend..."
vault write database/roles/library-backend \
  db_name=library-couchbase \
  creation_statements='{"roles":[{"role":"bucket_full_access","bucket_name":"library"}]}' \
  default_ttl="1h" \
  max_ttl="24h"

# ------------------------------------------------------------------------------
# 4. KV v2 for external API keys
# ------------------------------------------------------------------------------
echo ""
echo "==> [4/7] Enabling KV v2 secrets engine at kv/..."
if vault secrets list | grep -q '^kv/'; then
  echo "    already enabled — skipping"
else
  vault secrets enable -path=kv kv-v2
fi

echo "    Writing Google Books API key to kv/library/external..."
# vault kv put hits sys/internal/ui which is ACL-restricted on some
# Vault Enterprise setups; use the REST endpoint directly instead.
curl -sf \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST \
  "${VAULT_ADDR}/v1/kv/data/library/external" \
  --data "{\"data\":{\"google_books_api_key\":\"${GOOGLE_BOOKS_API_KEY}\"}}"

# ------------------------------------------------------------------------------
# 5. Policy
# ------------------------------------------------------------------------------
echo ""
echo "==> [5/7] Writing policy library-backend..."
# vault policy write hits sys/internal/ui which is ACL-restricted on some
# Vault Enterprise setups; use the REST endpoint directly instead.
POLICY_HCL=$(cat "$(dirname "$0")/policy.hcl")
curl -sf \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -H "Content-Type: application/json" \
  -X PUT \
  "${VAULT_ADDR}/v1/sys/policies/acl/library-backend" \
  --data "{\"policy\": $(printf '%s' "${POLICY_HCL}" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}"

# ------------------------------------------------------------------------------
# 6. AppRole auth
# ------------------------------------------------------------------------------
echo ""
echo "==> [6/7] Enabling and configuring AppRole..."
if vault auth list | grep -q '^approle/'; then
  echo "    already enabled — skipping"
else
  vault auth enable approle
fi

vault write auth/approle/role/library-backend \
  token_policies="library-backend" \
  token_ttl="1h" \
  token_max_ttl="24h" \
  secret_id_ttl="0"   # non-expiring secret-id; rotate manually

# ------------------------------------------------------------------------------
# 7. Output credentials for bootstrap
# ------------------------------------------------------------------------------
echo ""
echo "==> [7/7] AppRole credentials — write these to your secrets manager:"
echo ""
echo "--- ROLE_ID ---"
vault read -field=role_id auth/approle/role/library-backend/role-id

echo ""
echo "--- SECRET_ID (new) ---"
# vault write hits sys/internal/ui which is ACL-restricted on some
# Vault Enterprise setups; use the REST endpoint directly instead.
curl -sf \
  -H "X-Vault-Token: ${VAULT_TOKEN}" \
  -X POST \
  "${VAULT_ADDR}/v1/auth/approle/role/library-backend/secret-id" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['secret_id'])"

echo ""
echo "Done. Copy the role-id and secret-id into your deploy bootstrap:"
echo "  echo <role-id>   > /vault/config/role-id"
echo "  echo <secret-id> > /vault/config/secret-id"
