# 1. Frontend Builder
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# 2. Backend Builder
FROM node:22-bookworm-slim AS backend-builder
WORKDIR /app/backend

# Prisma-д хэрэгтэй санг суулгах
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Dependency файлуудыг хуулах
COPY backend/package*.json ./

# !!! ЧУХАЛ: npm ci ажиллахаас өмнө prisma.config.ts-д хэрэгтэй 
# 'src/lib/database-url.js' файлыг заавал хуулсан байх ёстой
COPY backend/src/lib/database-url.js ./src/lib/database-url.js
COPY backend/prisma.config.ts ./
COPY backend/prisma ./prisma

# npm ci ажиллуулж prisma client-ыг generate хийнэ
# (DATABASE_URL-ыг build үед өгөх нь prisma generate хийхэд тусалдаг)
RUN DATABASE_URL=mysql://root:password@127.0.0.1:3306/build_db npm ci --no-audit --no-fund

# Үлдсэн бүх backend кодыг хуулна
COPY backend/ ./

# 3. Runner Stage (Final Image)
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Builder-оос хэрэгтэй бүх зүйлээ хуулж авна
COPY --from=backend-builder /app/backend /app/backend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=frontend-builder /app/frontend/public /app/frontend/public

EXPOSE 3000

# Railway дээр ажиллах үндсэн команд
CMD ["node", "backend/scripts/railway-start.js"]
