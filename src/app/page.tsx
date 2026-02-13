"use client";

import { useEffect, useMemo, useState } from "react";

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

type LobbyListItem = {
  lobbyId: string;
  phase: string;
  status: string;
  playerCount: number;
  connectedPlayerCount: number;
  hostDisplayName: string | null;
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

type MainView = "home" | "lobbies" | "pairs";

export default function HomePage() {
  const [message, setMessage] = useState<string>("Log in to begin.");
  const [session, setSession] = useState<Session | null>(null);
  const [mainView, setMainView] = useState<MainView>("home");
  const [showHostAdmin, setShowHostAdmin] = useState<boolean>(false);

  const [authMode, setAuthMode] = useState<"register" | "login">("login");
  const [authUsername, setAuthUsername] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");

  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [activeLobbyId, setActiveLobbyId] = useState<string>("");
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([]);
  const [removePlayerId, setRemovePlayerId] = useState<string>("");
  const [answerText, setAnswerText] = useState<string>("");
  const [voteTargetId, setVoteTargetId] = useState<string>("");
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
      setMainView("lobbies");
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
    if (activeLobbyId.trim() === "" || session === null) {
      return;
    }

    const source = new EventSource(`/api/games/${activeLobbyId}/events`);
    source.onopen = () => setRealtimeConnected(true);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; state?: LobbySnapshot };
        if (payload.type === "state" && payload.state !== undefined) {
          setSnapshot(payload.state);
        }
      } catch {
        // ignore malformed payload
      }
    };
    source.onerror = () => setRealtimeConnected(false);

    return () => {
      source.close();
      setRealtimeConnected(false);
    };
  }, [activeLobbyId, session]);

  useEffect(() => {
    if (session !== null) {
      void loadQuestionPairs();
      void loadSettingsPresets();
      void loadLobbies();
    }
  }, [session]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const me = snapshot?.players.find((player) => player.id === session?.userId) ?? null;
  const isHost = me?.isHost ?? false;
  const round = snapshot?.currentRound ?? null;
  const activePlayerIds = round?.activePlayerIds ?? [];
  const voteTargets = snapshot?.players.filter((player) => activePlayerIds.includes(player.id) && player.id !== session?.userId) ?? [];
  const canSubmitAnswer = round?.phase === "prompting" && (snapshot?.viewerRound?.isActive ?? false);
  const canCastVote = round?.phase === "voting" && activePlayerIds.includes(session?.userId ?? "");
  const canHostStartRound = isHost && (snapshot?.phase === "setup" || snapshot?.phase === "round_result");
  const canHostRevealQuestion = isHost && round?.phase === "prompting";
  const canHostRevealNextAnswer = isHost && round?.phase === "reveal" && round.revealedAnswerCount < round.activePlayerIds.length;
  const canHostStartDiscussion = isHost && round?.phase === "reveal" && round.revealedAnswerCount >= round.activePlayerIds.length;
  const canHostEndDiscussion = isHost && round?.phase === "discussion";
  const canHostCloseVoting = isHost && round?.phase === "voting";
  const canHostFinalizeRound = isHost && snapshot?.phase === "round_result";
  const canHostRestartGame = isHost && snapshot?.phase === "game_over";
  const removablePlayers = (snapshot?.players ?? []).filter((player) => player.id !== session?.userId);
  const connectedPlayers = (snapshot?.players ?? []).filter((player) => player.connected);
  const canHostAttemptStartRound = canHostStartRound && connectedPlayers.length >= 4;

  const roundAnswerProgress = round === null ? null : `${round.answersSubmittedBy.length}/${round.activePlayerIds.length}`;
  const roundVoteProgress = round === null ? null : `${round.votesSubmittedBy.length}/${round.activePlayerIds.length}`;

  const phaseInstruction = (() => {
    if (session === null) {
      return "Create an account or log in to start.";
    }
    if (snapshot === null) {
      return "Join or create a lobby, then invite your friends.";
    }
    if (snapshot.phase === "setup") {
      return isHost
        ? "Review settings, then start the game when 4+ players are connected."
        : "Waiting for host to start the game.";
    }
    if (round === null) {
      return "Round state is syncing.";
    }
    if (round.phase === "prompting") {
      return snapshot.viewerRound?.isActive
        ? "Submit your answer. Round continues when all active players submit."
        : "You are sat out this round.";
    }
    if (round.phase === "reveal") {
      return "Watch reveals, discuss aloud, then vote.";
    }
    if (round.phase === "discussion") {
      return "Discussion in progress. Host can end or extend timer.";
    }
    if (round.phase === "voting") {
      return snapshot.viewerRound?.isActive
        ? "Vote now. Voting is mandatory unless host force-closes with missing votes."
        : "Waiting for active players to vote.";
    }
    if (snapshot.phase === "round_result") {
      return isHost ? "Finalize round to continue." : "Waiting for host to continue.";
    }
    if (snapshot.phase === "game_over") {
      return isHost ? "Game over. Use Play Again to restart." : "Game over.";
    }
    return "Follow host prompts.";
  })();

  const hasValidVoteTarget = voteTargets.some((target) => target.id === voteTargetId);

  useEffect(() => {
    if (voteTargets.length === 0) {
      setVoteTargetId("");
      return;
    }
    if (!voteTargets.some((target) => target.id === voteTargetId)) {
      setVoteTargetId(voteTargets[0]?.id ?? "");
    }
  }, [voteTargetId, voteTargets]);

  useEffect(() => {
    if (removablePlayers.length === 0) {
      setRemovePlayerId("");
      return;
    }
    if (!removablePlayers.some((player) => player.id === removePlayerId)) {
      setRemovePlayerId(removablePlayers[0]?.id ?? "");
    }
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

  const impostorWeightSum = settingsZeroWeight + settingsOneWeight + settingsTwoWeight;
  const impostorWeightsValid = Math.abs(impostorWeightSum - 1) <= 0.000001;
  const plannedRoundsValid = Number.isInteger(settingsPlannedRounds) && settingsPlannedRounds >= 5 && settingsPlannedRounds <= 30;
  const discussionTimerValid =
    Number.isInteger(settingsDiscussionTimerSeconds) &&
    settingsDiscussionTimerSeconds >= 0 &&
    settingsDiscussionTimerSeconds <= 600;
  const settingsFormValid = plannedRoundsValid && impostorWeightsValid && discussionTimerValid;

  const canShowLobbyRoom = snapshot !== null && mainView === "lobbies";
  const isInSetup = snapshot?.phase === "setup" || snapshot?.phase === "round_result";
  const isInRound = snapshot !== null && !isInSetup;

  async function authenticate() {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: authMode, username: authUsername, password: authPassword }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Auth failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    const payload = (await response.json()) as { session: Session };
    setSession(payload.session);
    setMessage(`Logged in as ${payload.session.username}.`);
    setMainView("home");
    await loadQuestionPairs();
    await loadSettingsPresets();
    await loadLobbies();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setSession(null);
    setSnapshot(null);
    setLobbies([]);
    setMainView("home");
    setMessage("Logged out.");
  }

  async function loadLobbies() {
    const response = await fetch("/api/lobbies", { method: "GET" });
    if (!response.ok) {
      setLobbies([]);
      return;
    }
    const payload = (await response.json()) as { lobbies: LobbyListItem[] };
    setLobbies(payload.lobbies);
  }

  async function createLobby() {
    const response = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: activeLobbyId }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Create failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setMessage(`Lobby ${activeLobbyId} created.`);
    await loadLobby(activeLobbyId);
    await loadLobbies();
  }

  async function joinLobby(targetLobbyId: string = activeLobbyId) {
    const response = await fetch(`/api/lobbies/${targetLobbyId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Join failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setActiveLobbyId(targetLobbyId);
    setMessage(`Joined ${targetLobbyId}.`);
    await loadLobby(targetLobbyId);
    await loadLobbies();
  }

  async function deleteLobby() {
    const response = await fetch(`/api/lobbies/${activeLobbyId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setMessage(`Delete failed: ${payload.error} (${payload.message ?? ""})`);
      return;
    }

    setSnapshot(null);
    setMessage(`Lobby ${activeLobbyId} deleted.`);
    await loadLobbies();
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
    setActiveLobbyId(lobbyId);
    setMessage(`Loaded lobby ${lobbyId}.`);
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

  async function runCommand(command: CommandPayload) {
    const response = await fetch(`/api/games/${activeLobbyId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    await loadLobbies();
  }

  async function resolveTie(choice: "auto" | string) {
    if (tieCandidates.length < 2) {
      setMessage("Tie resolution unavailable.");
      return;
    }

    const loserId = choice === "auto" ? tieCandidates[Math.floor(Math.random() * tieCandidates.length)] : choice;
    if (loserId === undefined) {
      setMessage("Tie resolution failed: no candidate selected.");
      return;
    }

    await runCommand({
      type: "close_voting",
      payload: { allowMissingVotes: false, tieBreakLoserId: loserId },
    });
  }

  async function startAutoRound() {
    await runCommand({
      type: "start_round_auto",
      payload: { roundPolicy: { eligibilityEnabled: roundEligibilityEnabled } },
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
    applyPresetConfig(preset.config);
    setMessage(`Preset loaded: ${preset.name}`);
  }

  function normalizedPresetName(name: string): string {
    return name.trim().toUpperCase();
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

    const response = await fetch(`/api/settings-presets/${name}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Could not delete preset.");
      return;
    }
    await loadSettingsPresets();
    setMessage(`Preset deleted: ${name}`);
  }

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

  const myScore = useMemo(() => {
    if (session === null || snapshot === null) {
      return 0;
    }
    return snapshot.scoreboard[session.userId]?.totalPoints ?? 0;
  }, [session, snapshot]);

  return (
    <main>
      <div className="container">
        <h1>Social Deduction Games</h1>
        <p>{session === null ? "Sign in to play." : `Logged in as ${session.username}`}</p>
        <p className="phase-guide">{phaseInstruction}</p>

        {session === null ? (
          <section>
            <h2>Login</h2>
            <p>
              Mode:{" "}
              <select value={authMode} onChange={(event) => setAuthMode(event.target.value as "register" | "login")}>
                <option value="login">login</option>
                <option value="register">register</option>
              </select>
            </p>
            <p>
              Username: <input value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} />
            </p>
            <p>
              Password:{" "}
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </p>
            <p>
              <button type="button" onClick={authenticate} disabled={authUsername.trim().length < 2 || authPassword.length < 8}>
                Continue
              </button>
            </p>
            <p>{message}</p>
          </section>
        ) : (
          <>
            <section className="menu-row">
              <button type="button" onClick={() => setMainView("home")}>Main Menu</button>
              <button type="button" onClick={() => setMainView("lobbies")}>Current Lobbies</button>
              <button type="button" onClick={() => setMainView("pairs")}>My Question Pairs</button>
              <button type="button" onClick={logout}>Logout</button>
            </section>

            {mainView === "home" ? (
              <section>
                <h2>Main Menu</h2>
                <p>Choose a section:</p>
                <p>
                  <button type="button" onClick={() => setMainView("lobbies")}>Go To Lobbies</button>{" "}
                  <button type="button" onClick={() => setMainView("pairs")}>Go To Question Pairs</button>
                </p>
                <p>Realtime: {realtimeConnected ? "connected" : "disconnected"}</p>
                <p>Your score in active lobby: {myScore}</p>
              </section>
            ) : null}

            {mainView === "pairs" ? (
              <section>
                <h2>My Question Pairs</h2>
                <p>
                  Prompt A: <input value={promptAText} onChange={(event) => setPromptAText(event.target.value)} />
                  <select value={promptATarget} onChange={(event) => setPromptATarget(event.target.value as "crew" | "impostor" | "both")}>
                    <option value="crew">crew</option>
                    <option value="impostor">impostor</option>
                    <option value="both">both</option>
                  </select>
                </p>
                <p>
                  Prompt B: <input value={promptBText} onChange={(event) => setPromptBText(event.target.value)} />
                  <select value={promptBTarget} onChange={(event) => setPromptBTarget(event.target.value as "crew" | "impostor" | "both")}>
                    <option value="crew">crew</option>
                    <option value="impostor">impostor</option>
                    <option value="both">both</option>
                  </select>{" "}
                  <button type="button" onClick={createQuestionPair}>Add Pair</button>{" "}
                  <button type="button" onClick={loadQuestionPairs}>Refresh</button>
                </p>
                <p>Future: category/tag packs for question pools on lobby join.</p>
                {questionPairs.map((pair) => (
                  <p key={pair.id}>
                    A[{pair.promptA.target}] {pair.promptA.text} | B[{pair.promptB.target}] {pair.promptB.text}{" "}
                    <button type="button" onClick={() => deleteQuestionPair(pair.id)}>Delete</button>
                  </p>
                ))}
              </section>
            ) : null}

            {mainView === "lobbies" ? (
              <section>
                <h2>Current Lobbies</h2>
                <p>
                  Lobby ID:{" "}
                  <input value={activeLobbyId} onChange={(event) => setActiveLobbyId(event.target.value)} />
                  <button type="button" onClick={createLobby} disabled={activeLobbyId.trim().length < 4}>Create</button>{" "}
                  <button type="button" onClick={() => joinLobby(activeLobbyId)} disabled={activeLobbyId.trim().length < 1}>Join</button>{" "}
                  <button type="button" onClick={loadLobbies}>Refresh List</button>
                </p>

                <div className="card">
                  <p>Available lobbies:</p>
                  {lobbies.length === 0 ? <p>No lobbies found.</p> : null}
                  {lobbies.map((lobby) => (
                    <p key={lobby.lobbyId}>
                      {lobby.lobbyId} | {lobby.connectedPlayerCount}/{lobby.playerCount} connected | {lobby.phase} | host: {lobby.hostDisplayName ?? "unknown"}{" "}
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveLobbyId(lobby.lobbyId);
                          await joinLobby(lobby.lobbyId);
                        }}
                      >
                        Join
                      </button>{" "}
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveLobbyId(lobby.lobbyId);
                          await loadLobby(lobby.lobbyId);
                        }}
                      >
                        View
                      </button>
                    </p>
                  ))}
                </div>

                {canShowLobbyRoom ? (
                  <div className={isInRound ? "layout-grid" : ""}>
                    <div>
                      <h3>Lobby: {snapshot?.lobbyId ?? "(none)"}</h3>
                      <p>
                        Status: {snapshot?.status ?? "(none)"} | Phase: {snapshot?.phase ?? "(none)"} | Round {snapshot?.completedRounds ?? 0}/{snapshot?.plannedRounds ?? 0}
                      </p>
                      <p>
                        <button type="button" onClick={() => void loadLobby(activeLobbyId)}>Refresh Lobby</button>{" "}
                        <button type="button" onClick={copyInviteLink} disabled={activeLobbyId.trim().length < 1}>Copy Invite Link</button>{" "}
                        <button type="button" onClick={() => runCommand({ type: "leave_lobby", payload: {} })}>Leave Lobby</button>
                      </p>
                      {isHost ? (
                        <p>
                          <button type="button" onClick={deleteLobby}>Delete Lobby</button>{" "}
                          <button type="button" onClick={() => setShowHostAdmin((value) => !value)}>
                            {showHostAdmin ? "Hide" : "Show"} Host Admin
                          </button>
                        </p>
                      ) : null}

                      <h3>Players</h3>
                      {(snapshot?.players ?? []).map((player) => (
                        <p key={player.id}>
                          {player.displayName}
                          {player.isHost ? " (host)" : ""}
                          {player.connected ? "" : " (offline)"}
                        </p>
                      ))}

                      {snapshot?.viewerRound?.isActive ? (
                        <p>
                          Your role: {snapshot.viewerRound.role} | Prompt: {snapshot.viewerRound.prompt ?? "(none)"}
                        </p>
                      ) : (
                        <p>{snapshot?.viewerRound === null ? "No active round." : "You are sat out this round."}</p>
                      )}

                      {isInSetup ? (
                        <>
                          <h3>Host Lobby Setup</h3>
                          <p>Start readiness: {connectedPlayers.length}/4 connected players</p>
                          {isHost ? (
                            <>
                              <p>
                                Preset:{" "}
                                <select value={selectedPresetName} onChange={(event) => setSelectedPresetName(event.target.value)}>
                                  {settingsPresets.map((preset) => (
                                    <option key={preset.name} value={preset.name}>{preset.name}</option>
                                  ))}
                                </select>{" "}
                                <button type="button" onClick={loadSelectedPresetToForm}>Load Preset</button>{" "}
                                <button type="button" disabled={!settingsFormValid} onClick={() => savePreset("DEFAULT")}>Save as DEFAULT</button>{" "}
                                <button type="button" onClick={deleteSelectedPreset}>Delete Preset</button>
                              </p>
                              <p>
                                New preset name: <input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} />
                                <button type="button" disabled={!settingsFormValid} onClick={() => savePreset(newPresetName)}>Save New Preset</button>
                              </p>
                              <p>
                                Planned rounds (5-30):{" "}
                                <input
                                  type="number"
                                  min={5}
                                  max={30}
                                  value={settingsPlannedRounds}
                                  onChange={(event) => setSettingsPlannedRounds(Number(event.target.value))}
                                />
                              </p>
                              <p>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={settingsRoundsCappedByQuestions}
                                    onChange={(event) => setSettingsRoundsCappedByQuestions(event.target.checked)}
                                  />{" "}
                                  Cap rounds by question pool size
                                </label>
                              </p>
                              <p>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={settingsQuestionReuseEnabled}
                                    onChange={(event) => setSettingsQuestionReuseEnabled(event.target.checked)}
                                  />{" "}
                                  Allow question reuse in game
                                </label>
                              </p>
                              <p>
                                Impostor weights (must total 1.0): 0={settingsZeroWeight.toFixed(3)} 1={settingsOneWeight.toFixed(3)} 2={settingsTwoWeight.toFixed(3)}
                              </p>
                              <p>
                                0: <input type="number" step="0.001" min={0} max={1} value={settingsZeroWeight} onChange={(event) => setSettingsZeroWeight(Number(event.target.value))} />
                                1: <input type="number" step="0.001" min={0} max={1} value={settingsOneWeight} onChange={(event) => setSettingsOneWeight(Number(event.target.value))} />
                                2: <input type="number" step="0.001" min={0} max={1} value={settingsTwoWeight} onChange={(event) => setSettingsTwoWeight(Number(event.target.value))} />
                              </p>
                              {!impostorWeightsValid ? <p>Weight total must be 1.0. Current: {impostorWeightSum.toFixed(3)}</p> : null}
                              <p>
                                Impostor survives points:{" "}
                                <input type="number" value={settingsImpostorSurvivePoints} onChange={(event) => setSettingsImpostorSurvivePoints(Number(event.target.value))} />
                                Crew catches impostor points:{" "}
                                <input type="number" value={settingsCrewCatchPoints} onChange={(event) => setSettingsCrewCatchPoints(Number(event.target.value))} />
                              </p>
                              <p>
                                <label>
                                  <input type="checkbox" checked={settingsPenaltyEnabled} onChange={(event) => setSettingsPenaltyEnabled(event.target.checked)} />
                                  Enable crew voted-out penalty
                                </label>{" "}
                                Penalty points:{" "}
                                <input type="number" value={settingsPenaltyPoints} onChange={(event) => setSettingsPenaltyPoints(Number(event.target.value))} />
                              </p>
                              <p>
                                Discussion timer seconds (0=no timer):{" "}
                                <input
                                  type="number"
                                  min={0}
                                  max={600}
                                  value={settingsDiscussionTimerSeconds}
                                  onChange={(event) => setSettingsDiscussionTimerSeconds(Number(event.target.value))}
                                />
                              </p>
                              {!discussionTimerValid ? <p>Discussion timer must be 0 to 600.</p> : null}
                              <p>
                                Round eligibility default: {roundEligibilityEnabled ? "ON" : "OFF"}{" "}
                                <select value={roundEligibilityEnabled ? "on" : "off"} onChange={(event) => setRoundEligibilityEnabled(event.target.value === "on")}>
                                  <option value="on">ON</option>
                                  <option value="off">OFF</option>
                                </select>
                              </p>
                              <p>
                                <button type="button" onClick={saveSettings} disabled={!settingsFormValid}>Save Settings</button>{" "}
                                <button type="button" onClick={startAutoRound} disabled={!canHostAttemptStartRound}>Start Game</button>
                              </p>
                            </>
                          ) : (
                            <p>Waiting for host to configure settings and start.</p>
                          )}
                        </>
                      ) : (
                        <>
                          <h3>Game</h3>
                          <p>Answer progress: {roundAnswerProgress ?? "-"} | Vote progress: {roundVoteProgress ?? "-"}</p>

                          {round !== null && round.trueQuestion !== null ? <p>True question: {round.trueQuestion}</p> : null}

                          {round !== null && round.revealedAnswers !== null ? (
                            <div className="card">
                              <p>Revealed answers:</p>
                              {round.revealedAnswers.map((entry) => (
                                <p key={entry.playerId}>{entry.displayName}: {entry.answer}</p>
                              ))}
                            </div>
                          ) : null}

                          {round !== null && round.revealedRoles !== null ? (
                            <div className="card">
                              <p>Roles:</p>
                              {Object.entries(round.revealedRoles).map(([playerId, role]) => (
                                <p key={playerId}>{snapshot?.players.find((player) => player.id === playerId)?.displayName ?? playerId}: {role}</p>
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

                          <p>
                            {canSubmitAnswer ? (
                              <>
                                Answer: <input value={answerText} onChange={(event) => setAnswerText(event.target.value)} />
                                <button type="button" onClick={() => runCommand({ type: "submit_answer", payload: { answer: answerText } })}>Submit Answer</button>
                              </>
                            ) : null}

                            {canCastVote ? (
                              <>
                                Vote target:{" "}
                                <select value={voteTargetId} onChange={(event) => setVoteTargetId(event.target.value)}>
                                  {voteTargets.map((target) => (
                                    <option key={target.id} value={target.id}>{target.displayName}</option>
                                  ))}
                                </select>
                                <button type="button" disabled={!hasValidVoteTarget} onClick={() => runCommand({ type: "cast_vote", payload: { targetId: voteTargetId } })}>
                                  Cast Vote
                                </button>
                              </>
                            ) : null}

                            {canHostRestartGame ? (
                              <button type="button" onClick={() => runCommand({ type: "restart_game", payload: {} })}>Play Again</button>
                            ) : null}
                          </p>
                        </>
                      )}

                      <h3>Scoreboard</h3>
                      {(snapshot?.players ?? []).map((player) => (
                        <p key={player.id}>{player.displayName}: {snapshot?.scoreboard[player.id]?.totalPoints ?? 0} points</p>
                      ))}
                      {snapshot?.phase === "game_over" && snapshot.winnerSummary !== null ? (
                        <p>
                          Winner(s): {snapshot.winnerSummary.winnerPlayerIds.map((id) => snapshot.players.find((player) => player.id === id)?.displayName ?? id).join(", ")} ({snapshot.winnerSummary.reason})
                        </p>
                      ) : null}
                    </div>

                    {isHost && isInRound && showHostAdmin ? (
                      <aside className="side-panel">
                        <h3>Host Admin</h3>
                        <p>Round phase: {round?.phase ?? "-"}</p>
                        {round?.phase === "prompting" ? (
                          <>
                            <p>Answer status:</p>
                            {round.activePlayerIds.map((playerId) => {
                              const playerName = snapshot?.players.find((player) => player.id === playerId)?.displayName ?? playerId;
                              const answered = round.answersSubmittedBy.includes(playerId);
                              return <p key={playerId}>{playerName}: {answered ? "submitted" : "waiting"}</p>;
                            })}
                          </>
                        ) : null}

                        {round?.phase === "voting" ? (
                          <>
                            <p>Vote status:</p>
                            {round.activePlayerIds.map((playerId) => {
                              const playerName = snapshot?.players.find((player) => player.id === playerId)?.displayName ?? playerId;
                              const voted = round.votesSubmittedBy.includes(playerId);
                              return <p key={playerId}>{playerName}: {voted ? "voted" : "waiting"}</p>;
                            })}
                          </>
                        ) : null}

                        <p>
                          {canHostRevealQuestion ? <button type="button" onClick={() => runCommand({ type: "reveal_question", payload: {} })}>Reveal Question</button> : null}
                          {canHostRevealNextAnswer ? <button type="button" onClick={() => runCommand({ type: "reveal_next_answer", payload: {} })}>Reveal Next Answer</button> : null}
                          {canHostStartDiscussion ? <button type="button" onClick={() => runCommand({ type: "start_discussion", payload: {} })}>Start Discussion</button> : null}
                          {canHostEndDiscussion ? <button type="button" onClick={() => runCommand({ type: "end_discussion", payload: {} })}>End Discussion</button> : null}
                        </p>

                        {isHost && round?.phase === "discussion" && round.discussionDeadlineMs !== null ? (
                          <p>
                            <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 30 } })}>+30s</button>{" "}
                            <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 60 } })}>+60s</button>
                          </p>
                        ) : null}

                        <p>
                          {canHostCloseVoting ? (
                            <button type="button" onClick={() => runCommand({ type: "close_voting", payload: { allowMissingVotes: false } })}>Close Voting</button>
                          ) : null}
                          {canHostFinalizeRound ? (
                            <button type="button" onClick={() => runCommand({ type: "finalize_round", payload: {} })}>Finalize Round</button>
                          ) : null}
                        </p>

                        {canHostCloseVoting && tieCandidates.length >= 2 ? (
                          <div className="card">
                            <p>Tie detected:</p>
                            <p><button type="button" onClick={() => resolveTie("auto")}>Auto Resolve Randomly</button></p>
                            {tieCandidates.map((playerId) => {
                              const displayName = snapshot?.players.find((player) => player.id === playerId)?.displayName ?? playerId;
                              return (
                                <p key={playerId}>
                                  <button type="button" onClick={() => resolveTie(playerId)}>Eliminate {displayName}</button>
                                </p>
                              );
                            })}
                          </div>
                        ) : null}

                        {removablePlayers.length > 0 ? (
                          <p>
                            Remove player:{" "}
                            <select value={removePlayerId} onChange={(event) => setRemovePlayerId(event.target.value)}>
                              {removablePlayers.map((player) => (
                                <option key={player.id} value={player.id}>{player.displayName}</option>
                              ))}
                            </select>
                            <button type="button" disabled={removePlayerId.trim().length < 1} onClick={() => runCommand({ type: "remove_player", payload: { playerId: removePlayerId } })}>
                              Remove
                            </button>
                          </p>
                        ) : null}
                      </aside>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            <p>{message}</p>
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
