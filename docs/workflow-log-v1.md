# Safe Typed DSL Workflow Log (V1 Bootstrap)

## 1. Scope Note
- Objective: implement a playable-first, server-authoritative domain model for the impostor-questions game with explicit typed state transitions.
- Non-goals: visual polish, in-app chat, public matchmaking, mobile apps.
- Constraints: low upkeep cost, beginner-friendly architecture, strong type safety, adapter-friendly boundaries for future auth/db swaps.
- Risk level: High.
Why: includes auth-adjacent behavior, multiplayer synchronization, and scoring integrity.

## 2. Truth Map
- `docs/v1-stack-and-architecture.md` (stack and layering decisions)
- `docs/rules-spec-v1.md` (authoritative game rules)
- User confirmations in this session (tie-break, scoring, disconnect, round-cap behavior).

## 3. Abstractions + DSL Surface
Implemented in:
- `src/domain/game/types.ts`
- `src/domain/game/state-machine.ts`
- `src/application/game-session-service.ts`
- `src/ports/game-session-repo.ts`
- `src/adapters/in-memory/in-memory-game-session-repo.ts`
- `src/app/api/games/[lobbyId]/commands/route.ts`
- `src/server/serialize-game-state.ts`
- `src/adapters/prisma/prisma-game-session-repo.ts`
- `src/adapters/prisma/game-state-json.ts`
- `src/server/prisma-client.ts`
- `prisma/schema.prisma`
- `src/app/api/lobbies/route.ts`
- `src/app/api/lobbies/[lobbyId]/join/route.ts`
- `src/server/lobby/defaults.ts`

DSL-style commands (pure domain transitions):
- `createInitialGameState`
- `startRound`
- `submitAnswer`
- `revealQuestion`
- `startDiscussion`
- `endDiscussion`
- `castVote`
- `closeVotingAndResolve`
- `finalizeRound`
- `castHostTransferVote`
- `applyHostDisconnectTimeout`
- `extendHostDisconnectPause`

## 4. Contract Map (Pre/Post)
Pre/post contracts are documented as code comments and result/error types in `src/domain/game/state-machine.ts`.

## 5. Implementation Notes (Recursion/Mutation/Effects)
- Core domain is pure and side-effect free.
- Mutations avoided; transitions return new immutable state snapshots.
- No runtime/network/db effects in domain layer.

## 6. Compile/Static Results
- Tooling initialized with TypeScript + Vitest.
- Command: `npm run typecheck`
- Result: pass.
- Re-run after adding application/ports layer: pass.
- Re-run after adding Next.js command API boundary + UI hooks: pass.
- Command: `npm run build`
- Result: pass.
- Re-run after adding scoring/tiebreak branch tests and telemetry-disabled scripts: pass.
- Re-run after Prisma adapter integration and mapping tests: pass.

## 7. Boundary Safety Checks
- Deferred to boundary adapters (`zod` schemas and API/socket ingress) once web layer is scaffolded.
- Runtime adapter selection now supports `GAME_SESSION_REPO=auto`, which attempts Prisma and falls back to in-memory when DB is unavailable.
- Route tests pin `GAME_SESSION_REPO=memory` to avoid environment-coupled failures.

## 8. Security Log
- Dependencies introduced:
- `typescript@5.9.3`
- `vitest@4.0.18`
- `@types/node@25.2.3`
- `next@16.1.6`
- `react@19.2.4`
- `react-dom@19.2.4`
- `zod@4.3.6`
- `@types/react@19.2.14`
- `@types/react-dom@19.2.3`
- `prisma@6.19.2`
- `@prisma/client@6.19.2`
- Command: `npm ls --depth=0`
- Result: confirms installed versions above.
- Command: `npm ls prisma @prisma/client`
- Result: both installed and aligned at `6.19.2`.
- Command: `npm audit --omit=dev`
- Result: `found 0 vulnerabilities`.
- Command: `npm audit`
- Result in sandbox: failed due restricted network (`ENOTFOUND registry.npmjs.org`).
- User-run result on host machine: `0 vulnerabilities found`.
- Decision: security gate satisfied for this stage with host-machine audit confirmation.
- No additional dependencies were introduced in the application/ports stage.

## 9. Test Results
- Added tests in `src/domain/game/state-machine.test.ts`.
- Added service orchestration tests in `src/application/game-session-service.test.ts`.
- Added Prisma mapping tests in `src/adapters/prisma/game-state-json.test.ts`.
- Coverage focus:
- eligibility sit-out behavior for 4 vs 5 players
- self-vote prohibition
- tie-resolution requiring explicit tiebreak loser
- scoring for 1-impostor survive and impostor-eliminated flows
- canceled-round round-cap behavior with question reuse ON/OFF
- Command: `npm test`
- Result: pass (`10` tests across 2 files).
- API command route currently validated by typecheck/build (no route integration tests yet).
- Expanded domain coverage:
- `0 impostor` scoring branch
- `2 impostor` scoring branches (both survive, one voted out)
- final winner tiebreak behavior (impostor-survival then random)
- Latest result: `15` tests passing.
- Added command-route integration tests in `src/app/api/games/[lobbyId]/commands/route.test.ts`:
- malformed command payload returns `invalid_command` (`400`)
- missing lobby maps to `game_not_found` (`404`)
- successful `start_round` command transitions lobby to prompting phase
- full round lifecycle via command API reaches `setup` with expected scoring
- tie on `close_voting` without tiebreak loser returns `missing_tiebreak` (`400`)
- admin cancel-round flow returns lobby to setup phase
- admin set-player-connection flow updates player connection state
- host disconnect pauses game state and unanimous transfer votes reassign host
- host timeout command ends lobby when connected count falls below 4
- extended host pause mode (1 hour watchdog) delays timeout end condition
- Added lobby route integration tests:
- `src/app/api/lobbies/route.test.ts`
- `src/app/api/lobbies/[lobbyId]/join/route.test.ts`
- Added remove/leave player tests:
- `src/application/game-session-service.test.ts` (remove player)
- `src/app/api/games/[lobbyId]/commands/route.test.ts` (`remove_player`, `leave_lobby`)
- Latest result: `37` tests passing.

## 10. Red-Team Log
- Deferred until API/socket boundaries exist.

## 11. Docs And Examples
- Rules and architecture docs created.
- Example flows to be added with domain tests.

## 12. Hallucination Audit
- No external APIs/config keys claimed.
- Rules were transcribed directly from session confirmations.

## 13. Final Risks And Follow-Ups
- Next.js scaffold exists with API boundaries and baseline lobby/round controls.
- Boundary validation and auth not implemented yet.
- Need websocket transport and auth integration.
- Runtime supports repo driver switch (`GAME_SESSION_REPO=memory|prisma|auto`); Prisma adapter implemented.
- Production policy locked: `NODE_ENV=production` requires `GAME_SESSION_REPO=prisma` (fail fast otherwise).
- Real lobby create/join APIs now exist; demo-only seed path is no longer the sole entrypoint.
- Host pause-extension behavior is implemented for host-disconnect pause flow.
