FROM node:20-slim
WORKDIR /app

# Build tools for native modules (Baileys needs these)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Wrapper for Railway stored start command
RUN printf '#!/bin/sh\ncd /app\nexec node index.js\n' > /usr/local/bin/admin.shivangiautoclinic.com \
    && chmod +x /usr/local/bin/admin.shivangiautoclinic.com

CMD ["node", "index.js"]
