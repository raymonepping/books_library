#!/bin/bash
set -e

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] [backend]: $*"
}

exec npm start
# exec npx nodemon index.js