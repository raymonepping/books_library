#!/usr/bin/env bash
set -euo pipefail

# --- Config (override via env if desired) ---
VAULT_CONTAINER="${VAULT_CONTAINER:-vault_library}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
INIT_OUT_PATH="${INIT_OUT_PATH:-ops/vault/INIT.out}"

# MinIO/Couchbase-related (adjust names as you like)
KV_MOUNT_PATH="${KV_MOUNT_PATH:-kv}"                         # will be kv-v2
TRANSIT_MOUNT_PATH="${TRANSIT_MOUNT_PATH:-transit}"
DB_MOUNT_PATH="${DB_MOUNT_PATH:-database}"
TRANSIT_KEY_NAME="${TRANSIT_KEY_NAME:-couchbase_key}"

# Audit file must be on a mounted, writable path (matches your HCL)
AUDIT_PATH="file/"
AUDIT_FILE="/vault/file/vault_audit.log"

# --- Pretty printing ---
print() {
  local level="$1"; shift
  local msg="$*"
  case "$level" in
    INFO)    printf "\033[1;34m[INFO]\033[0m %s\n" "$msg" ;;
    SUCCESS) printf "\033[1;32m[SUCCESS]\033[0m %s\n" "$msg" ;;
    WARN)    printf "\033[1;33m[WARN]\033[0m %s\n" "$msg" ;;
    ERROR)   printf "\033[1;31m[ERROR]\033[0m %s\n" "$msg" ;;
    *)       printf "[%s] %s\n" "$level" "$msg" ;;
  esac
}

# --- Helpers ---
vx() { docker exec -e VAULT_ADDR="$VAULT_ADDR" "$VAULT_CONTAINER" vault "$@"; }
v_out() { docker exec -e VAULT_ADDR="$VAULT_ADDR" "$VAULT_CONTAINER" sh -lc "$*"; }

need_file() {
  [[ -f "$1" ]] || { print ERROR "Missing file: $1"; exit 1; }
}

# --- Read unseal key(s) and token ---
UNSEAL_KEYS=()
ROOT_TOKEN="${VAULT_TOKEN:-}"

if [[ -z "${UNSEAL_KEYS[*]:-}" || -z "$ROOT_TOKEN" ]]; then
  if [[ -f "$INIT_OUT_PATH" ]]; then
    print INFO "Reading unseal key(s) and root token from $INIT_OUT_PATH"
    mapfile -t UNSEAL_KEYS < <(grep -E 'Unseal Key [0-9]+:' "$INIT_OUT_PATH" | awk '{print $4}')
    ROOT_TOKEN="${ROOT_TOKEN:-$(grep -E 'Initial Root Token:' "$INIT_OUT_PATH" | awk '{print $4}')}"
  else
    print ERROR "No UNSEAL_KEYS/VAULT_TOKEN provided and $INIT_OUT_PATH not found."
    print INFO  "Run 'vault operator init' and save output to $INIT_OUT_PATH first."
    exit 1
  fi
fi

if [[ ${#UNSEAL_KEYS[@]} -eq 0 ]]; then
  print ERROR "No unseal keys found."
  exit 1
fi
if [[ -z "$ROOT_TOKEN" ]]; then
  print ERROR "No root token found."
  exit 1
fi

# --- Unseal (idempotent; stop once unsealed) ---
print INFO "Unsealing Vault (container: $VAULT_CONTAINER, addr: $VAULT_ADDR)..."
for key in "${UNSEAL_KEYS[@]}"; do
  # Attempt unseal; ignore errors (wrong key or already applied)
  if vx operator unseal "$key" >/dev/null 2>&1; then
    :
  fi
  # Check sealed status
  sealed="$(vx status -format=json | jq -r '.sealed' || echo true)"
  if [[ "$sealed" == "false" ]]; then
    print SUCCESS "Vault is unsealed."
    break
  fi
done

sealed="$(vx status -format=json | jq -r '.sealed' || echo true)"
if [[ "$sealed" != "false" ]]; then
  print ERROR "Vault appears to still be sealed. Verify keys and VAULT_ADDR."
  exit 1
fi

# --- Login ---
print INFO "Logging in with root token..."
if ! v_out "VAULT_TOKEN='$ROOT_TOKEN' vault token lookup >/dev/null 2>&1"; then
  print ERROR "Failed to authenticate with provided root token."
  exit 1
fi
print SUCCESS "Authenticated."

# --- Enable mounts (idempotent) ---
print INFO "Ensuring secret engines are enabled..."

# KV v2
if v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets list -format=json" | jq -e --arg p "${KV_MOUNT_PATH}/" 'has($p)' >/dev/null; then
  print SUCCESS "KV already mounted at '${KV_MOUNT_PATH}/'."
else
  v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets enable -version=2 -path='${KV_MOUNT_PATH}' kv" >/dev/null
  print SUCCESS "Enabled KV v2 at '${KV_MOUNT_PATH}/'."
fi

# transit
if v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets list -format=json" | jq -e --arg p "${TRANSIT_MOUNT_PATH}/" 'has($p)' >/dev/null; then
  print SUCCESS "Transit already mounted at '${TRANSIT_MOUNT_PATH}/'."
else
  v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets enable -path='${TRANSIT_MOUNT_PATH}' transit" >/dev/null
  print SUCCESS "Enabled Transit at '${TRANSIT_MOUNT_PATH}/'."
fi

# database
if v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets list -format=json" | jq -e --arg p "${DB_MOUNT_PATH}/" 'has($p)' >/dev/null; then
  print SUCCESS "Database already mounted at '${DB_MOUNT_PATH}/'."
else
  v_out "VAULT_TOKEN='$ROOT_TOKEN' vault secrets enable -path='${DB_MOUNT_PATH}' database" >/dev/null
  print SUCCESS "Enabled Database at '${DB_MOUNT_PATH}/'."
fi

# --- Transit key (idempotent) ---
print INFO "Ensuring transit key '${TRANSIT_KEY_NAME}' exists..."
if v_out "VAULT_TOKEN='$ROOT_TOKEN' vault read ${TRANSIT_MOUNT_PATH}/keys/${TRANSIT_KEY_NAME} >/dev/null 2>&1"; then
  print SUCCESS "Transit key already exists."
else
  v_out "VAULT_TOKEN='$ROOT_TOKEN' vault write -f ${TRANSIT_MOUNT_PATH}/keys/${TRANSIT_KEY_NAME}" >/dev/null
  print SUCCESS "Transit key created."
fi

# --- Audit device (idempotent) ---
print INFO "Ensuring audit logging enabled at '${AUDIT_PATH}' → ${AUDIT_FILE} ..."
AUDIT_LIST_JSON="$(v_out "VAULT_TOKEN='$ROOT_TOKEN' vault audit list -format=json" || echo '{}')"
if jq -e --arg p "$AUDIT_PATH" 'has($p)' <<<"$AUDIT_LIST_JSON" >/dev/null; then
  print SUCCESS "Audit device already enabled at '${AUDIT_PATH}'."
else
  # Use the same path your HCL uses (/vault/file)
  v_out "VAULT_TOKEN='$ROOT_TOKEN' vault audit enable file file_path='${AUDIT_FILE}'" >/dev/null
  print SUCCESS "Audit logging enabled at '${AUDIT_FILE}'."
fi

print SUCCESS "Vault unseal & bootstrap complete."
