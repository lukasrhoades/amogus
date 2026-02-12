# V1 Stack And Architecture (Playable First)

## Goal
Build a playable web app for the impostor-questions game first, then iteratively improve visuals and advanced platform features.

## Product Priorities
1. Playable multiplayer game loop first.
2. Low upkeep cost for friends-only usage.
3. Strong type safety and clear architecture for future upgrades.
4. Simple representations now, replace internals later without breaking domain logic.

## V1 Stack Decision
1. Runtime: Next.js (TypeScript) monolith.
2. Realtime: Socket.IO.
3. Database: PostgreSQL + Prisma.
4. Auth: Auth.js with Credentials provider first.
5. Validation: Zod at all API/socket boundaries.
6. Tests: Vitest for domain logic.

### Why this stack
- One codebase is easier to learn and maintain.
- TypeScript types can be shared across frontend/backend.
- Prisma + Postgres are stable and beginner-friendly.
- Socket.IO gives straightforward realtime lobby/game updates.
- Credentials auth is simple now; OAuth can be added later.

## Cost Strategy
1. Develop locally with Docker Postgres.
2. Deploy on free/low-cost tier services.
3. Keep dependencies minimal.
4. Avoid paid managed features until needed.

## Production Policy
1. Production runtime must use persistent DB mode (`GAME_SESSION_REPO=prisma`).
2. Memory/auto fallback modes are for local development and testing only.
3. Production startup should fail fast if DB-backed mode is not configured.

## Architecture (Upgradeable By Design)

### Layer 1: Domain (Pure)
Folder: `src/domain`
- Game rules and state transitions only.
- No database, HTTP, socket, or framework imports.
- Uses ADTs (discriminated unions) for phase/state modeling.

### Layer 2: Application (Use Cases)
Folder: `src/application`
- Orchestrates domain + ports.
- Handles commands like `startRound`, `submitAnswer`, `castVote`, `advancePhase`.

### Layer 3: Ports (Interfaces)
Folder: `src/ports`
- `AuthPort`, `UserRepo`, `QuestionRepo`, `LobbyRepo`, `GameRepo`, `RealtimePort`, `ClockPort`.
- Application layer depends on interfaces only.

### Layer 4: Adapters (Implementations)
Folder: `src/adapters`
- Prisma repos, Auth.js adapter, Socket.IO adapter, system clock adapter.
- Later replacements (OAuth provider, other DB) only change adapters.

### Layer 5: Delivery (Web/API/Socket)
Folder: `src/app` and `src/server`
- Next.js pages/routes and socket event handlers.
- All external input validated with Zod and mapped to typed internal commands.

## Core Domain Types (Initial)
- `PlayerId`, `LobbyId`, `RoundNumber`
- `QuestionPair { canonicalQuestion, impostorQuestion, ownerId }`
- `Role = Impostor | Crew`
- `Phase = Setup | Prompting | Reveal | Discussion | Voting | RoundResult | GameOver`
- `RoundConfig { allowZeroImpostors, allowTwoImpostors, eligibilityMode, discussionTimerSec }`
- `Vote`, `Answer`, `ScoreDelta`, `RoundOutcome`

## Playable-First Scope (V1)
1. User auth (credentials).
2. Question pair CRUD per user.
3. Host creates lobby; players join via code.
4. Host configures rounds/scoring/impostor options/discussion timer.
5. Full round loop works end-to-end.
6. Scoreboard persists across rounds and game ends correctly.

## Explicitly Out Of Scope (For V1)
1. Fancy UI/animations.
2. In-app chat.
3. Matchmaking/public lobbies.
4. Mobile app.
5. Full analytics.

## Game State Strategy (Simple First)
Hybrid model:
1. Store current state for fast reads (`lobby`, `current_round`, `scores`).
2. Append key round events for debugging and replay (`round_events`).

Rationale:
- Easier than full event sourcing.
- Safer and debuggable than current-state-only.

## Realtime Strategy
Use WebSocket (Socket.IO) for:
1. phase changes
2. timer updates
3. answer submission acknowledgement
4. vote completion updates
5. reveal progression

## Rules To Lock Before Coding
1. Exact minimum players for 0/1/2 impostor modes.
2. Tie vote behavior.
3. Self-vote allowed or forbidden.
4. Disconnect handling during answer/vote phases.
5. Eligibility behavior when selected question belongs to one/multiple players.
6. Precise scoring matrix by outcome.

## Initial Milestones
1. Domain state machine + tests.
2. In-memory adapters + CLI/sim test to validate game loop.
3. Postgres schema + Prisma repos.
4. Next.js auth + lobby screens.
5. Socket events for round progression.
6. End-to-end playable session test.

## Replacement-Friendly Rules
1. Never let UI or adapters call Prisma directly for game rules.
2. All game mutations go through application commands.
3. Keep domain entities framework-agnostic.
4. Keep external payload schemas separate from domain types.

## First Build Order
1. Implement domain model and transition functions.
2. Implement application commands using in-memory repos.
3. Add basic web UI to drive commands.
4. Replace in-memory repos with Prisma adapters.
5. Add auth persistence and hardening.
