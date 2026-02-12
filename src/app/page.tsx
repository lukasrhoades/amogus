"use client";

import { useState } from "react";

type LobbySnapshot = {
  lobbyId: string;
  status: string;
  phase: string;
  completedRounds: number;
  plannedRounds: number;
  players: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    isHost: boolean;
  }>;
  scoreboard: Record<string, { totalPoints: number; impostorSurvivalWins: number }>;
  hasCurrentRound: boolean;
  currentRound: null | {
    roundNumber: number;
    phase: string;
    impostorCount: number;
    activePlayerIds: string[];
    satOutPlayerId: string | null;
    answersCount: number;
    votesCount: number;
    eliminatedPlayerId: string | null;
  };
};

type CommandResponse = {
  ok: true;
  state: LobbySnapshot;
};

type CommandPayload =
  | {
      type: "start_round";
      payload: {
        selection: {
          questionPair: {
            id: string;
            ownerId: string;
            canonicalQuestion: string;
            impostorQuestion: string;
          };
          impostorCount: 0 | 1 | 2;
        };
        roundPolicy: {
          eligibilityEnabled: boolean;
          allowVoteChanges: boolean;
        };
        roleAssignment: Record<string, "impostor" | "crew">;
      };
    }
  | {
      type: "submit_answer";
      payload: {
        playerId: string;
        answer: string;
      };
    }
  | {
      type: "reveal_question";
      payload: Record<string, never>;
    }
  | {
      type: "start_discussion";
      payload: Record<string, never>;
    }
  | {
      type: "end_discussion";
      payload: Record<string, never>;
    }
  | {
      type: "cast_vote";
      payload: {
        voterId: string;
        targetId: string;
      };
    }
  | {
      type: "close_voting";
      payload: {
        allowMissingVotes: boolean;
        tieBreakLoserId?: string;
      };
    }
  | {
      type: "finalize_round";
      payload: Record<string, never>;
    };

export default function HomePage() {
  const [message, setMessage] = useState<string>("No lobby seeded yet.");
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);

  async function seedDemoLobby() {
    const response = await fetch("/api/dev/seed", { method: "POST" });
    const payload = (await response.json()) as { lobbyId: string; phase: string; playerCount: number };
    setMessage(`Seeded ${payload.lobbyId} in phase ${payload.phase} with ${payload.playerCount} players.`);
    await loadDemoLobby();
  }

  async function loadDemoLobby() {
    const response = await fetch("/api/games/demo-lobby", { method: "GET" });
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setMessage(payload.message ?? "Failed to load lobby.");
      setSnapshot(null);
      return;
    }

    const payload = (await response.json()) as LobbySnapshot;
    setSnapshot(payload);
    setMessage("Loaded demo lobby state from API boundary.");
  }

  async function runCommand(command: CommandPayload) {
    const response = await fetch("/api/games/demo-lobby/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message: string };
      setMessage(`Command failed: ${payload.error} (${payload.message})`);
      return;
    }

    const payload = (await response.json()) as CommandResponse;
    setSnapshot(payload.state);
    setMessage(`Command succeeded: ${command.type}`);
  }

  async function startDemoRound() {
    const questionId = `q-${Date.now()}`;
    await runCommand({
      type: "start_round",
      payload: {
        selection: {
          questionPair: {
            id: questionId,
            ownerId: "p1",
            canonicalQuestion: "What is your ideal weekend activity?",
            impostorQuestion: "What is your favorite holiday destination?",
          },
          impostorCount: 1,
        },
        roundPolicy: {
          eligibilityEnabled: true,
          allowVoteChanges: true,
        },
        roleAssignment: {
          p2: "impostor",
          p3: "crew",
          p4: "crew",
          p5: "crew",
        },
      },
    });
  }

  async function submitDemoAnswers() {
    if (snapshot?.currentRound === null || snapshot?.currentRound === undefined) {
      setMessage("No active round to answer.");
      return;
    }

    for (const playerId of snapshot.currentRound.activePlayerIds) {
      // Sequential command execution mirrors client behavior and keeps failures observable.
      await runCommand({
        type: "submit_answer",
        payload: {
          playerId,
          answer: `demo-answer-${playerId}`,
        },
      });
    }
  }

  async function castDemoVotes() {
    // Deterministic vote pattern: p2 receives majority and is voted out.
    await runCommand({ type: "cast_vote", payload: { voterId: "p2", targetId: "p3" } });
    await runCommand({ type: "cast_vote", payload: { voterId: "p3", targetId: "p2" } });
    await runCommand({ type: "cast_vote", payload: { voterId: "p4", targetId: "p2" } });
    await runCommand({ type: "cast_vote", payload: { voterId: "p5", targetId: "p2" } });
  }

  return (
    <main>
      <div className="container">
        <h1>Social Deduction Games</h1>
        <p>Playable-first scaffold: domain rules are wired through application service and typed API boundaries.</p>

        <h2>Setup</h2>
        <p>
          <button type="button" onClick={seedDemoLobby}>
            Seed Demo Lobby
          </button>{" "}
          <button type="button" onClick={loadDemoLobby}>
            Load Demo Lobby
          </button>
        </p>

        <h2>Round Commands</h2>
        <p>
          <button type="button" onClick={startDemoRound}>
            1) Start Demo Round
          </button>{" "}
          <button type="button" onClick={submitDemoAnswers}>
            2) Submit Demo Answers
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "reveal_question", payload: {} })}>
            3) Reveal Question
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "start_discussion", payload: {} })}>
            4) Start Discussion
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "end_discussion", payload: {} })}>
            5) End Discussion
          </button>{" "}
          <button type="button" onClick={castDemoVotes}>
            6) Cast Demo Votes
          </button>{" "}
          <button
            type="button"
            onClick={() => runCommand({ type: "close_voting", payload: { allowMissingVotes: false } })}
          >
            7) Close Voting
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "finalize_round", payload: {} })}>
            8) Finalize Round
          </button>
        </p>

        <p>{message}</p>

        <h2>Lobby Snapshot</h2>
        <pre>{snapshot === null ? "(none)" : JSON.stringify(snapshot, null, 2)}</pre>
      </div>
    </main>
  );
}
