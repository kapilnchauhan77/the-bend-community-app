FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Use template for dynamic PORT support (Railway, etc.)
# nginx docker image auto-processes templates in /etc/nginx/templates/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default to port 80 for local/docker-compose; Railway overrides via $PORT
ENV PORT=80

EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]
