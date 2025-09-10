FROM hashicorp/vault:1.20.3

# Optional but handy
RUN apk add --no-cache curl jq bash

# Ensure these exist so file mounts work
RUN mkdir -p /vault/agent /vault/approle /vault/secrets /vault/templates

# Healthcheck script
COPY healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh
