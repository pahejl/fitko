FROM node:20-alpine

# better-sqlite3 needs build tooling on alpine
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080
CMD ["node", "src/server.js"]
