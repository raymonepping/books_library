# policy.hcl — Vault policy for the Bibliotheek backend AppRole.
# Grants read-only access to dynamic Couchbase credentials and the
# Google Books API key. Token self-renewal is allowed so Vault Agent
# can keep the token alive without re-authenticating.

path "database/creds/library-backend" {
  capabilities = ["read"]
}

path "kv/data/library/external" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
