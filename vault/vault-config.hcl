ui            = true
disable_mlock = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

# FILE storage (local dev) -> use the mounted volume path
storage "file" {
  path = "/vault/file"
}

# Persist audit log in the same mounted volume
audit "file" {
  file_path = "/vault/file/vault_audit.log"
}

# Helpful addresses inside docker network
api_addr     = "http://vault:8200"
cluster_addr = "http://vault:8201"
