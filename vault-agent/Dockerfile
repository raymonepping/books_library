FROM hashicorp/vault:1.20.3

# Bake the config in the image at the exact path the server will read
COPY vault-config.hcl /vault/config/config.hcl

# No extra workdir needed, but harmless if present
WORKDIR /app

EXPOSE 8200

ENTRYPOINT ["vault"]
CMD ["server", "-config=/vault/config/config.hcl"]
