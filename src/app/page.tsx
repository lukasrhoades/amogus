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
  hasCurrentRound: boolean;
};

export default function HomePage() {
  const [message, setMessage] = useState<string>("No lobby seeded yet.");
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);

  async function seedDemoLobby() {
    const response = await fetch("/api/dev/seed", { method: "POST" });
    const payload = (await response.json()) as { lobbyId: string; phase: string; playerCount: number };
    setMessage(`Seeded ${payload.lobbyId} in phase ${payload.phase} with ${payload.playerCount} players.`);
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

  return (
    <main>
      <div className="container">
        <h1>Social Deduction Games</h1>
        <p>Playable-first scaffold: domain rules are wired through application service and typed API boundaries.</p>
        <p>
          <button type="button" onClick={seedDemoLobby}>
            Seed Demo Lobby
          </button>{" "}
          <button type="button" onClick={loadDemoLobby}>
            Load Demo Lobby
          </button>
        </p>
        <p>{message}</p>

        <h2>Lobby Snapshot</h2>
        <pre>{snapshot === null ? "(none)" : JSON.stringify(snapshot, null, 2)}</pre>
      </div>
    </main>
  );
}
