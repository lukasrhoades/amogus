"use client";

import { useEffect, useState } from "react";

type Session = {
  userId: string;
  username: string;
};

type SettingsPreset = {
  ownerId: string;
  name: string;
  config: {
    plannedRounds: number;
    roundsCappedByQuestions: boolean;
    questionReuseEnabled: boolean;
    impostorWeights: {
      zero: number;
      one: number;
      two: number;
    };
    scoring: {
      impostorSurvivesPoints: number;
      crewVotesOutImpostorPoints: number;
      crewVotedOutPenaltyEnabled: boolean;
      crewVotedOutPenaltyPoints: number;
    };
    discussion: {
      timerSeconds: number | null;
    };
  };
};

type LobbySnapshot = {
  lobbyId: string;
  status: string;
  phase: string;
  completedRounds: number;
  plannedRounds: number;
  settings: {
    plannedRounds: number;
    roundsCappedByQuestions: boolean;
    questionReuseEnabled: boolean;
    impostorWeights: {
      zero: number;
      one: number;
      two: number;
    };
    scoring: {
      impostorSurvivesPoints: number;
      crewVotesOutImpostorPoints: number;
      crewVotedOutPenaltyEnabled: boolean;
      crewVotedOutPenaltyPoints: number;
    };
    discussion: {
      timerSeconds: number | null;
    };
  };
  players: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    isHost: boolean;
  }>;
  scoreboard: Record<string, { totalPoints: number; impostorSurvivalWins: number }>;
  winnerSummary: null | {
    winnerPlayerIds: string[];
    reason: "highest_score" | "impostor_survival_tiebreak" | "random_tiebreak";
  };
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
    discussionDeadlineMs: number | null;
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
  | { type: "extend_discussion"; payload: { addSeconds: number } }
  | { type: "reveal_next_answer"; payload: Record<string, never> }
  | { type: "end_discussion"; payload: Record<string, never> }
  | { type: "cast_vote"; payload: { targetId: string } }
  | { type: "close_voting"; payload: { allowMissingVotes: boolean; tieBreakLoserId?: string } }
  | { type: "finalize_round"; payload: Record<string, never> }
  | { type: "restart_game"; payload: Record<string, never> }
  | {
      type: "update_settings";
      payload: {
        plannedRounds: number;
        roundsCappedByQuestions: boolean;
        questionReuseEnabled: boolean;
        impostorWeights: {
          zero: number;
          one: number;
          two: number;
        };
        scoring: {
          impostorSurvivesPoints: number;
          crewVotesOutImpostorPoints: number;
          crewVotedOutPenaltyEnabled: boolean;
          crewVotedOutPenaltyPoints: number;
        };
        discussion: {
          timerSeconds: number | null;
        };
      };
    }
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
  const [settingsPresets, setSettingsPresets] = useState<SettingsPreset[]>([]);
  const [selectedPresetName, setSelectedPresetName] = useState<string>("DEFAULT");
  const [newPresetName, setNewPresetName] = useState<string>("FAST");
  const [settingsPlannedRounds, setSettingsPlannedRounds] = useState<number>(10);
  const [settingsRoundsCappedByQuestions, setSettingsRoundsCappedByQuestions] = useState<boolean>(false);
  const [settingsQuestionReuseEnabled, setSettingsQuestionReuseEnabled] = useState<boolean>(false);
  const [settingsZeroWeight, setSettingsZeroWeight] = useState<number>(0.025);
  const [settingsOneWeight, setSettingsOneWeight] = useState<number>(0.95);
  const [settingsTwoWeight, setSettingsTwoWeight] = useState<number>(0.025);
  const [settingsImpostorSurvivePoints, setSettingsImpostorSurvivePoints] = useState<number>(3);
  const [settingsCrewCatchPoints, setSettingsCrewCatchPoints] = useState<number>(1);
  const [settingsPenaltyEnabled, setSettingsPenaltyEnabled] = useState<boolean>(true);
  const [settingsPenaltyPoints, setSettingsPenaltyPoints] = useState<number>(-1);
  const [settingsDiscussionTimerSeconds, setSettingsDiscussionTimerSeconds] = useState<number>(0);
  const [roundEligibilityEnabled, setRoundEligibilityEnabled] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lobbyParam = params.get("lobby");
    if (lobbyParam !== null && lobbyParam.trim().length > 0) {
      setActiveLobbyId(lobbyParam.trim());
    }

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
    const url = new URL(window.location.href);
    url.searchParams.set("lobby", activeLobbyId.trim());
    window.history.replaceState({}, "", url.toString());
  }, [activeLobbyId]);

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
    setMessage(`Logged in as ${payload.session.username}.`);
    await loadQuestionPairs();
    await loadSettingsPresets();
  }

  useEffect(() => {
    if (session !== null) {
      void loadQuestionPairs();
      void loadSettingsPresets();
    }
  }, [session]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  async function copyInviteLink() {
    if (activeLobbyId.trim() === "") {
      setMessage("Set a lobby ID before copying invite link.");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("lobby", activeLobbyId.trim());
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Invite link copied.");
    } catch {
      setMessage("Clipboard unavailable. Copy URL from browser bar.");
    }
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
      setMessage(describeCommandError(payload.error, payload.message));
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
    await runCommand({
      type: "start_round_auto",
      payload: {
        roundPolicy: {
          eligibilityEnabled: roundEligibilityEnabled,
        },
      },
    });
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

  async function loadSettingsPresets() {
    const response = await fetch("/api/settings-presets", { method: "GET" });
    if (!response.ok) {
      setSettingsPresets([]);
      return;
    }
    const payload = (await response.json()) as { presets: SettingsPreset[] };
    setSettingsPresets(payload.presets);
    if (payload.presets.some((preset) => preset.name === selectedPresetName)) {
      return;
    }
    setSelectedPresetName(payload.presets[0]?.name ?? "DEFAULT");
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
  const canHostRestartGame = isHost && snapshot?.phase === "game_over";
  const removablePlayers = (snapshot?.players ?? []).filter((player) => player.id !== session?.userId);
  const hasValidVoteTarget = voteTargets.some((target) => target.id === voteTargetId);
  const connectedPlayers = (snapshot?.players ?? []).filter((player) => player.connected);
  const canHostAttemptStartRound = canHostStartRound && connectedPlayers.length >= 4;
  const roundAnswerProgress =
    round === null ? null : `${round.answersSubmittedBy.length}/${round.activePlayerIds.length}`;
  const roundVoteProgress =
    round === null ? null : `${round.votesSubmittedBy.length}/${round.activePlayerIds.length}`;

  const phaseInstruction = (() => {
    if (session === null) {
      return "Create an account or log in to start.";
    }
    if (snapshot === null) {
      return "Join or create a lobby, then invite your friends.";
    }
    if (snapshot.phase === "setup") {
      return isHost
        ? "Pick settings, then start the next round when at least 4 players are connected."
        : "Wait for the host to start the round.";
    }
    if (round === null) {
      return "Round state is syncing.";
    }
    if (round.phase === "prompting") {
      if (snapshot.viewerRound?.isActive) {
        return "Submit your answer. The round advances when all active players submit.";
      }
      return "You are sat out this round. Wait for answer collection to finish.";
    }
    if (round.phase === "reveal") {
      return isHost
        ? "Reveal answers one by one, then start discussion."
        : "Watch answer reveals and discuss out loud.";
    }
    if (round.phase === "discussion") {
      return "Discuss with the group. Host can end or extend discussion time.";
    }
    if (round.phase === "voting") {
      return snapshot.viewerRound?.isActive
        ? "Vote for who you think is impostor. Voting is mandatory."
        : "Wait for active players to finish voting.";
    }
    if (snapshot.phase === "round_result") {
      return isHost ? "Finalize the round to continue." : "Round result is ready. Waiting for host.";
    }
    if (snapshot.phase === "game_over") {
      return isHost ? "Use Play Again to restart this lobby." : "Game over.";
    }
    return "Follow host instructions.";
  })();

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

  useEffect(() => {
    if (snapshot === null) {
      return;
    }
    setSettingsPlannedRounds(snapshot.settings.plannedRounds);
    setSettingsRoundsCappedByQuestions(snapshot.settings.roundsCappedByQuestions);
    setSettingsQuestionReuseEnabled(snapshot.settings.questionReuseEnabled);
    setSettingsZeroWeight(snapshot.settings.impostorWeights.zero);
    setSettingsOneWeight(snapshot.settings.impostorWeights.one);
    setSettingsTwoWeight(snapshot.settings.impostorWeights.two);
    setSettingsImpostorSurvivePoints(snapshot.settings.scoring.impostorSurvivesPoints);
    setSettingsCrewCatchPoints(snapshot.settings.scoring.crewVotesOutImpostorPoints);
    setSettingsPenaltyEnabled(snapshot.settings.scoring.crewVotedOutPenaltyEnabled);
    setSettingsPenaltyPoints(snapshot.settings.scoring.crewVotedOutPenaltyPoints);
    setSettingsDiscussionTimerSeconds(snapshot.settings.discussion.timerSeconds ?? 0);
    setRoundEligibilityEnabled(snapshot.players.length >= 5);
  }, [snapshot]);

  function impostorWeightPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  function normalizedPresetName(name: string): string {
    return name.trim().toUpperCase();
  }

  const impostorWeightSum = settingsZeroWeight + settingsOneWeight + settingsTwoWeight;
  const impostorWeightsValid = Math.abs(impostorWeightSum - 1) <= 0.000001;
  const plannedRoundsValid = Number.isInteger(settingsPlannedRounds) && settingsPlannedRounds >= 5 && settingsPlannedRounds <= 30;
  const discussionTimerValid =
    Number.isInteger(settingsDiscussionTimerSeconds) &&
    settingsDiscussionTimerSeconds >= 0 &&
    settingsDiscussionTimerSeconds <= 600;
  const settingsFormValid = plannedRoundsValid && impostorWeightsValid && discussionTimerValid;

  async function saveSettings() {
    await runCommand({
      type: "update_settings",
      payload: {
        plannedRounds: settingsPlannedRounds,
        roundsCappedByQuestions: settingsRoundsCappedByQuestions,
        questionReuseEnabled: settingsQuestionReuseEnabled,
        impostorWeights: {
          zero: settingsZeroWeight,
          one: settingsOneWeight,
          two: settingsTwoWeight,
        },
        scoring: {
          impostorSurvivesPoints: settingsImpostorSurvivePoints,
          crewVotesOutImpostorPoints: settingsCrewCatchPoints,
          crewVotedOutPenaltyEnabled: settingsPenaltyEnabled,
          crewVotedOutPenaltyPoints: settingsPenaltyPoints,
        },
        discussion: {
          timerSeconds: settingsDiscussionTimerSeconds > 0 ? settingsDiscussionTimerSeconds : null,
        },
      },
    });
  }

  function applyPresetConfig(config: SettingsPreset["config"]) {
    setSettingsPlannedRounds(config.plannedRounds);
    setSettingsRoundsCappedByQuestions(config.roundsCappedByQuestions);
    setSettingsQuestionReuseEnabled(config.questionReuseEnabled);
    setSettingsZeroWeight(config.impostorWeights.zero);
    setSettingsOneWeight(config.impostorWeights.one);
    setSettingsTwoWeight(config.impostorWeights.two);
    setSettingsImpostorSurvivePoints(config.scoring.impostorSurvivesPoints);
    setSettingsCrewCatchPoints(config.scoring.crewVotesOutImpostorPoints);
    setSettingsPenaltyEnabled(config.scoring.crewVotedOutPenaltyEnabled);
    setSettingsPenaltyPoints(config.scoring.crewVotedOutPenaltyPoints);
    setSettingsDiscussionTimerSeconds(config.discussion.timerSeconds ?? 0);
  }

  async function loadSelectedPresetToForm() {
    const preset = settingsPresets.find((entry) => entry.name === selectedPresetName);
    if (preset === undefined) {
      setMessage("Preset not found.");
      return;
    }
    if (!window.confirm(`Load preset ${preset.name}? This replaces current form values.`)) {
      return;
    }
    applyPresetConfig(preset.config);
    setMessage(`Preset loaded: ${preset.name}`);
  }

  async function savePreset(name: string) {
    const normalized = normalizedPresetName(name);
    if (normalized.length < 1 || normalized.length > 32) {
      setMessage("Preset name must be 1-32 characters.");
      return;
    }
    if (!settingsFormValid) {
      setMessage("Fix settings errors before saving preset.");
      return;
    }
    const exists = settingsPresets.some((preset) => preset.name === normalized);
    if (exists && !window.confirm(`Preset ${normalized} already exists. Overwrite it?`)) {
      return;
    }
    const response = await fetch("/api/settings-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: normalized,
        config: {
          plannedRounds: settingsPlannedRounds,
          roundsCappedByQuestions: settingsRoundsCappedByQuestions,
          questionReuseEnabled: settingsQuestionReuseEnabled,
          impostorWeights: {
            zero: settingsZeroWeight,
            one: settingsOneWeight,
            two: settingsTwoWeight,
          },
          scoring: {
            impostorSurvivesPoints: settingsImpostorSurvivePoints,
            crewVotesOutImpostorPoints: settingsCrewCatchPoints,
            crewVotedOutPenaltyEnabled: settingsPenaltyEnabled,
            crewVotedOutPenaltyPoints: settingsPenaltyPoints,
          },
          discussion: {
            timerSeconds: settingsDiscussionTimerSeconds > 0 ? settingsDiscussionTimerSeconds : null,
          },
        },
      }),
    });
    if (!response.ok) {
      setMessage("Could not save preset. Check the name and settings values.");
      return;
    }
    await loadSettingsPresets();
    setSelectedPresetName(normalized);
    setMessage(`Preset saved: ${normalized}`);
  }

  async function deleteSelectedPreset() {
    const name = selectedPresetName.trim().toUpperCase();
    if (name === "DEFAULT") {
      setMessage("DEFAULT preset cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete preset ${name}?`)) {
      return;
    }
    const response = await fetch(`/api/settings-presets/${name}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Could not delete preset.");
      return;
    }
    await loadSettingsPresets();
    setMessage(`Preset deleted: ${name}`);
  }

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
                setSettingsPresets([]);
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
          You are: {isHost ? "Host" : "Player"}
        </p>
        <p>
          Lobby ID: <input value={activeLobbyId} onChange={(e) => setActiveLobbyId(e.target.value)} />{" "}
          <button type="button" onClick={joinLobby} disabled={activeLobbyId.trim().length < 1}>
            Join
          </button>
          <button type="button" onClick={createLobby} disabled={activeLobbyId.trim().length < 4}>
            Create
          </button>{" "}
          <button type="button" onClick={() => loadLobby(activeLobbyId)}>
            Refresh
          </button>{" "}
          <button type="button" onClick={copyInviteLink} disabled={activeLobbyId.trim().length < 1}>
            Copy Invite Link
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
              disabled={removePlayerId.trim().length < 1}
              onClick={() => runCommand({ type: "remove_player", payload: { playerId: removePlayerId } })}
            >
              Remove
            </button>
          </p>
        ) : null}
        {isHost && (snapshot?.phase === "setup" || snapshot?.phase === "round_result") ? (
          <div>
            <h3>Host Settings</h3>
            <p>
              Preset:{" "}
              <select value={selectedPresetName} onChange={(e) => setSelectedPresetName(e.target.value)}>
                {settingsPresets.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>{" "}
              <button type="button" onClick={loadSelectedPresetToForm}>
                Load Preset
              </button>{" "}
              <button
                type="button"
                disabled={!settingsFormValid}
                onClick={() => savePreset("DEFAULT")}
              >
                Save as DEFAULT
              </button>{" "}
              <button type="button" onClick={deleteSelectedPreset}>
                Delete Preset
              </button>
            </p>
            <p>
              New preset name:{" "}
              <input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />{" "}
              <button type="button" disabled={!settingsFormValid} onClick={() => savePreset(newPresetName)}>
                Save as New Preset
              </button>
            </p>
            <p>
              Planned rounds (5-30):{" "}
              <input
                type="number"
                min={5}
                max={30}
                value={settingsPlannedRounds}
                onChange={(e) => setSettingsPlannedRounds(Number(e.target.value))}
              />
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={settingsRoundsCappedByQuestions}
                  onChange={(e) => setSettingsRoundsCappedByQuestions(e.target.checked)}
                />{" "}
                Cap rounds by question pool size
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={settingsQuestionReuseEnabled}
                  onChange={(e) => setSettingsQuestionReuseEnabled(e.target.checked)}
                />{" "}
                Allow question reuse in game
              </label>
            </p>
            <p>
              Impostor weights: 0={impostorWeightPercent(settingsZeroWeight)} 1=
              {impostorWeightPercent(settingsOneWeight)} 2={impostorWeightPercent(settingsTwoWeight)}
            </p>
            {!impostorWeightsValid ? (
              <p>Impostor weights must sum to 100%. Current total: {(impostorWeightSum * 100).toFixed(2)}%</p>
            ) : null}
            <p>
              0 impostor:{" "}
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={settingsZeroWeight}
                onChange={(e) => setSettingsZeroWeight(Number(e.target.value))}
              />{" "}
              1 impostor:{" "}
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={settingsOneWeight}
                onChange={(e) => setSettingsOneWeight(Number(e.target.value))}
              />{" "}
              2 impostor:{" "}
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={settingsTwoWeight}
                onChange={(e) => setSettingsTwoWeight(Number(e.target.value))}
              />
            </p>
            <p>
              Scoring: impostor survives{" "}
              <input
                type="number"
                value={settingsImpostorSurvivePoints}
                onChange={(e) => setSettingsImpostorSurvivePoints(Number(e.target.value))}
              />{" "}
              crew catches impostor{" "}
              <input
                type="number"
                value={settingsCrewCatchPoints}
                onChange={(e) => setSettingsCrewCatchPoints(Number(e.target.value))}
              />
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={settingsPenaltyEnabled}
                  onChange={(e) => setSettingsPenaltyEnabled(e.target.checked)}
                />{" "}
                Enable voted-out crew penalty
              </label>{" "}
              penalty points{" "}
              <input
                type="number"
                value={settingsPenaltyPoints}
                onChange={(e) => setSettingsPenaltyPoints(Number(e.target.value))}
              />
            </p>
            <p>
              Discussion timer seconds (0 = no timer):{" "}
              <input
                type="number"
                min={0}
                max={600}
                value={settingsDiscussionTimerSeconds}
                onChange={(e) => setSettingsDiscussionTimerSeconds(Number(e.target.value))}
              />
            </p>
            {!discussionTimerValid ? (
              <p>Discussion timer must be an integer between 0 and 600.</p>
            ) : null}
            <p>
              Round eligibility (for next auto-start round):{" "}
              <select
                value={roundEligibilityEnabled ? "on" : "off"}
                onChange={(e) => setRoundEligibilityEnabled(e.target.value === "on")}
              >
                <option value="on">ON</option>
                <option value="off">OFF</option>
              </select>
            </p>
            <p>
              <button type="button" onClick={saveSettings} disabled={!settingsFormValid}>
                Save Settings
              </button>
            </p>
          </div>
        ) : null}

        <h2>Round</h2>
        <p className="phase-guide">{phaseInstruction}</p>
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
        {snapshot?.phase === "game_over" && snapshot.winnerSummary !== null ? (
          <div>
            <p>Game over.</p>
            <p>
              Winner(s):{" "}
              {snapshot.winnerSummary.winnerPlayerIds
                .map((playerId) => snapshot.players.find((player) => player.id === playerId)?.displayName ?? playerId)
                .join(", ")}
            </p>
            <p>Win reason: {snapshot.winnerSummary.reason}</p>
          </div>
        ) : null}
        {isHost && canHostStartRound ? (
          <p>
            Start readiness: {connectedPlayers.length}/4+ connected players required
            {connectedPlayers.length < 4
              ? " (need more connected players)"
              : " (ready to start, if question pool has available pairs)"}
          </p>
        ) : null}

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
        {round?.phase === "discussion" ? (
          <p>
            Discussion timer:{" "}
            {round.discussionDeadlineMs === null
              ? "No timer (host ends discussion)"
              : `${Math.max(0, Math.ceil((round.discussionDeadlineMs - nowMs) / 1000))}s remaining`}
          </p>
        ) : null}
        {round?.phase === "prompting" ? <p>Answer progress: {roundAnswerProgress}</p> : null}
        {round?.phase === "voting" ? <p>Vote progress: {roundVoteProgress}</p> : null}

        <h2>Actions</h2>
        <p>{message}</p>
        <p>
          {canHostStartRound ? (
            <button type="button" onClick={startAutoRound} disabled={!canHostAttemptStartRound}>
              Start Round (Host)
            </button>
          ) : null}{" "}
          {canHostRestartGame ? (
            <button type="button" onClick={() => runCommand({ type: "restart_game", payload: {} })}>
              Play Again (Host)
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
          {isHost && round?.phase === "discussion" && round.discussionDeadlineMs !== null ? (
            <>
              {" "}
              <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 30 } })}>
                +30s
              </button>{" "}
              <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 60 } })}>
                +60s
              </button>
            </>
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

function describeCommandError(code: string, fallbackMessage: string): string {
  const known: Record<string, string> = {
    forbidden: "Only the host can do that.",
    invalid_phase: "That action is not available in the current phase.",
    missing_answers: "Waiting for all active players to submit answers.",
    missing_votes: "Waiting for all active players to vote.",
    missing_tiebreak: "A tie was detected. Host must resolve the tie.",
    invalid_round: "Round settings are invalid for current players/questions.",
    invalid_settings: "Some settings are invalid. Check rounds, weights, and scoring values.",
    insufficient_players: "At least 4 active players are required.",
    question_pool_empty: "No available question pairs in the lobby pool.",
    player_not_active: "That player is not active in this round.",
    vote_locked: "Vote changes are disabled for this round.",
    self_vote_forbidden: "You cannot vote for yourself.",
    game_not_found: "This lobby no longer exists.",
  };
  const translated = known[code];
  if (translated !== undefined) {
    return translated;
  }
  return `Action failed: ${fallbackMessage}`;
}
