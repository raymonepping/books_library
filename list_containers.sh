#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./list_containers.sh [sort=name|status|label] [--prune]
#
# Lists ONLY containers from the docker-compose.yml next to this script.
# Supports running + stopped (exited->stopped), colored status, sorting.
# Works with Compose NDJSON output (one JSON object per line).

usage() {
  echo "Usage: $0 [sort=<name|status|label>] [--prune]"
  exit 1
}

SORT_BY=name
PRUNE=false
for arg in "$@"; do
  case "$arg" in
    sort=name|sort=status|sort=label) SORT_BY="${arg#*=}";;
    --prune) PRUNE=true;;
    *) usage;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
[[ -f "$COMPOSE_FILE" ]] || { echo "❌ No docker-compose.yml found: $COMPOSE_FILE" >&2; exit 1; }

[[ "$PRUNE" == true ]] && docker image prune -f >/dev/null || true

# Compose project name (used by labels). Default to folder name; allow override.
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$SCRIPT_DIR")}"

# Try NDJSON from compose; fallback to classic inspect-by-project if needed.
if docker compose -f "$COMPOSE_FILE" ps -a --format json >/dev/null 2>&1; then
  ndjson="$(docker compose -f "$COMPOSE_FILE" ps -a --format json || true)"
else
  ndjson=""
fi

if [[ -n "$ndjson" ]]; then
  # Parse NDJSON → array; turn Labels string into an object; extract fields
  rows="$(
    jq -rs '
      # input is multiple JSON objects, one per line; -s slurps them into an array
      map(
        . as $c
        | {
            name: ($c.Name // $c.Service // "unknown"),
            status: (($c.State // "unknown") | gsub("^exited$"; "stopped")),
            labelmap:
              ( ($c.Labels // "")
                | split(",")
                | map(select(length>0))
                | map( split("=") | {(.[0]) : ( (.[1:] | join("=")) // "" )} )
                | add
              )
          }
        | {
            name: .name,
            status: .status,
            label: (.labelmap.category // "")
          }
      )
      | map([.name, .status, .label] | @tsv)
      | .[]
    ' <<<"$ndjson"
  )"
else
  # Fallback by compose project label: inspect containers and build rows
  mapfile -t IDS < <(docker ps -a --filter "label=com.docker.compose.project=$PROJECT_NAME" --format '{{.ID}}')
  if [[ ${#IDS[@]} -eq 0 ]]; then
    echo "ℹ️  No containers found for project: $PROJECT_NAME"
    exit 0
  fi
  rows="$(
    printf '%s\0' "${IDS[@]}" | xargs -0 -n1 docker inspect \
    | jq -s '
        map({
          name: .[0].Name|ltrimstr("/"),
          status: (.[0].State.Status | gsub("^exited$"; "stopped")),
          label: (.[0].Config.Labels["category"] // "")
        })
        | map([.name, .status, .label] | @tsv)
        | .[]
      '
  )"
fi

[[ -z "$rows" ]] && { echo "ℹ️  No containers found for project: $PROJECT_NAME"; exit 0; }

# Sort
case "$SORT_BY" in
  name)   sorted="$(printf "%s\n" "$rows" | sort -t $'\t' -k1,1)";;
  status) sorted="$(printf "%s\n" "$rows" | sort -t $'\t' -k2,2)";;
  label)  sorted="$(printf "%s\n" "$rows" | sort -t $'\t' -k3,3)";;
  *) usage;;
esac

# Print
printf "%-28s %-12s %-16s\n" "CONTAINER NAME" "STATUS" "LABEL"
printf "%-28s %-12s %-16s\n" "----------------------------" "--------" "----------------"
while IFS=$'\t' read -r name status label; do
  [[ -z "$name" ]] && continue
  if [[ "$status" == "running" ]]; then color="\033[0;32m"; else color="\033[0;31m"; fi
  printf "${color}%-28s %-12s %-16s\033[0m\n" "$name" "$status" "$label"
done <<< "$sorted"
