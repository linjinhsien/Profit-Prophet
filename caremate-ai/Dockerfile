# =============================================================================
# CareMate AI - Frontend Dockerfile
# 多階段建置：Node.js 建置 → Nginx 產品映像
# =============================================================================

# Stage 1: 建置前端
FROM node:20-alpine AS builder

WORKDIR /app

# 安裝相依套件
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit

# 複製源碼並建置
COPY frontend/ .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Stage 2: 產品映像
FROM nginx:1.25-alpine AS production

# 安全性：移除預設設定
RUN rm -rf /usr/share/nginx/html/*

# 複製建置產物
COPY --from=builder /app/dist /usr/share/nginx/html

# 自訂 Nginx 設定
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf

# 安全性：使用非 root 用戶
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
