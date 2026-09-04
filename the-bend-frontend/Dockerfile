# syntax=docker/dockerfile:1
FROM node:20-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

FROM dependencies AS builder
COPY . .

ARG VITE_API_URL
ARG VITE_BASE_DOMAIN=bend.community
ARG VITE_CF_ANALYTICS_TOKEN
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BASE_DOMAIN=${VITE_BASE_DOMAIN}
ENV VITE_CF_ANALYTICS_TOKEN=${VITE_CF_ANALYTICS_TOKEN}

RUN npm run build

FROM nginx:alpine AS production
ARG REVISION
LABEL org.opencontainers.image.revision=${REVISION}

COPY --from=builder /app/dist /usr/share/nginx/html

# Use template for dynamic PORT support (Railway, etc.)
# nginx docker image auto-processes templates in /etc/nginx/templates/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default to port 80 for local/docker-compose; Railway overrides via $PORT
ENV PORT=80

EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]
