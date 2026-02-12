"use client";

import { useState } from "react";

type Session = {
  playerId: string;
  displayName: string;
};

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
  | { type: "submit_answer"; payload: { answer: string } }
  | { type: "reveal_question"; payload: Record<string, never> }
  | { type: "start_discussion"; payload: Record<string, never> }
  | { type: "end_discussion"; payload: Record<string, never> }
  | { type: "cast_vote"; payload: { targetId: string } }
  | { type: "close_voting"; payload: { allowMissingVotes: boolean; tieBreakLoserId?: string } }
  | { type: "finalize_round"; payload: Record<string, never> }
  | { type: "remove_player"; payload: { playerId: string } }
  | { type: "leave_lobby"; payload: Record<string, never> };

export default function HomePage() {
  const [message, setMessage] = useState<string>("Create a session to begin.");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionDisplayName, setSessionDisplayName] = useState<string>("Player");

  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [activeLobbyId, setActiveLobbyId] = useState<string>("demo-lobby");
  const [createLobbyId, setCreateLobbyId] = useState<string>("demo-lobby");
  const [removePlayerId, setRemovePlayerId] = useState<string>("p5");
  const [answerText, setAnswerText] = useState<string>("demo-answer");
  const [voteTargetId, setVoteTargetId] = useState<string>("p2");

  async function createSession() {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: sessionDisplayName }),
    });

    if (!response.ok) {
      setMessage("Failed to create session.");
      return;
    }

    const payload = (await response.json()) as { session: Session };
    setSession(payload.session);
    setMessage(`Session ready: ${payload.session.displayName} (${payload.session.playerId})`);
  }

  async function createLobby() {
    const response = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: createLobbyId,
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
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Join failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setMessage(`Joined ${activeLobbyId}.`);
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

    const payload = (await response.json()) as { state: LobbySnapshot };
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

  return (
    <main>
      <div className="container">
        <h1>Social Deduction Games</h1>
        <p>Identity-bound prototype: actions use session player identity from secure cookie.</p>

        <h2>Session</h2>
        <p>
          Display Name: <input value={sessionDisplayName} onChange={(e) => setSessionDisplayName(e.target.value)} />{" "}
          <button type="button" onClick={createSession}>
            Create Session
          </button>
        </p>
        <p>{session === null ? "No session." : `Session: ${session.displayName} (${session.playerId})`}</p>

        <h2>Lobby Setup</h2>
        <p>
          Active Lobby ID: <input value={activeLobbyId} onChange={(e) => setActiveLobbyId(e.target.value)} />{" "}
          <button type="button" onClick={() => loadLobby(activeLobbyId)}>
            Load Lobby
          </button>
        </p>
        <p>
          Create ID: <input value={createLobbyId} onChange={(e) => setCreateLobbyId(e.target.value)} />{" "}
          <button type="button" onClick={createLobby}>
            Create Lobby
          </button>{" "}
          <button type="button" onClick={joinLobby}>
            Join Active Lobby
          </button>
        </p>
        <p>
          Remove Player ID: <input value={removePlayerId} onChange={(e) => setRemovePlayerId(e.target.value)} />{" "}
          <button type="button" onClick={() => runCommand({ type: "remove_player", payload: { playerId: removePlayerId } })}>
            Host Remove Player
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "leave_lobby", payload: {} })}>
            Leave Lobby
          </button>
        </p>

        <h2>Round Commands</h2>
        <p>
          <button type="button" onClick={startDemoRound}>
            1) Start Demo Round (Host)
          </button>{" "}
          Answer: <input value={answerText} onChange={(e) => setAnswerText(e.target.value)} />{" "}
          <button type="button" onClick={() => runCommand({ type: "submit_answer", payload: { answer: answerText } })}>
            2) Submit My Answer
          </button>
        </p>
        <p>
          <button type="button" onClick={() => runCommand({ type: "reveal_question", payload: {} })}>
            3) Reveal Question (Host)
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "start_discussion", payload: {} })}>
            4) Start Discussion (Host)
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "end_discussion", payload: {} })}>
            5) End Discussion (Host)
          </button>
        </p>
        <p>
          Vote Target: <input value={voteTargetId} onChange={(e) => setVoteTargetId(e.target.value)} />{" "}
          <button type="button" onClick={() => runCommand({ type: "cast_vote", payload: { targetId: voteTargetId } })}>
            6) Cast My Vote
          </button>{" "}
          <button
            type="button"
            onClick={() => runCommand({ type: "close_voting", payload: { allowMissingVotes: false } })}
          >
            7) Close Voting (Host)
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "finalize_round", payload: {} })}>
            8) Finalize Round (Host)
          </button>
        </p>

        <p>{message}</p>

        <h2>Lobby Snapshot</h2>
        <pre>{snapshot === null ? "(none)" : JSON.stringify(snapshot, null, 2)}</pre>
      </div>
    </main>
  );
}
