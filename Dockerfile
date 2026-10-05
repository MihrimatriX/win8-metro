# 1) Build: Next statik export'u out/ klasörüne yazar (sunucu kodu yok, her şey tarayıcıda çalışır).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Canonical/OG/sitemap URL'leri için: docker build --build-arg NEXT_PUBLIC_SITE_URL=https://alanadi.com .
ARG NEXT_PUBLIC_SITE_URL
RUN NEXT_TELEMETRY_DISABLED=1 npm run build

# 2) Run: yalnızca statik dosyalar (~1.2 MB) + nginx. Node yok; imajın geri kalanı nginx:alpine tabanı.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 3200
