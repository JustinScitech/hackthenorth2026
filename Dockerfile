FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# The browser DSN is inlined at build time, so it is the one Sentry value passed as a build arg.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Build-time placeholders; runtime credentials come from .env.production.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_URL=https://example.invalid \
    BETTER_AUTH_SECRET=build-only-secret-never-used-in-runtime \
    npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
