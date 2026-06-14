FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --prefer-offline
COPY . .
# VITE_API_URL is intentionally empty — Nginx proxies /api to the backend service.
# VITE_API_TOKEN is a build-time arg so it gets baked into the JS bundle.
# It is visible in the client bundle; the app must be kept network-private.
ARG VITE_API_TOKEN=""
ENV VITE_API_TOKEN=$VITE_API_TOKEN
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
