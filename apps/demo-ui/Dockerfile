# Build estático de la consola React y servidor nginx.
# Las URLs son de build-time porque Vite las inyecta en el bundle.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY libs ./libs
COPY apps ./apps

RUN npm ci

ARG VITE_API_URL=http://localhost:3000
ARG VITE_INSIGHTS_URL=http://localhost:3004
ARG VITE_KAFKA_UI_URL=http://localhost:8090
ARG VITE_MAILHOG_URL=http://localhost:8025

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_INSIGHTS_URL=${VITE_INSIGHTS_URL} \
    VITE_KAFKA_UI_URL=${VITE_KAFKA_UI_URL} \
    VITE_MAILHOG_URL=${VITE_MAILHOG_URL}

RUN npm run build:libs && npm run build -w @poc/demo-ui

FROM nginx:1.27-alpine AS runtime

COPY apps/demo-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/demo-ui/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1
