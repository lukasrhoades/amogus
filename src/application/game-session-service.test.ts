import { describe, expect, it } from "vitest";

import { GameSessionService } from "./game-session-service";
import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { InMemoryQuestionPairRepo } from "../adapters/in-memory/in-memory-question-pair-repo";
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
    promptA: { text: "What is your favorite color?", target: "crew" },
    promptB: { text: "What is your favorite animal?", target: "impostor" },
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

    for (const _ of ["a", "b", "c", "d"] as const) {
      state = await service.revealNextAnswer("l1");
      expect(state.ok).toBe(true);
      if (!state.ok) return;
    }

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

  it("starts round automatically from lobby question pool", async () => {
    const gameRepo = new InMemoryGameSessionRepo();
    const questionRepo = new InMemoryQuestionPairRepo();
    const service = new GameSessionService(gameRepo, {}, questionRepo, () => 0.4);
    const initial = createInitialGameState({
      lobbyId: "l2",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);
    await questionRepo.create(defaultQuestion("p1"));

    const started = await service.startRoundAuto("l2");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.phase).toBe("prompting");
    expect(started.value.currentRound?.impostorCount).toBe(1);
  });

  it("uses only connected players for auto-round question pool", async () => {
    const gameRepo = new InMemoryGameSessionRepo();
    const questionRepo = new InMemoryQuestionPairRepo();
    const service = new GameSessionService(gameRepo, {}, questionRepo, () => 0.4);
    const initial = createInitialGameState({
      lobbyId: "l2b",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);

    await questionRepo.create(defaultQuestion("p4"));
    const disconnected = await service.setPlayerConnection("l2b", "p4", false, 1000);
    expect(disconnected.ok).toBe(true);

    const started = await service.startRoundAuto("l2b");
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error.code).toBe("question_pool_empty");
  });

  it("deletes lobby on host disconnect timeout without transfer", async () => {
    const gameRepo = new InMemoryGameSessionRepo();
    const service = new GameSessionService(gameRepo);
    const initial = createInitialGameState({
      lobbyId: "l3",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);

    const disconnected = await service.setPlayerConnection("l3", "p1", false, 1000);
    expect(disconnected.ok).toBe(true);

    const timedOut = await service.applyHostDisconnectTimeout("l3", 301000);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.value.status).toBe("ended");

    const after = await service.get("l3");
    expect(after.ok).toBe(false);
  });

  it("deletes empty lobby after 5 minutes with no reconnect", async () => {
    let now = 1000;
    const gameRepo = new InMemoryGameSessionRepo(() => now);
    const service = new GameSessionService(gameRepo);
    const initial = createInitialGameState({
      lobbyId: "l4",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);

    for (const playerId of ["p1", "p2", "p3", "p4"] as const) {
      const updated = await service.setPlayerConnection("l4", playerId, false, now);
      expect(updated.ok).toBe(true);
      now += 10;
    }

    now = 4 * 60 * 1000;
    const early = await service.cleanupIdleLobbies({ nowMs: now });
    expect(early).toBe(0);

    now = 6 * 60 * 1000;
    const deleted = await service.cleanupIdleLobbies({ nowMs: now });
    expect(deleted).toBe(1);
  });

  it("updates lobby settings between rounds", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());
    const initial = createInitialGameState({
      lobbyId: "l5",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create(initial);

    const updated = await service.updateSettings("l5", {
      plannedRounds: 12,
      roundsCappedByQuestions: true,
      questionReuseEnabled: true,
      impostorWeights: { zero: 0.1, one: 0.8, two: 0.1 },
      scoring: {
        impostorSurvivesPoints: 4,
        crewVotesOutImpostorPoints: 2,
        crewVotedOutPenaltyEnabled: false,
        crewVotedOutPenaltyPoints: -1,
      },
      discussion: {
        timerSeconds: 120,
      },
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.settings.plannedRounds).toBe(12);
    expect(updated.value.settings.questionReuseEnabled).toBe(true);
  });

  it("auto-ends discussion when timer deadline is reached", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());
    const initial = createInitialGameState({
      lobbyId: "l6",
      players: players(4),
      settings: {
        ...defaultSettings(),
        discussion: {
          timerSeconds: 30,
          watchdogSeconds: 600,
          pausedWatchdogSeconds: 3600,
        },
      },
    });
    await service.create(initial);

    let state = await service.startRound("l6", {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "crew"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!state.ok) throw new Error(state.error.message);

    for (const playerId of ["p1", "p2", "p3", "p4"] as const) {
      state = await service.submitAnswer("l6", playerId, `answer-${playerId}`);
      if (!state.ok) throw new Error(state.error.message);
    }

    state = await service.revealQuestion("l6");
    if (!state.ok) throw new Error(state.error.message);
    for (const _ of ["a", "b", "c", "d"] as const) {
      state = await service.revealNextAnswer("l6");
      if (!state.ok) throw new Error(state.error.message);
    }
    state = await service.startDiscussion("l6", 1000);
    if (!state.ok) throw new Error(state.error.message);

    const timedOut = await service.applyDiscussionTimeout("l6", 31000);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.value.phase).toBe("voting");
  });

  it("restarts a completed game for play again flow", async () => {
    const service = new GameSessionService(new InMemoryGameSessionRepo());
    const initial = createInitialGameState({
      lobbyId: "l7",
      players: players(4),
      settings: defaultSettings(),
    });
    await service.create({
      ...initial,
      phase: "game_over",
      status: "ended",
      completedRounds: 10,
      scoreboard: {
        p1: { totalPoints: 4, impostorSurvivalWins: 1 },
        p2: { totalPoints: 1, impostorSurvivalWins: 0 },
        p3: { totalPoints: 1, impostorSurvivalWins: 0 },
        p4: { totalPoints: 0, impostorSurvivalWins: 0 },
      },
      winnerSummary: {
        winnerPlayerIds: ["p1"],
        reason: "highest_score",
      },
    });

    const restarted = await service.restartGame("l7");
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.value.phase).toBe("setup");
    expect(restarted.value.completedRounds).toBe(0);
    expect(restarted.value.winnerSummary).toBeNull();
    expect(restarted.value.scoreboard.p1?.totalPoints).toBe(0);
  });
});
