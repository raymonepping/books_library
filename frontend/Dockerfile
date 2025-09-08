# Use the official Node.js image as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json
COPY package*.json ./

# Force install all dependencies (including devDependencies)
RUN npm install --legacy-peer-deps
# RUN npm install 

# Copy the rest of the application code
COPY . .

# Build the application
# RUN npm run build

# Expose the port the app runs on
EXPOSE 8075

# Start the application in production mode
CMD ["npm", "run", "dev"]
# CMD ["npm", "run", "start"]