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

## 4. Contract Map (Pre/Post)
Pre/post contracts are documented as code comments and result/error types in `src/domain/game/state-machine.ts`.

## 5. Implementation Notes (Recursion/Mutation/Effects)
- Core domain is pure and side-effect free.
- Mutations avoided; transitions return new immutable state snapshots.
- No runtime/network/db effects in domain layer.

## 6. Compile/Static Results
- Not run yet (project scaffold and toolchain not initialized in repository).

## 7. Boundary Safety Checks
- Deferred to boundary adapters (`zod` schemas and API/socket ingress) once web layer is scaffolded.

## 8. Security Log
- No dependencies introduced yet.
- Dependency/CVE checks deferred until package initialization.

## 9. Test Results
- Not run yet; tests will be added after baseline domain compile path is established.

## 10. Red-Team Log
- Deferred until API/socket boundaries exist.

## 11. Docs And Examples
- Rules and architecture docs created.
- Example flows to be added with domain tests.

## 12. Hallucination Audit
- No external APIs/config keys claimed.
- Rules were transcribed directly from session confirmations.

## 13. Final Risks And Follow-Ups
- Missing executable project scaffold (Next.js/TS/Vitest).
- Boundary validation and auth not implemented yet.
- Need explicit tests for tie-break, scoring matrix, and cancel-round round-cap behavior.
