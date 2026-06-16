FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/

EXPOSE 3000

CMD ["node", "src/app.js"]
