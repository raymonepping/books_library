pid_file  = "/vault/secrets/vault-agent.pid"
log_level = "info"

vault {
  address = "${VAULT_ADDR}"
}

auto_auth {
  method "approle" {
    config = {
      role_id_file_path   = "/vault/approle/role_id"
      secret_id_file_path = "/vault/approle/secret_id"
      remove_secret_id_file_after_reading = false
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/token"
      mode = 0640
    }
  }
}

cache {
  use_auto_auth_token = true
}

# Dev listener. Do not expose without TLS in prod.
listener "tcp" {
  address     = "0.0.0.0:8201"
  tls_disable = true
}

# KV v2 example: secret/data/app/backend
template {
  source      = "/vault/templates/app.env.ctmpl"
  destination = "/vault/secrets/app.env"
  command     = "sh -c 'chmod 0640 /vault/secrets/app.env'"
  perms       = "0640"
}
