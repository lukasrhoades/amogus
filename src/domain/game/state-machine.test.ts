import { describe, expect, it } from "vitest";

import {
  applyHostDisconnectTimeout,
  castHostTransferVote,
  cancelCurrentRoundBeforeReveal,
  castVote,
  closeVotingAndResolve,
  computeWinnerSummary,
  createInitialGameState,
  endDiscussion,
  finalizeRound,
  revealNextAnswer,
  revealQuestion,
  startDiscussion,
  startRound,
  applyDiscussionTimeout,
  extendDiscussion,
  updateSettings,
  extendHostDisconnectPause,
  removePlayer,
  setPlayerConnection,
  submitAnswer,
} from "./state-machine";
import { GameSettings, Player, PlayerId, QuestionPair, RoundRoleAssignment } from "./types";

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

function defaultSettings(overrides: Partial<GameSettings> = {}): GameSettings {
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
    ...overrides,
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

function submitAllAnswers(state: ReturnType<typeof createInitialGameState>) {
  if (state.currentRound === null) {
    throw new Error("Round not started");
  }

  return state.currentRound.activePlayerIds.reduce((acc, id) => {
    const result = submitAnswer(acc, id, `answer-${id}`);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }, state);
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function revealAllAnswers(state: ReturnType<typeof createInitialGameState>) {
  if (state.currentRound === null) {
    throw new Error("Round not started");
  }

  return state.currentRound.activePlayerIds.reduce((acc) => {
    const result = revealNextAnswer(acc);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }, state);
}

describe("startRound eligibility behavior", () => {
  it("sits out question owner when eligibility is enabled with 5 players", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(5),
      settings: defaultSettings(),
    });

    const result = startRound(state, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: true, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
        ["p5", "crew"],
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.currentRound?.satOutPlayerId).toBe("p1");
    expect(result.value.currentRound?.activePlayerIds).toEqual(["p2", "p3", "p4", "p5"]);
  });

  it("does not sit out question owner with 4 players even when eligibility is enabled", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const result = startRound(state, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: true, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.currentRound?.satOutPlayerId).toBeNull();
    expect(result.value.currentRound?.activePlayerIds).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

describe("voting constraints and tie resolution", () => {
  it("forbids self-votes", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    const revealed = revealQuestion(state);
    if (!revealed.ok) throw new Error(revealed.error.message);
    const withAnswersRevealed = revealAllAnswers(revealed.value);
    const discussion = startDiscussion(withAnswersRevealed);
    if (!discussion.ok) throw new Error(discussion.error.message);
    const voting = endDiscussion(discussion.value);
    if (!voting.ok) throw new Error(voting.error.message);

    const selfVote = castVote(voting.value, "p1", "p1");
    expect(selfVote.ok).toBe(false);
    if (selfVote.ok) return;
    expect(selfVote.error.code).toBe("self_vote_forbidden");
  });

  it("requires tiebreak loser when votes tie", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));

    state = expectOk(castVote(state, "p1", "p2"));
    state = expectOk(castVote(state, "p2", "p1"));
    state = expectOk(castVote(state, "p3", "p2"));
    state = expectOk(castVote(state, "p4", "p1"));

    const unresolved = closeVotingAndResolve(state, { allowMissingVotes: false });
    expect(unresolved.ok).toBe(false);
    if (unresolved.ok) return;
    expect(unresolved.error.code).toBe("missing_tiebreak");

    const resolved = closeVotingAndResolve(state, {
      allowMissingVotes: false,
      tieBreakLoserId: "p1",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.currentRound?.eliminatedPlayerId).toBe("p1");
  });
});

describe("scoring", () => {
  it("awards +3 to surviving impostor and -1 to voted-out crew", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "crew"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));
    state = expectOk(castVote(state, "p1", "p2"));
    state = expectOk(castVote(state, "p2", "p3"));
    state = expectOk(castVote(state, "p3", "p2"));
    state = expectOk(castVote(state, "p4", "p2"));
    state = expectOk(closeVotingAndResolve(state, { allowMissingVotes: false }));

    const finalized = finalizeRound(state);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    const p1 = finalized.value.scoreboard.p1;
    const p2 = finalized.value.scoreboard.p2;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1?.totalPoints).toBe(3);
    expect(p1?.impostorSurvivalWins).toBe(1);
    expect(p2?.totalPoints).toBe(-1);
    expect(finalized.value.phase).toBe("setup");
  });

  it("awards +1 to each crew when impostor is voted out", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "crew"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));
    state = expectOk(castVote(state, "p1", "p2"));
    state = expectOk(castVote(state, "p2", "p1"));
    state = expectOk(castVote(state, "p3", "p1"));
    state = expectOk(castVote(state, "p4", "p1"));
    state = expectOk(closeVotingAndResolve(state, { allowMissingVotes: false }));

    const finalized = finalizeRound(state);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    expect(finalized.value.scoreboard.p1?.totalPoints).toBe(0);
    expect(finalized.value.scoreboard.p2?.totalPoints).toBe(1);
    expect(finalized.value.scoreboard.p3?.totalPoints).toBe(1);
    expect(finalized.value.scoreboard.p4?.totalPoints).toBe(1);
  });

  it("applies only crew voted-out penalty in 0-impostor rounds", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 0 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "crew"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));
    state = expectOk(castVote(state, "p1", "p2"));
    state = expectOk(castVote(state, "p2", "p3"));
    state = expectOk(castVote(state, "p3", "p2"));
    state = expectOk(castVote(state, "p4", "p2"));
    state = expectOk(closeVotingAndResolve(state, { allowMissingVotes: false }));

    const finalized = finalizeRound(state);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    expect(finalized.value.scoreboard.p2?.totalPoints).toBe(-1);
    expect(finalized.value.scoreboard.p1?.totalPoints).toBe(0);
    expect(finalized.value.scoreboard.p3?.totalPoints).toBe(0);
    expect(finalized.value.scoreboard.p4?.totalPoints).toBe(0);
  });

  it("awards +3 to both impostors when both survive in 2-impostor round", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 2 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));
    state = expectOk(castVote(state, "p1", "p3"));
    state = expectOk(castVote(state, "p2", "p3"));
    state = expectOk(castVote(state, "p3", "p4"));
    state = expectOk(castVote(state, "p4", "p3"));
    state = expectOk(closeVotingAndResolve(state, { allowMissingVotes: false }));

    const finalized = finalizeRound(state);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    expect(finalized.value.scoreboard.p1?.totalPoints).toBe(3);
    expect(finalized.value.scoreboard.p2?.totalPoints).toBe(3);
    expect(finalized.value.scoreboard.p3?.totalPoints).toBe(-1);
  });

  it("awards +3 to surviving impostor and +1 to crew when one impostor is voted out", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 2 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "impostor"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    let state = submitAllAnswers(started.value);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state));
    state = expectOk(endDiscussion(state));
    state = expectOk(castVote(state, "p1", "p3"));
    state = expectOk(castVote(state, "p2", "p1"));
    state = expectOk(castVote(state, "p3", "p1"));
    state = expectOk(castVote(state, "p4", "p1"));
    state = expectOk(closeVotingAndResolve(state, { allowMissingVotes: false }));

    const finalized = finalizeRound(state);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;

    expect(finalized.value.scoreboard.p1?.totalPoints).toBe(0);
    expect(finalized.value.scoreboard.p2?.totalPoints).toBe(3);
    expect(finalized.value.scoreboard.p3?.totalPoints).toBe(1);
    expect(finalized.value.scoreboard.p4?.totalPoints).toBe(1);
  });
});

describe("winner selection", () => {
  it("uses impostor-survival wins as first tiebreak", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(3),
      settings: defaultSettings(),
    });

    const withScores = {
      ...state,
      phase: "game_over" as const,
      scoreboard: {
        p1: { totalPoints: 5, impostorSurvivalWins: 2 },
        p2: { totalPoints: 5, impostorSurvivalWins: 1 },
        p3: { totalPoints: 2, impostorSurvivalWins: 0 },
      },
    };

    const result = computeWinnerSummary(withScores);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.winnerPlayerIds).toEqual(["p1"]);
    expect(result.value.reason).toBe("impostor_survival_tiebreak");
  });

  it("requires explicit random winner when both score and survival wins tie", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(2),
      settings: defaultSettings(),
    });

    const withScores = {
      ...state,
      phase: "game_over" as const,
      scoreboard: {
        p1: { totalPoints: 5, impostorSurvivalWins: 2 },
        p2: { totalPoints: 5, impostorSurvivalWins: 2 },
      },
    };

    const unresolved = computeWinnerSummary(withScores);
    expect(unresolved.ok).toBe(false);
    if (unresolved.ok) return;
    expect(unresolved.error.code).toBe("missing_tiebreak");

    const resolved = computeWinnerSummary(withScores, "p2");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.winnerPlayerIds).toEqual(["p2"]);
    expect(resolved.value.reason).toBe("random_tiebreak");
  });
});

describe("host disconnect rules", () => {
  it("pauses game when host disconnects and resumes when host reconnects", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(5),
      settings: defaultSettings(),
    });

    const disconnected = setPlayerConnection(state, "p1", false, 1000);
    expect(disconnected.ok).toBe(true);
    if (!disconnected.ok) return;
    expect(disconnected.value.status).toBe("paused");
    expect(disconnected.value.hostDisconnection).not.toBeNull();
    expect(disconnected.value.hostDisconnection?.deadlineMs).toBe(301000);

    const reconnected = setPlayerConnection(disconnected.value, "p1", true, 2000);
    expect(reconnected.ok).toBe(true);
    if (!reconnected.ok) return;
    expect(reconnected.value.status).toBe("waiting");
    expect(reconnected.value.hostDisconnection).toBeNull();
  });

  it("transfers host only after unanimous connected non-host votes", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(5),
      settings: defaultSettings(),
    });

    const disconnected = expectOk(setPlayerConnection(state, "p1", false, 1000));
    const firstVote = castHostTransferVote(disconnected, "p2", "p3");
    expect(firstVote.ok).toBe(true);
    if (!firstVote.ok) return;
    expect(firstVote.value.players.p1?.isHost).toBe(true);

    const secondVote = expectOk(castHostTransferVote(firstVote.value, "p3", "p3"));
    const thirdVote = expectOk(castHostTransferVote(secondVote, "p4", "p3"));
    const fourthVote = castHostTransferVote(thirdVote, "p5", "p3");
    expect(fourthVote.ok).toBe(true);
    if (!fourthVote.ok) return;

    expect(fourthVote.value.players.p1?.isHost).toBe(false);
    expect(fourthVote.value.players.p3?.isHost).toBe(true);
    expect(fourthVote.value.hostDisconnection).toBeNull();
    expect(fourthVote.value.status).toBe("waiting");
  });

  it("ends game on host timeout when host remains disconnected", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(5),
      settings: defaultSettings(),
    });

    const next = expectOk(setPlayerConnection(state, "p1", false, 1000));

    const timedOut = applyHostDisconnectTimeout(next, 301000);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;

    expect(timedOut.value.status).toBe("ended");
    expect(timedOut.value.phase).toBe("game_over");
    expect(timedOut.value.hostDisconnection).toBeNull();
  });

  it("extends host disconnect timeout window to paused watchdog limit", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(5),
      settings: defaultSettings(),
    });

    const disconnected = expectOk(setPlayerConnection(state, "p1", false, 1000));
    expect(disconnected.hostDisconnection?.deadlineMs).toBe(301000);

    const extended = extendHostDisconnectPause(disconnected);
    expect(extended.ok).toBe(true);
    if (!extended.ok) return;

    expect(extended.value.hostDisconnection?.deadlineMs).toBe(3601000);
    expect(extended.value.hostDisconnection?.extendedPauseEnabled).toBe(true);
  });
});

describe("player removal", () => {
  it("promotes a connected non-host when host is removed", () => {
    const state = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const removed = removePlayer(state, "p1");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    expect(removed.value.players.p2?.isHost).toBe(true);
    expect(removed.value.players.p3?.isHost).toBe(false);
  });
});

describe("cancel-round and round cap behavior", () => {
  it("reduces planned rounds when question-capped and reuse is off", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings({ plannedRounds: 6, roundsCappedByQuestions: true, questionReuseEnabled: false }),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    const canceled = cancelCurrentRoundBeforeReveal(started.value, "admin_skip");
    expect(canceled.ok).toBe(true);
    if (!canceled.ok) return;

    expect(canceled.value.settings.plannedRounds).toBe(5);
    expect(canceled.value.phase).toBe("setup");
  });

  it("does not reduce planned rounds when question reuse is on", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings({ plannedRounds: 6, roundsCappedByQuestions: true, questionReuseEnabled: true }),
    });

    const started = startRound(base, {
      selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
      roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
      roleAssignment: assignment([
        ["p1", "crew"],
        ["p2", "impostor"],
        ["p3", "crew"],
        ["p4", "crew"],
      ]),
    });
    if (!started.ok) throw new Error(started.error.message);

    const canceled = cancelCurrentRoundBeforeReveal(started.value, "admin_skip");
    expect(canceled.ok).toBe(true);
    if (!canceled.ok) return;

    expect(canceled.value.settings.plannedRounds).toBe(6);
  });
});

describe("settings updates", () => {
  it("updates settings between rounds", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const updated = updateSettings(base, {
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
    expect(updated.value.settings.impostorWeights.one).toBe(0.8);
  });

  it("rejects invalid weight sums", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings(),
    });

    const updated = updateSettings(base, {
      plannedRounds: 10,
      roundsCappedByQuestions: false,
      questionReuseEnabled: false,
      impostorWeights: { zero: 0.1, one: 0.8, two: 0.2 },
      scoring: {
        impostorSurvivesPoints: 3,
        crewVotesOutImpostorPoints: 1,
        crewVotedOutPenaltyEnabled: true,
        crewVotedOutPenaltyPoints: -1,
      },
      discussion: {
        timerSeconds: null,
      },
    });

    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.error.code).toBe("invalid_settings");
  });
});

describe("discussion timer", () => {
  it("sets discussion deadline and auto-ends on timeout", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings({
        discussion: {
          timerSeconds: 30,
          watchdogSeconds: 600,
          pausedWatchdogSeconds: 3600,
        },
      }),
    });

    let state = expectOk(
      startRound(base, {
        selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
        roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
        roleAssignment: assignment([
          ["p1", "crew"],
          ["p2", "impostor"],
          ["p3", "crew"],
          ["p4", "crew"],
        ]),
      }),
    );
    state = submitAllAnswers(state);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state, 1000));
    expect(state.currentRound?.discussionDeadlineMs).toBe(31000);

    const beforeTimeout = expectOk(applyDiscussionTimeout(state, 30000));
    expect(beforeTimeout.phase).toBe("discussion");

    const timedOut = expectOk(applyDiscussionTimeout(state, 31000));
    expect(timedOut.phase).toBe("voting");
  });

  it("extends discussion timer for host pacing", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(4),
      settings: defaultSettings({
        discussion: {
          timerSeconds: 30,
          watchdogSeconds: 600,
          pausedWatchdogSeconds: 3600,
        },
      }),
    });

    let state = expectOk(
      startRound(base, {
        selection: { questionPair: defaultQuestion("p1"), impostorCount: 1 },
        roundPolicy: { eligibilityEnabled: false, allowVoteChanges: true },
        roleAssignment: assignment([
          ["p1", "crew"],
          ["p2", "impostor"],
          ["p3", "crew"],
          ["p4", "crew"],
        ]),
      }),
    );
    state = submitAllAnswers(state);
    state = expectOk(revealQuestion(state));
    state = revealAllAnswers(state);
    state = expectOk(startDiscussion(state, 5000));
    state = expectOk(extendDiscussion(state, { addSeconds: 60 }));

    expect(state.currentRound?.discussionDeadlineMs).toBe(95000);
  });
});
