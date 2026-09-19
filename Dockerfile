FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Build-time placeholders; runtime credentials come from .env.production.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV BETTER_AUTH_URL=https://example.invalid
ENV BETTER_AUTH_SECRET=build-only-secret-never-used-in-runtime
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
