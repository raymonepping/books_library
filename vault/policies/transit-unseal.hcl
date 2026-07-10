path "transit/encrypt/autounseal" {
  capabilities = ["update"]
}
path "transit/decrypt/autounseal" {
  capabilities = ["update"]
}
# (Optional but nice) allow reading key info
path "transit/keys/autounseal" {
  capabilities = ["read"]
}
