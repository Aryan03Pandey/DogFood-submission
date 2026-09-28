FROM node:22-alpine AS base
WORKDIR /app

# argon2 compiles a native module, so build tools are required for npm ci.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# Explicit --include=dev: seed, test, migrate, and CLI tooling (tsx, vitest,
# drizzle-kit) must ship inside the image so no host-side npm install is ever
# needed, regardless of NODE_ENV ordering below.
RUN npm ci --include=dev

COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Boot without seeding (no sample data at this stage).
# Applies pending Drizzle migrations when they exist, then starts Next.js.
CMD ["sh", "-c", "if ls drizzle/*.sql drizzle/**/*.sql src/db/migrations/*.sql 2>/dev/null | grep -q .; then npm run db:migrate; fi; npm start"]
