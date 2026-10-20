# Use official Node.js lightweight image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Build TypeScript to JavaScript (if using tsc)
RUN npm run build || true

# Expose your backend port
EXPOSE 3000

# Command to start the app
CMD ["npm", "start"]