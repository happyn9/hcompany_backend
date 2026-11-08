# --- Étape 1 : build ---
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL est injectée au build (les variables VITE_* sont figées dans
# le bundle JS, contrairement aux variables lues côté serveur).
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Étape 2 : service statique ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
