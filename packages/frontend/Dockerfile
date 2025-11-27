# Demo2APK Frontend Dockerfile
# Multi-stage build for production

# Stage 1: Dependencies & Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY packages/frontend/package.json ./

# Install dependencies using npm (more reliable for Docker builds)
RUN npm install

# Copy source code
COPY packages/frontend/ ./

# Build for production
RUN npm run build

# Stage 2: Production with Nginx
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
