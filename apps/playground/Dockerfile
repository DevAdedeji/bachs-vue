FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/.output ./.output
CMD ["node", ".output/server/index.mjs"]
