# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package.json package-lock.json ./

# ---- 의존성 (dev 포함) ----
FROM base AS deps
RUN npm ci

# ---- 개발: 소스는 compose 에서 bind mount ----
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000 9229
CMD ["npm", "run", "start:dev"]

# ---- 빌드 ----
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- 운영 ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
