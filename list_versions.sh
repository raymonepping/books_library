#!/usr/bin/env bash
set -euo pipefail

# Semver-only table:
#   - Node (Docker Hub)
#   - Node (Alpine variant; semver+alpine tag)
#   - Vault (Docker Hub image)
#   - Couchbase (Enterprise; semver extracted from tag)
# Raw tags section:
#   - MinIO Server (minio/minio)  [date tags]
#   - MinIO Client (minio/mc)     [date tags]
#
# Env:
#   OUTPUT=table|json (default: table)
#   NODE_LTS_MAJOR=20  # optional; pins Node to 20.x.x for both normal and alpine
#   COUCHBASE_PREFER_76=true|false (default: true)
#
# Deps: curl, jq

require() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1" >&2; exit 1; }; }
require curl; require jq

OUTPUT="${OUTPUT:-table}"
NODE_LTS_MAJOR="${NODE_LTS_MAJOR:-}"
COUCHBASE_PREFER_76="${COUCHBASE_PREFER_76:-true}"

fetch_tags() {
  curl -fsSL "https://hub.docker.com/v2/repositories/$1/tags/?page_size=100" | jq -r '.results[].name'
}

latest_semver() {
  grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -Ev '(rc|beta|alpha|test)' \
    | sort -Vr | head -n 1
}

latest_semver_matching() {
  local pat="$1"
  grep -E "$pat" \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -Ev '(rc|beta|alpha|test)' \
    | sort -Vr | head -n 1
}

# ----- Node (semver) -----
get_latest_node() {
  local tags; tags="$(fetch_tags "library/node")"
  if [[ -n "$NODE_LTS_MAJOR" ]]; then
    echo "$tags" | latest_semver_matching "^${NODE_LTS_MAJOR}\.[0-9]+\.[0-9]+$" || true
  else
    echo "$tags" | latest_semver || true
  fi
}

# ----- Node Alpine (semver-alpine) -----
# Examples: 22.8.0-alpine3.19, 20.17.0-alpine
get_latest_node_alpine() {
  local tags; tags="$(fetch_tags "library/node")"
  if [[ -n "$NODE_LTS_MAJOR" ]]; then
    echo "$tags" \
      | grep -E "^${NODE_LTS_MAJOR}\.[0-9]+\.[0-9]+-alpine([0-9.]+)?$" \
      | grep -Ev '(rc|beta|alpha|test)' \
      | sort -Vr \
      | head -n 1 || true
  else
    echo "$tags" \
      | grep -E '^[0-9]+\.[0-9]+\.[0-9]+-alpine([0-9.]+)?$' \
      | grep -Ev '(rc|beta|alpha|test)' \
      | sort -Vr \
      | head -n 1 || true
  fi
}

# ----- Vault (semver) -----
get_latest_vault() {
  fetch_tags "hashicorp/vault" | latest_semver || true
}

# ----- Couchbase (Enterprise → semver) -----
get_latest_couchbase_tag() {
  local tags; tags="$(fetch_tags "couchbase/server")"
  if [[ "$COUCHBASE_PREFER_76" == "true" ]]; then
    local t; t="$(echo "$tags" | grep -E '^enterprise-7\.6\.[0-9]+$' | sort -Vr | head -n 1 || true)"
    [[ -n "$t" ]] && { echo "$t"; return; }
  fi
  echo "$tags" | grep -E '^enterprise-[0-9]+\.[0-9]+\.[0-9]+$' | sort -Vr | head -n 1 || true
}
cb_to_semver() { sed -E 's/^enterprise-([0-9]+\.[0-9]+\.[0-9]+)$/\1/' <<<"${1:-}"; }

# ----- MinIO (date tags → raw only) -----
get_latest_minio_server_tag() {
  fetch_tags "minio/minio" \
    | grep -E '^RELEASE\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$' \
    | sort -Vr | head -n 1 || true
}
get_latest_minio_client_tag() {
  fetch_tags "minio/mc" \
    | grep -E '^RELEASE\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$' \
    | sort -Vr | head -n 1 || true
}

# ----- Compute -----
NODE_VER="$(get_latest_node)"
NODE_ALPINE_VER="$(get_latest_node_alpine)"
VAULT_VER="$(get_latest_vault)"
CB_TAG="$(get_latest_couchbase_tag)"
CB_SEMVER="$(cb_to_semver "$CB_TAG")"
MINIO_SERVER_TAG="$(get_latest_minio_server_tag)"
MINIO_CLIENT_TAG="$(get_latest_minio_client_tag)"

# ----- Output -----
if [[ "$OUTPUT" == "json" ]]; then
  jq -n \
    --arg node "$NODE_VER" \
    --arg node_alpine "$NODE_ALPINE_VER" \
    --arg vault_image "$VAULT_VER" \
    --arg couchbase "$CB_SEMVER" \
    --arg couchbase_tag "$CB_TAG" \
    --arg minio_server_tag "$MINIO_SERVER_TAG" \
    --arg minio_client_tag "$MINIO_CLIENT_TAG" \
    '{node:$node, node_alpine:$node_alpine, vault_image:$vault_image, couchbase:$couchbase, couchbase_tag:$couchbase_tag, minio_server_tag:$minio_server_tag, minio_client_tag:$minio_client_tag}'
else
  line() { printf "%s\n" "────────────────────────────────────────────────────────────"; }
  row()  { printf "│ %-32s │ %-24s │\n" "$1" "$2"; }

  line
  printf "│ %-59s │\n" "LATEST VERSIONS ($(date '+%Y-%m-%d %H:%M:%S'))"
  line
  row "Node.js (image)"              "${NODE_VER:-N/A}"
  row "Node.js (alpine image)"       "${NODE_ALPINE_VER:-N/A}"
  row "Vault (image)"               "${VAULT_VER:-N/A}"
  row "Couchbase (enterprise)"      "${CB_SEMVER:-N/A}"
  line
  echo
  echo "Raw tags (non-semver):"
  [[ -n "$MINIO_SERVER_TAG" ]] && echo "  • MinIO Server: $MINIO_SERVER_TAG"
  [[ -n "$MINIO_CLIENT_TAG" ]] && echo "  • MinIO Client: $MINIO_CLIENT_TAG"
  echo
  [[ -n "$NODE_LTS_MAJOR" ]] && echo "Note: Node pinned to LTS major ${NODE_LTS_MAJOR}."
  [[ "$COUCHBASE_PREFER_76" == "true" ]] && echo "Note: preferring Couchbase enterprise-7.6.x when available."
fi
