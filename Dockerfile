FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./

RUN npm ci

RUN apt-get update && apt-get install -y \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libxshmfence1 \
    libxfixes3 \
    libdrm2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]