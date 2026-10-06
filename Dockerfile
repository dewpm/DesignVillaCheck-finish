FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build:backend
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.build ./.build
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0
CMD ["node", ".build/backend/main.js"]
