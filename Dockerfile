FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0 SERVE_FRONTEND=false
CMD ["node", "server/index.mjs"]
