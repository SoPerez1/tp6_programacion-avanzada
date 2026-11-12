# Imagen compartida para los seis servicios NestJS.
# El argumento APP elige qué workspace compilar y ejecutar.
#
#   docker build --build-arg APP=onboarding-api -t mercado-norte/onboarding-api .
#
# El orden de las capas es intencional: npm ci se cachea mientras no cambien
# los manifests, y el build de cada app reutiliza la misma base.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY libs ./libs
COPY apps ./apps

RUN npm ci

ARG APP
RUN test -n "$APP" || (echo "Falta --build-arg APP=<servicio>" && exit 1)
RUN npm run build:libs \
  && npm run build -w "@poc/${APP}" \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime

ARG APP
WORKDIR /app

ENV NODE_ENV=production
ENV APP=${APP}

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/libs ./libs
COPY --from=build /app/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=build /app/apps/${APP}/dist ./apps/${APP}/dist

# Nest habilita los shutdown hooks: docker stop envía SIGTERM y los
# consumers cierran offsets/outbox de forma ordenada.
CMD ["sh", "-c", "exec node apps/${APP}/dist/main.js"]
