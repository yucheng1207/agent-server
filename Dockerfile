# 排障 Agent 服务端 - 多阶段构建
FROM node:20-alpine AS builder

WORKDIR /app

# 先装依赖（利用缓存）
COPY package.json package-lock.json ./
RUN npm ci

# 再拷贝源码并构建
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 运行阶段：只保留运行时需要的文件
FROM node:20-alpine

WORKDIR /app

# 生产依赖 + 构建产物
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3002

# 端口可通过 PORT 环境变量覆盖
CMD ["node", "dist/server.js"]
