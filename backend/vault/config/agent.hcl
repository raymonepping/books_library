vault {
  address = "http://haproxy:8210"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path                   = "/vault/config/role-id"
      secret_id_file_path                 = "/vault/config/secret-id"
      remove_secret_id_file_after_reading = false
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/.token"
    }
  }
}

template {
  source      = "/vault/templates/db.env.tpl"
  destination = "/vault/secrets/db.env"
  perms       = "0640"
}

template {
  source      = "/vault/templates/external.env.tpl"
  destination = "/vault/secrets/external.env"
  perms       = "0640"
}
