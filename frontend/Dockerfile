# Use official Node.js image as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the frontend (if using a build tool like React/Vue/Angular)
RUN npm run build

# Expose port (change if your frontend uses a different port)
EXPOSE 3000

# Start the frontend server
CMD ["npm", "start"]