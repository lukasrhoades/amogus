# Social Deduction Games (SDG)

Playable web app for the Full Squad Gaming impostor questions format.

## Local Run

1. Install deps:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env.local
```
3. Set `DATABASE_URL` in `.env.local`.
4. Generate Prisma client and migrate:
```bash
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
```
5. Start app:
```bash
npm run dev
```

## Public Deployment (Vercel + Postgres)

1. Create a hosted Postgres database (for example Supabase or Neon).
2. Push this repo to GitHub.
3. Import repo into Vercel.
4. Configure environment variables in Vercel:
- `DATABASE_URL=<your pooled postgres url>`
- `GAME_SESSION_REPO=prisma`
5. Deploy.
6. Run migrations against production DB:
```bash
npm run prisma:migrate:deploy
```

Notes:
- In production, runtime enforces `GAME_SESSION_REPO=prisma`.
- Share lobby links using the in-app `Copy Invite Link` button.
- A running Postgres instance is required in production for persistent accounts/lobbies.

## Quality Checks

```bash
npm run typecheck
npm test
npm run build
```
