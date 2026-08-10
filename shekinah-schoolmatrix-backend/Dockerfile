FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
# CACHEBUST: passe --build-arg CACHEBUST=$(date +%s) pour forcer la prise en compte du nouveau code
ARG CACHEBUST
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p storage/profiles storage/uploads storage/backups
ENV STORAGE_ROOT=/app/storage
EXPOSE 3000
CMD ["node", "scripts/bootstrap-production.js"]
