# Base image
FROM node:20.19.4
# FROM node:16-alpine
# FROM --platform=linux/amd64 node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the backend listens on
EXPOSE 3001

# Run the application
CMD ["npm", "start"]
# Entrypoint that waits for Couchbase before launching
# CMD ["./entrypoint.sh"]
# CMD ["npx", "nodemon", "index.js"]
