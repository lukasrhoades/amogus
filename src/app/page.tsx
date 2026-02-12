"use client";

import { useEffect, useState } from "react";

type Session = {
  userId: string;
  username: string;
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
    answersSubmittedBy: string[];
    revealedAnswerCount: number;
    votesCount: number;
    votesSubmittedBy: string[];
    eliminatedPlayerId: string | null;
    trueQuestion: string | null;
    alternativeQuestion: string | null;
    revealedAnswers: Array<{
      playerId: string;
      displayName: string;
      answer: string;
    }> | null;
    revealedRoles: Record<string, "impostor" | "crew"> | null;
  };
  viewerRound: null | {
    viewerPlayerId: string;
    isActive: boolean;
    role: "impostor" | "crew" | null;
    prompt: string | null;
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
            promptA: { text: string; target: "crew" | "impostor" | "both" };
            promptB: { text: string; target: "crew" | "impostor" | "both" };
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
  | { type: "start_round_auto"; payload: { roundPolicy?: { eligibilityEnabled?: boolean; allowVoteChanges?: boolean } } }
  | { type: "submit_answer"; payload: { answer: string } }
  | { type: "reveal_question"; payload: Record<string, never> }
  | { type: "start_discussion"; payload: Record<string, never> }
  | { type: "reveal_next_answer"; payload: Record<string, never> }
  | { type: "end_discussion"; payload: Record<string, never> }
  | { type: "cast_vote"; payload: { targetId: string } }
  | { type: "close_voting"; payload: { allowMissingVotes: boolean; tieBreakLoserId?: string } }
  | { type: "finalize_round"; payload: Record<string, never> }
  | { type: "remove_player"; payload: { playerId: string } }
  | { type: "leave_lobby"; payload: Record<string, never> };

export default function HomePage() {
  const [message, setMessage] = useState<string>("Log in to begin.");
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authUsername, setAuthUsername] = useState<string>("player1");
  const [authPassword, setAuthPassword] = useState<string>("password123");

  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [activeLobbyId, setActiveLobbyId] = useState<string>("demo-lobby");
  const [removePlayerId, setRemovePlayerId] = useState<string>("");
  const [answerText, setAnswerText] = useState<string>("demo-answer");
  const [voteTargetId, setVoteTargetId] = useState<string>("p2");
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [promptAText, setPromptAText] = useState<string>("");
  const [promptATarget, setPromptATarget] = useState<"crew" | "impostor" | "both">("crew");
  const [promptBText, setPromptBText] = useState<string>("");
  const [promptBTarget, setPromptBTarget] = useState<"crew" | "impostor" | "both">("impostor");
  const [questionPairs, setQuestionPairs] = useState<
    Array<{
      id: string;
      promptA: { text: string; target: "crew" | "impostor" | "both" };
      promptB: { text: string; target: "crew" | "impostor" | "both" };
    }>
  >([]);
  const [tieCandidates, setTieCandidates] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      const response = await fetch("/api/session", { method: "GET" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { session: Session | null };
      if (payload.session !== null) {
        setSession(payload.session);
        setAuthUsername(payload.session.username);
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (activeLobbyId.trim() === "") {
      return;
    }

    if (session === null) {
      return;
    }

    const source = new EventSource(`/api/games/${activeLobbyId}/events`);
    source.onopen = () => {
      setRealtimeConnected(true);
    };
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; state?: LobbySnapshot };
        if (payload.type === "state" && payload.state !== undefined) {
          setSnapshot(payload.state);
        }
      } catch {
        // Ignore malformed event payloads.
      }
    };
    source.onerror = () => {
      setRealtimeConnected(false);
    };

    return () => {
      source.close();
      setRealtimeConnected(false);
    };
  }, [activeLobbyId, session]);

  async function authenticate() {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: authMode,
        username: authUsername,
        password: authPassword,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Auth failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    const payload = (await response.json()) as { session: Session };
    setSession(payload.session);
    setMessage(`Logged in as ${payload.session.username} (${payload.session.userId})`);
    await loadQuestionPairs();
  }

  useEffect(() => {
    if (session !== null) {
      void loadQuestionPairs();
    }
  }, [session]);

  async function createLobby() {
    const response = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: activeLobbyId,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Create failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setMessage(`Lobby ${activeLobbyId} created.`);
    await loadLobby(activeLobbyId);
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

  async function deleteLobby() {
    const response = await fetch(`/api/lobbies/${activeLobbyId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Delete failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }
    setSnapshot(null);
    setMessage(`Lobby ${activeLobbyId} deleted.`);
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
      const payload = (await response.json()) as { error: string; message: string; tieCandidates?: string[] };
      if (payload.error === "missing_tiebreak") {
        setTieCandidates(payload.tieCandidates ?? []);
      }
      setMessage(`Command failed: ${payload.error} (${payload.message})`);
      return;
    }

    const payload = (await response.json()) as { state: LobbySnapshot };
    setSnapshot(payload.state);
    setTieCandidates([]);
    setMessage(`Command succeeded: ${command.type}`);
  }

  async function resolveTie(choice: "auto" | string) {
    const candidates = tieCandidates;
    if (candidates.length < 2) {
      setMessage("Tie resolution unavailable.");
      return;
    }

    const loserId =
      choice === "auto"
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : choice;

    if (loserId === undefined) {
      setMessage("Tie resolution failed: no candidate selected.");
      return;
    }

    await runCommand({
      type: "close_voting",
      payload: {
        allowMissingVotes: false,
        tieBreakLoserId: loserId,
      },
    });
  }

  async function startAutoRound() {
    await runCommand({ type: "start_round_auto", payload: {} });
  }

  async function loadQuestionPairs() {
    const response = await fetch("/api/question-pairs", { method: "GET" });
    if (!response.ok) {
      setQuestionPairs([]);
      return;
    }
    const payload = (await response.json()) as {
      pairs: Array<{
        id: string;
        promptA: { text: string; target: "crew" | "impostor" | "both" };
        promptB: { text: string; target: "crew" | "impostor" | "both" };
      }>;
    };
    setQuestionPairs(payload.pairs);
  }

  async function createQuestionPair() {
    const response = await fetch("/api/question-pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promptA: { text: promptAText, target: promptATarget },
        promptB: { text: promptBText, target: promptBTarget },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Create pair failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setPromptAText("");
    setPromptBText("");
    await loadQuestionPairs();
    setMessage("Question pair created.");
  }

  async function deleteQuestionPair(pairId: string) {
    const response = await fetch(`/api/question-pairs/${pairId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Delete pair failed.");
      return;
    }
    await loadQuestionPairs();
    setMessage("Question pair deleted.");
  }

  const me = snapshot?.players.find((p) => p.id === session?.userId) ?? null;
  const isHost = me?.isHost ?? false;
  const round = snapshot?.currentRound ?? null;
  const activePlayerIds = round?.activePlayerIds ?? [];
  const voteTargets = snapshot?.players.filter((p) => activePlayerIds.includes(p.id) && p.id !== session?.userId) ?? [];
  const canSubmitAnswer = round?.phase === "prompting" && (snapshot?.viewerRound?.isActive ?? false);
  const canCastVote = round?.phase === "voting" && activePlayerIds.includes(session?.userId ?? "");
  const canHostStartRound = isHost && (snapshot?.phase === "setup" || snapshot?.phase === "round_result");
  const canHostRevealQuestion = isHost && round?.phase === "prompting";
  const canHostRevealNextAnswer =
    isHost &&
    round?.phase === "reveal" &&
    round.revealedAnswerCount < round.activePlayerIds.length;
  const canHostStartDiscussion =
    isHost &&
    round?.phase === "reveal" &&
    round.revealedAnswerCount >= round.activePlayerIds.length;
  const canHostEndDiscussion = isHost && round?.phase === "discussion";
  const canHostCloseVoting = isHost && round?.phase === "voting";
  const canHostFinalizeRound = isHost && snapshot?.phase === "round_result";
  const removablePlayers = (snapshot?.players ?? []).filter((player) => player.id !== session?.userId);
  const hasValidVoteTarget = voteTargets.some((target) => target.id === voteTargetId);

  useEffect(() => {
    if (voteTargets.length === 0) {
      return;
    }
    if (voteTargets.some((target) => target.id === voteTargetId)) {
      return;
    }
    setVoteTargetId(voteTargets[0]?.id ?? "");
  }, [voteTargetId, voteTargets]);

  useEffect(() => {
    if (removablePlayers.length === 0) {
      setRemovePlayerId("");
      return;
    }
    if (removablePlayers.some((player) => player.id === removePlayerId)) {
      return;
    }
    setRemovePlayerId(removablePlayers[0]?.id ?? "");
  }, [removePlayerId, removablePlayers]);

  return (
    <main>
      <div className="container">
        <h1>Social Deduction Games</h1>
        <p>Full Squad Gaming impostor questions</p>

        <h2>Auth</h2>
        <p>
          Mode:{" "}
          <select value={authMode} onChange={(e) => setAuthMode(e.target.value as "register" | "login")}>
            <option value="register">register</option>
            <option value="login">login</option>
          </select>{" "}
          Username: <input value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />{" "}
          Password:{" "}
          <input
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />{" "}
          <button type="button" onClick={authenticate}>
            Submit
          </button>
        </p>
        <p>{session === null ? "No session." : `Session: ${session.username} (${session.userId})`}</p>
        <p>Realtime: {realtimeConnected ? "connected" : "disconnected"}</p>
        {session !== null ? (
          <p>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/session", { method: "DELETE" });
                setSession(null);
                setSnapshot(null);
                setMessage("Logged out.");
              }}
            >
              Logout
            </button>
          </p>
        ) : null}

        {session === null ? (
          <p>{message}</p>
        ) : null}
        {session === null ? null : (
          <>

        <h2>Lobby</h2>
        <p>
          Lobby ID: <input value={activeLobbyId} onChange={(e) => setActiveLobbyId(e.target.value)} />{" "}
          <button type="button" onClick={joinLobby}>
            Join
          </button>
          <button type="button" onClick={createLobby}>
            Create
          </button>{" "}
          <button type="button" onClick={() => loadLobby(activeLobbyId)}>
            Refresh
          </button>{" "}
          <button type="button" onClick={() => runCommand({ type: "leave_lobby", payload: {} })}>
            Leave
          </button>
        </p>
        {isHost ? (
          <p>
            <button type="button" onClick={deleteLobby}>
              Delete Lobby
            </button>
          </p>
        ) : null}
        {isHost && removablePlayers.length > 0 ? (
          <p>
            Remove Player:{" "}
            <select value={removePlayerId} onChange={(e) => setRemovePlayerId(e.target.value)}>
              {removablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>{" "}
            <button
              type="button"
              onClick={() => runCommand({ type: "remove_player", payload: { playerId: removePlayerId } })}
            >
              Remove
            </button>
          </p>
        ) : null}

        <h2>Round</h2>
        <p>
          Lobby Status: {snapshot?.status ?? "(none)"} | Phase: {snapshot?.phase ?? "(none)"} | Round{" "}
          {snapshot?.completedRounds ?? 0}/{snapshot?.plannedRounds ?? 0}
        </p>
        <p>
          Players:{" "}
          {(snapshot?.players ?? []).map((p) => `${p.displayName}${p.isHost ? " (host)" : ""}${p.connected ? "" : " (offline)"}`).join(", ")}
        </p>
        {snapshot?.viewerRound?.isActive ? (
          <p>
            Your role: {snapshot.viewerRound.role} | Your prompt: {snapshot.viewerRound.prompt ?? "(none)"}
          </p>
        ) : (
          <p>{snapshot?.viewerRound === null ? "No active round." : "You are sat out this round."}</p>
        )}
        <div>
          <p>Scoreboard:</p>
          {(snapshot?.players ?? []).map((player) => (
            <p key={player.id}>
              {player.displayName}: {snapshot?.scoreboard[player.id]?.totalPoints ?? 0} points
            </p>
          ))}
        </div>

        {round !== null && round.trueQuestion !== null ? <p>True question: {round.trueQuestion}</p> : null}
        {round !== null && round.revealedAnswers !== null ? (
          <div>
            <p>Answers:</p>
            {round.revealedAnswers.map((entry) => (
              <p key={entry.playerId}>
                {entry.displayName}: {entry.answer}
              </p>
            ))}
          </div>
        ) : null}
        {round !== null && round.revealedRoles !== null ? (
          <div>
            <p>Roles:</p>
            {Object.entries(round.revealedRoles).map(([playerId, role]) => (
              <p key={playerId}>
                {snapshot?.players.find((p) => p.id === playerId)?.displayName ?? playerId}: {role}
              </p>
            ))}
          </div>
        ) : null}

        <h2>Actions</h2>
        <p>{message}</p>
        <p>
          {canHostStartRound ? (
            <button type="button" onClick={startAutoRound}>
              Start Round (Host)
            </button>
          ) : null}{" "}
          {canSubmitAnswer ? (
            <>
              Answer: <input value={answerText} onChange={(e) => setAnswerText(e.target.value)} />{" "}
              <button type="button" onClick={() => runCommand({ type: "submit_answer", payload: { answer: answerText } })}>
                Submit Answer
              </button>
            </>
          ) : null}
        </p>
        <p>
          {canHostRevealQuestion ? (
            <button type="button" onClick={() => runCommand({ type: "reveal_question", payload: {} })}>
              Reveal Question (Host)
            </button>
          ) : null}{" "}
          {canHostStartDiscussion ? (
            <button type="button" onClick={() => runCommand({ type: "start_discussion", payload: {} })}>
              Start Discussion (Host)
            </button>
          ) : null}{" "}
          {canHostRevealNextAnswer ? (
            <button type="button" onClick={() => runCommand({ type: "reveal_next_answer", payload: {} })}>
              Reveal Next Answer (Host)
            </button>
          ) : null}{" "}
          {canHostEndDiscussion ? (
            <button type="button" onClick={() => runCommand({ type: "end_discussion", payload: {} })}>
              End Discussion (Host)
            </button>
          ) : null}
        </p>
        {round?.phase === "reveal" ? (
          <p>
            Revealed answers: {round.revealedAnswerCount}/{round.activePlayerIds.length}
          </p>
        ) : null}
        {isHost && round?.phase === "prompting" ? (
          <div>
            <p>Answer status (host only):</p>
            {round.activePlayerIds.map((playerId) => {
              const displayName = snapshot?.players.find((p) => p.id === playerId)?.displayName ?? playerId;
              const answered = round.answersSubmittedBy.includes(playerId);
              return (
                <p key={playerId}>
                  {displayName}: {answered ? "submitted" : "waiting"}
                </p>
              );
            })}
          </div>
        ) : null}
        {isHost && round?.phase === "voting" ? (
          <div>
            <p>Vote status (host only):</p>
            {round.activePlayerIds.map((playerId) => {
              const displayName = snapshot?.players.find((p) => p.id === playerId)?.displayName ?? playerId;
              const voted = round.votesSubmittedBy.includes(playerId);
              return (
                <p key={playerId}>
                  {displayName}: {voted ? "voted" : "waiting"}
                </p>
              );
            })}
          </div>
        ) : null}
        <p>
          {canCastVote ? (
            <>
              Vote Target:{" "}
              <select value={voteTargetId} onChange={(e) => setVoteTargetId(e.target.value)}>
                {voteTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.displayName}
                  </option>
                ))}
              </select>{" "}
              <button
                type="button"
                disabled={!hasValidVoteTarget}
                onClick={() => runCommand({ type: "cast_vote", payload: { targetId: voteTargetId } })}
              >
                Cast Vote
              </button>
            </>
          ) : null}{" "}
          {canHostCloseVoting ? (
            <button
              type="button"
              onClick={() => runCommand({ type: "close_voting", payload: { allowMissingVotes: false } })}
            >
              Close Voting (Host)
            </button>
          ) : null}{" "}
          {canHostFinalizeRound ? (
            <button type="button" onClick={() => runCommand({ type: "finalize_round", payload: {} })}>
              Finalize Round (Host)
            </button>
          ) : null}
        </p>
        {canHostCloseVoting && tieCandidates.length >= 2 ? (
          <div>
            <p>Tie detected. Resolve manually or auto-randomize:</p>
            <p>
              <button type="button" onClick={() => resolveTie("auto")}>
                Auto Resolve Randomly
              </button>
            </p>
            <p>
              {tieCandidates.map((playerId) => {
                const displayName = snapshot?.players.find((player) => player.id === playerId)?.displayName ?? playerId;
                return (
                  <button key={playerId} type="button" onClick={() => resolveTie(playerId)}>
                    Eliminate {displayName}
                  </button>
                );
              })}
            </p>
          </div>
        ) : null}

        <h2>My Question Pairs</h2>
        <p>
          Prompt A: <input value={promptAText} onChange={(e) => setPromptAText(e.target.value)} />{" "}
          <select value={promptATarget} onChange={(e) => setPromptATarget(e.target.value as "crew" | "impostor" | "both")}>
            <option value="crew">crew</option>
            <option value="impostor">impostor</option>
            <option value="both">both</option>
          </select>
        </p>
        <p>
          Prompt B: <input value={promptBText} onChange={(e) => setPromptBText(e.target.value)} />{" "}
          <select value={promptBTarget} onChange={(e) => setPromptBTarget(e.target.value as "crew" | "impostor" | "both")}>
            <option value="crew">crew</option>
            <option value="impostor">impostor</option>
            <option value="both">both</option>
          </select>{" "}
          <button type="button" onClick={createQuestionPair}>
            Add Pair
          </button>{" "}
          <button type="button" onClick={loadQuestionPairs}>
            Refresh
          </button>
        </p>
        {questionPairs.map((pair) => (
          <p key={pair.id}>
            A[{pair.promptA.target}] {pair.promptA.text} | B[{pair.promptB.target}] {pair.promptB.text}{" "}
            <button type="button" onClick={() => deleteQuestionPair(pair.id)}>
              Delete
            </button>
          </p>
        ))}
          </>
        )}

      </div>
    </main>
  );
}
