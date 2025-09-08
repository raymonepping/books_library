# 📚 Books Library

A local demo stack showcasing a modern web app with secure storage, object storage, and secrets management.  
Built with **Docker Compose**, includes **Couchbase**, **Vault**, **MinIO**, an **Express backend**, and a **Nuxt 3 frontend**.

---

## 🚀 Stack Overview

- **Couchbase** → NoSQL database for user and book data
- **Vault** → Secrets management, encryption, and dynamic credentials
- **Vault Agent** → Sidecar for secret injection
- **MinIO** → Object storage for book covers and assets
- **Express Backend** → REST API with Swagger UI
- **Nuxt 3 Frontend** → Web interface for the library

---

## 🛠️ Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/)

### Clone & Bootstrap
```
git clone https://github.com/raymonepping/books_library.git
cd books_library
```

### Copy and adjust environment variables:

```
cp backend/.env.example backend/.env
```

### Build & Run
docker compose build
docker compose up -d

### Check Running Services
```
./list_containers.sh
```

### 🔎 Access Points

Backend API → http://localhost:3000
Swagger UI → http://localhost:3000/api-docs
Frontend UI → http://localhost:4000
Couchbase UI → http://localhost:8091
MinIO Console → http://localhost:9001
Vault UI → http://localhost:8200

### ⚙️ Utilities

list_containers.sh → Lists running/stopped containers with status
list_versions.sh → Checks for latest upstream versions of Node, Vault, Couchbase, MinIO

### 🧹 Housekeeping
Vault unseal/init keys are written to ops/vault/INIT.out (excluded from Git)

.env files are excluded from Git for safety

Logs are volume-mounted per service

### 📖 Notes
Use docker compose logs -f <service> to view logs

Health checks ensure services are ready before dependencies start

Backend won’t start until Couchbase + Vault are available

---

🧠 Born from automation experiments
🤖 Powered by HashiCorp + Node + Nuxt
🚀 Built for secure local demos