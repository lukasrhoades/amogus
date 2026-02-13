# Social Deduction Games (SDG)

Playable web app for the Full Squad Gaming impostor questions format.

## Live Deployment

- Hosting: Netlify
- Database: Neon Postgres
- Players only need the live URL in a browser (no installs).

## Host Operations

### Production environment variables
- `DATABASE_URL=<neon_connection_string>`
- `GAME_SESSION_REPO=prisma`

### Apply database migrations
Run from repo root whenever schema/migrations change:
```bash
export DATABASE_URL="YOUR_NEON_CONNECTION_STRING"
npm run prisma:migrate:deploy
```

### Local development (host only)
```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run dev
```

## Quality Checks

```bash
npm run typecheck
npm test
npm run build
```
