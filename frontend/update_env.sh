#!/bin/bash

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[1;36m'
NC='\033[0m' # No Color

INTERFACE="${1:-en0}"  # default to en0, override as first arg
API_PATH="${2:-/wp/wp-json/wp/v2}" # default to Traefik path, override as second arg

# Try to get the first non-localhost IPv4 address for the interface
LOCAL_IP=$(ifconfig "$INTERFACE" | awk '/inet / && $2 != "127.0.0.1"{print $2; exit}')

ENV_FILE=".env"

if [[ -z "$LOCAL_IP" ]]; then
  echo -e "${RED}❌ No IP found for interface $INTERFACE!${NC}"
  exit 1
fi

NEW_URL="WORDPRESS_API_URL=http://$LOCAL_IP${API_PATH}"

# Create the .env file if it doesn't exist
if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${YELLOW}⚠️  $ENV_FILE did not exist, creating it.${NC}"
  touch "$ENV_FILE"
fi

# Remove any existing WORDPRESS_API_URL line
sed -i '' '/^WORDPRESS_API_URL=/d' "$ENV_FILE"

# Add the new line at the end
echo "$NEW_URL" >> "$ENV_FILE"

echo -e "${GREEN}✔ Set WORDPRESS_API_URL to ${CYAN}$NEW_URL${GREEN} (interface: ${CYAN}$INTERFACE${GREEN})${NC}"
echo -e "${CYAN}--- $ENV_FILE now looks like: ---${NC}"
cat "$ENV_FILE"
