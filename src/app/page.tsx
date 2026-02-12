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
  | { type: "reveal_question"; payload: Record<string, never> }
  | { type: "start_discussion"; payload: Record<string, never> }
  | { type: "end_discussion"; payload: Record<string, never> }
  | { type: "cast_vote"; payload: { voterId: string; targetId: string } }
  | { type: "close_voting"; payload: { allowMissingVotes: boolean; tieBreakLoserId?: string } }
  | { type: "finalize_round"; payload: Record<string, never> };

export default function HomePage() {
  const [message, setMessage] = useState<string>("Create or join a lobby.");
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);

  const [activeLobbyId, setActiveLobbyId] = useState<string>("demo-lobby");
  const [createLobbyId, setCreateLobbyId] = useState<string>("demo-lobby");
  const [hostPlayerId, setHostPlayerId] = useState<string>("p1");
  const [hostDisplayName, setHostDisplayName] = useState<string>("Host");
  const [joinPlayerId, setJoinPlayerId] = useState<string>("p2");
  const [joinDisplayName, setJoinDisplayName] = useState<string>("Avery");

  async function createLobby() {
    const response = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: createLobbyId,
        hostPlayerId,
        hostDisplayName,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Create failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setActiveLobbyId(createLobbyId);
    setMessage(`Lobby ${createLobbyId} created.`);
    await loadLobby(createLobbyId);
  }

  async function joinLobby() {
    const response = await fetch(`/api/lobbies/${activeLobbyId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: joinPlayerId,
        displayName: joinDisplayName,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Join failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setMessage(`Player ${joinDisplayName} joined ${activeLobbyId}.`);
    await loadLobby(activeLobbyId);
  }

  async function loadLobby(lobbyId: string = activeLobbyId) {
    const response = await fetch(`/api/games/${lobbyId}`, { method: "GET" });
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setMessage(payload.message ?? "Failed to load lobby.");
      setSnapshot(null);
      return;
    }

    const payload = (await response.json()) as LobbySnapshot;
    setSnapshot(payload);
    setMessage(`Loaded lobby ${lobbyId}.`);
  }

  async function runCommand(command: CommandPayload) {
    const response = await fetch(`/api/games/${activeLobbyId}/commands`, {
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

        <h2>Lobby Setup</h2>
        <p>
          Active Lobby ID: <input value={activeLobbyId} onChange={(e) => setActiveLobbyId(e.target.value)} />{" "}
          <button type="button" onClick={() => loadLobby(activeLobbyId)}>
            Load Lobby
          </button>
        </p>
        <p>
          Create ID: <input value={createLobbyId} onChange={(e) => setCreateLobbyId(e.target.value)} /> Host ID:{" "}
          <input value={hostPlayerId} onChange={(e) => setHostPlayerId(e.target.value)} /> Host Name:{" "}
          <input value={hostDisplayName} onChange={(e) => setHostDisplayName(e.target.value)} />{" "}
          <button type="button" onClick={createLobby}>
            Create Lobby
          </button>
        </p>
        <p>
          Join Player ID: <input value={joinPlayerId} onChange={(e) => setJoinPlayerId(e.target.value)} /> Name:{" "}
          <input value={joinDisplayName} onChange={(e) => setJoinDisplayName(e.target.value)} />{" "}
          <button type="button" onClick={joinLobby}>
            Join Active Lobby
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
