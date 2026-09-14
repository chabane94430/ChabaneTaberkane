# Single production image. Not size-optimized (keeps full node_modules, including the
# Prisma CLI, in the runtime stage so `prisma migrate deploy` can run on container
# start) — trade a bit of image size for a simple, correct Dockerfile.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public

# Uploaded files (request photos, ID documents) live here — mount a persistent volume
# at this path in production, or swap src/uploads.ts for S3-backed storage.
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
