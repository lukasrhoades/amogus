import { describe, expect, it } from "vitest";

import { GameSessionService } from "./game-session-service";
import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { createInitialGameState } from "../domain/game/state-machine";
import { GameSettings, Player, PlayerId, QuestionPair, RoundRoleAssignment } from "../domain/game/types";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, idx) => {
    const id = `p${idx + 1}`;
    return {
      id,
      displayName: id,
      isHost: idx === 0,
      connected: true,
    };
  });
}

function defaultSettings(): GameSettings {
  return {
    plannedRounds: 10,
    roundsCappedByQuestions: false,
    questionReuseEnabled: false,
    impostorWeights: { zero: 0.025, one: 0.95, two: 0.025 },
    discussion: {
      timerSeconds: null,
      watchdogSeconds: 600,
      pausedWatchdogSeconds: 3600,
    },
    scoring: {
      impostorSurvivesPoints: 3,
      crewVotesOutImpostorPoints: 1,
      crewVotedOutPenaltyEnabled: true,
      crewVotedOutPenaltyPoints: -1,
    },
  };
}

function defaultQuestion(ownerId: PlayerId = "p1"): QuestionPair {
  return {
    id: "q1",
    ownerId,
    canonicalQuestion: "What is your favorite color?",
    impostorQuestion: "What is your favorite animal?",
  };
}

function assignment(entries: Array<[PlayerId, "impostor" | "crew"]>): RoundRoleAssignment {
  return Object.fromEntries(entries);
}

describe("GameSessionService", () => {
  it("returns game_not_found when lobby does not exist", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());

    const result = await service.get("missing-lobby");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("game_not_found");
  });

  it("persists state transitions for a round lifecycle", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());
    const initial = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    await service.create(initial);

    let state = await service.startRound("l1", {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "crew"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    for (const playerId of ["p1", "p2", "p3", "p4"] as const) {
      state = await service.submitAnswer("l1", playerId, `answer-${playerId}`);
      expect(state.ok).toBe(true);
      if (!state.ok) return;
    }

    state = await service.revealQuestion("l1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.startDiscussion("l1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.endDiscussion("l1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.castVote("l1", "p1", "p2");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.castVote("l1", "p2", "p1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.castVote("l1", "p3", "p1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.castVote("l1", "p4", "p1");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = await service.closeVotingAndResolve("l1", { allowMissingVotes: false });
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    const finalized = await service.finalizeRound("l1");
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    expect(finalized.value.completedRounds).toBe(1);
    expect(finalized.value.scoreboard.p2?.totalPoints).toBe(1);
    expect(finalized.value.phase).toBe("setup");

    const fetched = await service.get("l1");
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;

    expect(fetched.value.completedRounds).toBe(1);
  });

  it("removes players from lobby state", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());
    const initial = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);

    const removed = await service.removePlayer("l1", "p4");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.players.p4).toBeUndefined();
  });
});
