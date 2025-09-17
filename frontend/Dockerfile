# Base image
FROM node:20.19.2

# Set working directory
WORKDIR /app

# Copy package files first to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the project
COPY . .

# Build the Nuxt app
RUN npm run build

# Expose port
EXPOSE 8085

# Start Nuxt in production
CMD ["npm", "run", "dev"]
