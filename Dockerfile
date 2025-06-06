# 1. Базовый образ для сборки
FROM node:20-alpine AS builder

# 2. Рабочая директория
WORKDIR /app

# 3. Установка зависимостей
COPY package*.json ./
RUN npm ci

# 4. Копируем исходники и билдим TypeScript
COPY . .
RUN npm run build

# 5. Финальный минимальный образ
FROM node:20-alpine

WORKDIR /app

# Копируем только необходимое из builder-образа
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .

# Открываем порт
EXPOSE 3000

# Запуск приложения
CMD ["node", "dist/index.js"]