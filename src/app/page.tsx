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
  | { type: "transfer_host"; payload: { newHostId: string } }
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

type MainView = "lobbies" | "pairs";

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [mainView, setMainView] = useState<MainView>("lobbies");
  const [showHostAdmin, setShowHostAdmin] = useState<boolean>(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  const [authMode, setAuthMode] = useState<"register" | "login">("login");
  const [authUsername, setAuthUsername] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");

  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [activeLobbyId, setActiveLobbyId] = useState<string>("");
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([]);

  const [removePlayerId, setRemovePlayerId] = useState<string>("");
  const [transferHostId, setTransferHostId] = useState<string>("");
  const [answerText, setAnswerText] = useState<string>("");
  const [voteTargetId, setVoteTargetId] = useState<string>("");

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

  const [errorMessage, setErrorMessage] = useState<string>("");
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [showScoreboard, setShowScoreboard] = useState<boolean>(false);

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

    return () => {
      source.close();
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
  const transferableHostPlayers = (snapshot?.players ?? []).filter((player) => player.id !== session?.userId && player.connected);
  const connectedPlayers = (snapshot?.players ?? []).filter((player) => player.connected);
  const canHostAttemptStartRound = canHostStartRound && connectedPlayers.length >= 4;

  const roundAnswerProgress = round === null ? null : `${round.answersSubmittedBy.length}/${round.activePlayerIds.length}`;
  const roundVoteProgress = round === null ? null : `${round.votesSubmittedBy.length}/${round.activePlayerIds.length}`;

  const answerPct = round === null || round.activePlayerIds.length === 0
    ? 0
    : Math.round((round.answersSubmittedBy.length / round.activePlayerIds.length) * 100);
  const votePct = round === null || round.activePlayerIds.length === 0
    ? 0
    : Math.round((round.votesSubmittedBy.length / round.activePlayerIds.length) * 100);

  const isSetupRoom = snapshot?.phase === "setup";
  const inGameRoom = snapshot !== null && snapshot.phase !== "setup";

  const minimalPlayerText = (() => {
    if (snapshot === null) {
      return "Join or create a lobby.";
    }
    if (round === null) {
      return isSetupRoom ? "Waiting in lobby." : "Round is loading.";
    }
    if (round.phase === "prompting") {
      return snapshot.viewerRound?.isActive
        ? "Answer your prompt."
        : "You are sitting out this round.";
    }
    if (round.phase === "reveal") {
      return "Listen and review revealed answers.";
    }
    if (round.phase === "discussion") {
      return "Discuss with players in person or call.";
    }
    if (round.phase === "voting") {
      return snapshot.viewerRound?.isActive
        ? "Vote for one player."
        : "Waiting for active players to vote.";
    }
    if (snapshot.phase === "round_result") {
      return "Round result shown.";
    }
    if (snapshot.phase === "game_over") {
      return "Game over.";
    }
    return "";
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
    if (transferableHostPlayers.length === 0) {
      setTransferHostId("");
      return;
    }
    if (!transferableHostPlayers.some((player) => player.id === transferHostId)) {
      setTransferHostId(transferableHostPlayers[0]?.id ?? "");
    }
  }, [transferHostId, transferableHostPlayers]);

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

  const myScore = useMemo(() => {
    if (session === null || snapshot === null) {
      return 0;
    }
    return snapshot.scoreboard[session.userId]?.totalPoints ?? 0;
  }, [session, snapshot]);

  const roundDisplay = (() => {
    if (snapshot === null) {
      return "0/0";
    }
    if (snapshot.currentRound !== null) {
      return `${snapshot.currentRound.roundNumber}/${snapshot.plannedRounds}`;
    }
    return `${snapshot.completedRounds}/${snapshot.plannedRounds}`;
  })();

  async function authenticate() {
    setErrorMessage("");
    setInfoMessage("");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: authMode, username: authUsername, password: authPassword }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setErrorMessage(describeRequestError("auth", payload.error, payload.message));
      return;
    }

    const payload = (await response.json()) as { session: Session };
    setSession(payload.session);
    setMainView("lobbies");
    await loadQuestionPairs();
    await loadSettingsPresets();
    await loadLobbies();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setSession(null);
    setSnapshot(null);
    setLobbies([]);
    setMainView("lobbies");
    setErrorMessage("");
    setInfoMessage("");
  }

  async function loadLobbies() {
    setErrorMessage("");
    const response = await fetch("/api/lobbies", { method: "GET" });
    if (!response.ok) {
      setLobbies([]);
      return;
    }
    const payload = (await response.json()) as { lobbies: LobbyListItem[] };
    setLobbies(payload.lobbies);
  }

  async function createLobby() {
    setErrorMessage("");
    setInfoMessage("");
    const response = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: activeLobbyId }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setErrorMessage(describeRequestError("create_lobby", payload.error, payload.message));
      return;
    }

    await joinLobby(activeLobbyId);
    await loadLobbies();
  }

  async function joinLobby(targetLobbyId: string = activeLobbyId) {
    setErrorMessage("");
    setInfoMessage("");
    const response = await fetch(`/api/lobbies/${targetLobbyId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setErrorMessage(describeRequestError("join_lobby", payload.error, payload.message));
      return;
    }

    setActiveLobbyId(targetLobbyId);
    await loadLobby(targetLobbyId);
    await loadLobbies();
  }

  async function deleteLobby() {
    setErrorMessage("");
    setInfoMessage("");
    const response = await fetch(`/api/lobbies/${activeLobbyId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error: string; message?: string };
      setErrorMessage(describeRequestError("delete_lobby", payload.error, payload.message));
      return;
    }

    setSnapshot(null);
    await loadLobbies();
  }

  async function loadLobby(lobbyId: string = activeLobbyId) {
    setErrorMessage("");
    const response = await fetch(`/api/games/${lobbyId}`, { method: "GET" });
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setErrorMessage(payload.message ?? "Failed to load lobby.");
      setSnapshot(null);
      return;
    }

    const payload = (await response.json()) as LobbySnapshot;
    setSnapshot(payload);
    setActiveLobbyId(lobbyId);
  }

  async function copyInviteLink() {
    if (activeLobbyId.trim() === "") {
      setErrorMessage("Set a lobby ID before copying invite link.");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("lobby", activeLobbyId.trim());
    try {
      await navigator.clipboard.writeText(url.toString());
      setErrorMessage("");
      setInfoMessage("Invite link copied.");
    } catch {
      setErrorMessage("Clipboard unavailable. Copy URL from browser bar.");
    }
  }

  async function runCommand(command: CommandPayload) {
    setErrorMessage("");
    setInfoMessage("");
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
      setErrorMessage(describeCommandError(payload.error, payload.message));
      return;
    }

    const payload = (await response.json()) as { state: LobbySnapshot };
    setSnapshot(payload.state);
    setTieCandidates([]);
    const successMessage = describeCommandSuccess(command.type);
    if (successMessage !== null) {
      setInfoMessage(successMessage);
    }
    await loadLobbies();
  }

  async function resolveTie(choice: "auto" | string) {
    if (tieCandidates.length < 2) {
      setErrorMessage("Tie resolution unavailable.");
      return;
    }

    const loserId = choice === "auto" ? tieCandidates[Math.floor(Math.random() * tieCandidates.length)] : choice;
    if (loserId === undefined) {
      setErrorMessage("Tie resolution failed: no candidate selected.");
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
    setErrorMessage("");
    setInfoMessage("");
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
      setErrorMessage(describeRequestError("create_question_pair", payload.error, payload.message));
      return;
    }

    setPromptAText("");
    setPromptBText("");
    setInfoMessage("Question pair added.");
    await loadQuestionPairs();
  }

  async function deleteQuestionPair(pairId: string) {
    setErrorMessage("");
    setInfoMessage("");
    const response = await fetch(`/api/question-pairs/${pairId}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage("Could not delete that question pair.");
      return;
    }
    setInfoMessage("Question pair deleted.");
    await loadQuestionPairs();
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
      setErrorMessage("Preset not found.");
      return;
    }
    applyPresetConfig(preset.config);
    setErrorMessage("");
  }

  function normalizedPresetName(name: string): string {
    return name.trim().toUpperCase();
  }

  async function savePreset(name: string) {
    const normalized = normalizedPresetName(name);
    if (normalized.length < 1 || normalized.length > 32) {
      setErrorMessage("Preset name must be 1-32 characters.");
      return;
    }
    if (!settingsFormValid) {
      setErrorMessage("Fix settings errors before saving preset.");
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
      setErrorMessage("Could not save preset. Check the name and settings values.");
      return;
    }
    await loadSettingsPresets();
    setSelectedPresetName(normalized);
    setErrorMessage("");
  }

  async function deleteSelectedPreset() {
    const name = selectedPresetName.trim().toUpperCase();
    if (name === "DEFAULT") {
      setErrorMessage("DEFAULT preset cannot be deleted.");
      return;
    }

    const response = await fetch(`/api/settings-presets/${name}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage("Could not delete preset.");
      return;
    }
    await loadSettingsPresets();
    setErrorMessage("");
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

  function playerStatusForHost(playerId: string): "ok" | "x" | "na" {
    if (round === null) {
      return "na";
    }
    if (!round.activePlayerIds.includes(playerId)) {
      return "na";
    }
    if (round.phase === "prompting") {
      return round.answersSubmittedBy.includes(playerId) ? "ok" : "x";
    }
    if (round.phase === "voting") {
      return round.votesSubmittedBy.includes(playerId) ? "ok" : "x";
    }
    return "na";
  }

  return (
    <main>
      <div className="container">
        <header className="brand-row">
          <div>
            <h1 className="brand-title">Deduire</h1>
            <p className="muted">Social deduction party game</p>
          </div>
          {snapshot !== null ? <span className="lobby-badge">Lobby {snapshot.lobbyId}</span> : null}
        </header>

        {session === null ? (
          <section className="card auth-card">
            <h2>{authMode === "login" ? "Login" : "Register"}</h2>
            <p>
              Username
              <input value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} />
            </p>
            <p>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </p>
            <p>
              <button type="button" onClick={authenticate} disabled={authUsername.trim().length < 2 || authPassword.length < 8}>
                {authMode === "login" ? "Enter" : "Create Account"}
              </button>
            </p>
            {authMode === "login" ? (
              <p className="muted-inline">
                Need an account?{" "}
                <button type="button" className="link-btn" onClick={() => setAuthMode("register")}>
                  Register
                </button>
              </p>
            ) : (
              <p className="muted-inline">
                Already have an account?{" "}
                <button type="button" className="link-btn" onClick={() => setAuthMode("login")}>
                  Login
                </button>
              </p>
            )}
          </section>
        ) : (
          <>
            <nav className="menu-row">
              <button type="button" className={mainView === "lobbies" ? "tab-active" : ""} onClick={() => setMainView("lobbies")}>
                Current Lobbies
              </button>
              <button type="button" className={mainView === "pairs" ? "tab-active" : ""} onClick={() => setMainView("pairs")}>
                My Question Pairs
              </button>
              <button type="button" onClick={logout}>Logout</button>
            </nav>

            {mainView === "pairs" ? (
              <section className="card fade-in">
                <h2>My Question Pairs</h2>
                <p className="muted">Categories are planned next. For now, manage your full question bank.</p>
                <p>
                  Prompt A
                  <input value={promptAText} onChange={(event) => setPromptAText(event.target.value)} />
                  <select value={promptATarget} onChange={(event) => setPromptATarget(event.target.value as "crew" | "impostor" | "both")}>
                    <option value="crew">crew</option>
                    <option value="impostor">impostor</option>
                    <option value="both">both</option>
                  </select>
                </p>
                <p>
                  Prompt B
                  <input value={promptBText} onChange={(event) => setPromptBText(event.target.value)} />
                  <select value={promptBTarget} onChange={(event) => setPromptBTarget(event.target.value as "crew" | "impostor" | "both")}>
                    <option value="crew">crew</option>
                    <option value="impostor">impostor</option>
                    <option value="both">both</option>
                  </select>
                </p>
                <p>
                  <button type="button" onClick={createQuestionPair}>Add Pair</button>{" "}
                  <button type="button" onClick={loadQuestionPairs}>Refresh</button>
                </p>

                <div className="list-stack">
                  {questionPairs.map((pair) => (
                    <p key={pair.id} className="list-line">
                      A[{pair.promptA.target}] {pair.promptA.text}
                      <br />
                      B[{pair.promptB.target}] {pair.promptB.text}
                      <br />
                      <button type="button" onClick={() => deleteQuestionPair(pair.id)}>Delete</button>
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {mainView === "lobbies" ? (
              <section className="fade-in">
                <div className="card">
                  <h2>Current Lobbies</h2>
                  <p>
                    Lobby ID
                    <input value={activeLobbyId} onChange={(event) => setActiveLobbyId(event.target.value)} />
                  </p>
                  <p>
                    <button type="button" onClick={createLobby} disabled={activeLobbyId.trim().length < 4}>Create</button>{" "}
                    <button type="button" onClick={() => joinLobby(activeLobbyId)} disabled={activeLobbyId.trim().length < 1}>Join</button>{" "}
                    <button type="button" onClick={loadLobbies}>Refresh</button>
                  </p>

                  <div className="lobby-grid">
                    {lobbies.map((lobby) => (
                      <article key={lobby.lobbyId} className="lobby-card">
                        <h3>{lobby.lobbyId}</h3>
                        <p>Players {lobby.playerCount}</p>
                        <p>Host {lobby.hostDisplayName ?? "unknown"}</p>
                        <p>Phase {lobby.phase}</p>
                        <p>
                          <button
                            type="button"
                            onClick={() => {
                              void joinLobby(lobby.lobbyId);
                            }}
                          >
                            Join
                          </button>
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                {snapshot !== null ? (
                  <div className={inGameRoom && isHost ? "layout-grid" : "single-col"}>
                    <section className="card room-card">
                      <header className="room-header">
                        <div>
                          <h2>Lobby Room</h2>
                          <p className="muted">{minimalPlayerText}</p>
                        </div>
                        <div>
                          <p className="muted">Round {roundDisplay}</p>
                          <p>
                            <button type="button" onClick={copyInviteLink}>Copy Invite Link</button>{" "}
                            <button type="button" onClick={() => setShowScoreboard((value) => !value)}>
                              {showScoreboard ? "Hide" : "Show"} Scoreboard
                            </button>
                          </p>
                        </div>
                      </header>

                      <div className="table-wrap">
                        <div className="virtual-table">
                          {(snapshot.players ?? []).map((player) => {
                            const status = isHost ? playerStatusForHost(player.id) : "na";
                            const tokenClass = status === "ok" ? "status-ok" : status === "x" ? "status-x" : "status-na";
                            return (
                              <div key={player.id} className="seat">
                                <p className="seat-name">
                                  {player.displayName}{player.isHost ? " (H)" : ""}
                                </p>
                                {isHost ? <span className={`status-token ${tokenClass}`}>{status === "ok" ? "OK" : status === "x" ? "X" : "-"}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {isHost && round !== null && (round.phase === "prompting" || round.phase === "voting") ? (
                        <div className="card slim-card">
                          <p>{round.phase === "prompting" ? `Answers ${roundAnswerProgress}` : `Votes ${roundVoteProgress}`}</p>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${round.phase === "prompting" ? answerPct : votePct}%` }} />
                          </div>
                        </div>
                      ) : null}

                      {isSetupRoom ? (
                        <div className="card slim-card">
                          <h3>Host Setup</h3>
                          {isHost ? (
                            <>
                              <p>
                                Preset
                                <select value={selectedPresetName} onChange={(event) => setSelectedPresetName(event.target.value)}>
                                  {settingsPresets.map((preset) => (
                                    <option key={preset.name} value={preset.name}>{preset.name}</option>
                                  ))}
                                </select>
                              </p>
                              <p>
                                <button type="button" onClick={loadSelectedPresetToForm}>Load</button>{" "}
                                <button type="button" disabled={!settingsFormValid} onClick={() => savePreset("DEFAULT")}>Save Default</button>{" "}
                                <button type="button" onClick={() => setShowAdvancedSettings((value) => !value)}>
                                  {showAdvancedSettings ? "Hide" : "Edit"} Settings
                                </button>
                              </p>
                              <p>
                                <button type="button" onClick={startAutoRound} disabled={!canHostAttemptStartRound}>Start Game</button>
                              </p>

                              {showAdvancedSettings ? (
                                <div className="advanced-block">
                                  <p>
                                    New preset name
                                    <input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} />
                                    <button type="button" disabled={!settingsFormValid} onClick={() => savePreset(newPresetName)}>Save New</button>{" "}
                                    <button type="button" onClick={deleteSelectedPreset}>Delete Selected</button>
                                  </p>
                                  <p>
                                    Planned rounds
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
                                      />
                                      Cap rounds by question pool
                                    </label>
                                  </p>
                                  <p>
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={settingsQuestionReuseEnabled}
                                        onChange={(event) => setSettingsQuestionReuseEnabled(event.target.checked)}
                                      />
                                      Allow question reuse
                                    </label>
                                  </p>
                                  <p>
                                    Weights 0/1/2
                                    <input type="number" step="0.001" min={0} max={1} value={settingsZeroWeight} onChange={(event) => setSettingsZeroWeight(Number(event.target.value))} />
                                    <input type="number" step="0.001" min={0} max={1} value={settingsOneWeight} onChange={(event) => setSettingsOneWeight(Number(event.target.value))} />
                                    <input type="number" step="0.001" min={0} max={1} value={settingsTwoWeight} onChange={(event) => setSettingsTwoWeight(Number(event.target.value))} />
                                  </p>
                                  {!impostorWeightsValid ? <p className="warn">Weight total must equal 1.0.</p> : null}
                                  <p>
                                    Impostor survives points
                                    <input type="number" value={settingsImpostorSurvivePoints} onChange={(event) => setSettingsImpostorSurvivePoints(Number(event.target.value))} />
                                  </p>
                                  <p>
                                    Crew catches impostor points
                                    <input type="number" value={settingsCrewCatchPoints} onChange={(event) => setSettingsCrewCatchPoints(Number(event.target.value))} />
                                  </p>
                                  <p>
                                    <label>
                                      <input type="checkbox" checked={settingsPenaltyEnabled} onChange={(event) => setSettingsPenaltyEnabled(event.target.checked)} />
                                      Crew voted-out penalty
                                    </label>
                                    <input type="number" value={settingsPenaltyPoints} onChange={(event) => setSettingsPenaltyPoints(Number(event.target.value))} />
                                  </p>
                                  <p>
                                    Discussion seconds (0 = no timer)
                                    <input
                                      type="number"
                                      min={0}
                                      max={600}
                                      value={settingsDiscussionTimerSeconds}
                                      onChange={(event) => setSettingsDiscussionTimerSeconds(Number(event.target.value))}
                                    />
                                  </p>
                                  {!discussionTimerValid ? <p className="warn">Timer must be between 0 and 600.</p> : null}
                                  <p>
                                    Eligibility for owner sit-out
                                    <select value={roundEligibilityEnabled ? "on" : "off"} onChange={(event) => setRoundEligibilityEnabled(event.target.value === "on")}>
                                      <option value="on">ON</option>
                                      <option value="off">OFF</option>
                                    </select>
                                  </p>
                                  <p>
                                    <button type="button" onClick={saveSettings} disabled={!settingsFormValid}>Apply Settings</button>
                                  </p>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p>Waiting for host to start the game.</p>
                          )}
                        </div>
                      ) : null}

                      {inGameRoom ? (
                        <div className="card slim-card">
                          {snapshot.phase === "round_result" ? (
                            <div className="card slim-card">
                              <h3>Round Result</h3>
                              <p>
                                Eliminated:{" "}
                                {round?.eliminatedPlayerId === null || round?.eliminatedPlayerId === undefined
                                  ? "No one"
                                  : snapshot.players.find((player) => player.id === round.eliminatedPlayerId)?.displayName ?? round.eliminatedPlayerId}
                              </p>
                              {round?.revealedRoles !== null && round?.revealedRoles !== undefined ? (
                                <>
                                  {Object.entries(round.revealedRoles).map(([playerId, role]) => (
                                    <p key={playerId}>
                                      {snapshot.players.find((player) => player.id === playerId)?.displayName ?? playerId}: {role}
                                    </p>
                                  ))}
                                </>
                              ) : (
                                <p>Roles will appear once round result is finalized.</p>
                              )}
                            </div>
                          ) : null}

                          {round !== null && round.trueQuestion !== null ? <p>Question: {round.trueQuestion}</p> : null}
                          {snapshot.viewerRound?.isActive ? (
                            <p>Your prompt: {snapshot.viewerRound.prompt ?? "(none)"}</p>
                          ) : (
                            <p>{snapshot.viewerRound === null ? "No active round." : "You are sitting out this round."}</p>
                          )}

                          {canSubmitAnswer ? (
                            <p>
                              <input value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder="Your answer" />
                              <button type="button" onClick={() => runCommand({ type: "submit_answer", payload: { answer: answerText } })}>Submit</button>
                            </p>
                          ) : null}

                          {round?.revealedAnswers !== null && round?.revealedAnswers !== undefined ? (
                            <div>
                              {round.revealedAnswers.map((entry) => (
                                <p key={entry.playerId}>{entry.displayName}: {entry.answer}</p>
                              ))}
                            </div>
                          ) : null}

                          {round?.phase === "discussion" ? (
                            <p>
                              Discussion timer:{" "}
                              {round.discussionDeadlineMs === null
                                ? "none"
                                : `${Math.max(0, Math.ceil((round.discussionDeadlineMs - nowMs) / 1000))}s`}
                            </p>
                          ) : null}

                          {canCastVote ? (
                            <p>
                              <select value={voteTargetId} onChange={(event) => setVoteTargetId(event.target.value)}>
                                {voteTargets.map((target) => (
                                  <option key={target.id} value={target.id}>{target.displayName}</option>
                                ))}
                              </select>
                              <button type="button" disabled={!hasValidVoteTarget} onClick={() => runCommand({ type: "cast_vote", payload: { targetId: voteTargetId } })}>
                                Vote
                              </button>
                            </p>
                          ) : null}

                          {snapshot.phase === "game_over" ? (
                            <>
                              <p>Your score: {myScore}</p>
                              {snapshot.winnerSummary !== null ? (
                                <p>
                                  Winner(s): {snapshot.winnerSummary.winnerPlayerIds.map((id) => snapshot.players.find((p) => p.id === id)?.displayName ?? id).join(", ")}
                                </p>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}

                      {showScoreboard ? (
                        <div className="card slim-card">
                          <h3>Scoreboard</h3>
                          {snapshot.players.map((player) => (
                            <p key={player.id}>
                              {player.displayName}: {snapshot.scoreboard[player.id]?.totalPoints ?? 0}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      <p>
                        <button type="button" onClick={() => runCommand({ type: "leave_lobby", payload: {} })}>Leave Lobby</button>{" "}
                        {isHost ? <button type="button" onClick={deleteLobby}>Delete Lobby</button> : null}
                      </p>
                    </section>

                    {isHost && inGameRoom ? (
                      <aside className={`side-panel ${showHostAdmin ? "open" : ""}`}>
                        <p>
                          <button type="button" onClick={() => setShowHostAdmin((value) => !value)}>
                            {showHostAdmin ? "Hide" : "Show"} Host Admin
                          </button>
                        </p>

                        {showHostAdmin ? (
                          <div className="fade-in">
                            <p>Quick actions</p>
                            <p>
                              {canHostRevealQuestion ? <button type="button" onClick={() => runCommand({ type: "reveal_question", payload: {} })}>Reveal Question</button> : null}
                              {canHostRevealNextAnswer ? <button type="button" onClick={() => runCommand({ type: "reveal_next_answer", payload: {} })}>Next Answer</button> : null}
                              {canHostStartDiscussion ? <button type="button" onClick={() => runCommand({ type: "start_discussion", payload: {} })}>Start Discussion</button> : null}
                              {canHostEndDiscussion ? <button type="button" onClick={() => runCommand({ type: "end_discussion", payload: {} })}>End Discussion</button> : null}
                            </p>

                            <p>
                              {round?.phase === "discussion" && round.discussionDeadlineMs !== null ? (
                                <>
                                  <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 30 } })}>+30s</button>{" "}
                                  <button type="button" onClick={() => runCommand({ type: "extend_discussion", payload: { addSeconds: 60 } })}>+60s</button>
                                </>
                              ) : null}
                            </p>

                            <p>
                              {canHostCloseVoting ? (
                                <button type="button" onClick={() => runCommand({ type: "close_voting", payload: { allowMissingVotes: false } })}>Close Voting</button>
                              ) : null}
                              {canHostFinalizeRound ? (
                                <button type="button" onClick={() => runCommand({ type: "finalize_round", payload: {} })}>Finalize Round</button>
                              ) : null}
                              {canHostRestartGame ? (
                                <button type="button" onClick={() => runCommand({ type: "restart_game", payload: {} })}>Play Again</button>
                              ) : null}
                            </p>

                            {canHostCloseVoting && tieCandidates.length >= 2 ? (
                              <div className="card slim-card">
                                <p>Tie resolution</p>
                                <p><button type="button" onClick={() => resolveTie("auto")}>Auto Random</button></p>
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
                                Remove
                                <select value={removePlayerId} onChange={(event) => setRemovePlayerId(event.target.value)}>
                                  {removablePlayers.map((player) => (
                                    <option key={player.id} value={player.id}>{player.displayName}</option>
                                  ))}
                                </select>
                                <button type="button" disabled={removePlayerId.trim().length < 1} onClick={() => runCommand({ type: "remove_player", payload: { playerId: removePlayerId } })}>
                                  Remove Player
                                </button>
                              </p>
                            ) : null}

                            {transferableHostPlayers.length > 0 ? (
                              <p>
                                Transfer host
                                <select value={transferHostId} onChange={(event) => setTransferHostId(event.target.value)}>
                                  {transferableHostPlayers.map((player) => (
                                    <option key={player.id} value={player.id}>{player.displayName}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={transferHostId.trim().length < 1}
                                  onClick={() => runCommand({ type: "transfer_host", payload: { newHostId: transferHostId } })}
                                >
                                  Transfer
                                </button>
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </aside>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}

        {infoMessage !== "" ? <p className="info-line">{infoMessage}</p> : null}
        {errorMessage !== "" ? <p className="error-line">{errorMessage}</p> : null}
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
    answer_already_submitted: "You already submitted an answer for this round.",
    player_already_voted: "You already submitted your vote for this round.",
    invalid_host_transfer_vote: "Host transfer could not be completed.",
    vote_locked: "Vote changes are disabled for this round.",
    self_vote_forbidden: "You cannot vote for yourself.",
    game_not_found: "This lobby no longer exists.",
    invalid_command: "That action is not valid.",
    invalid_params: "The request used an invalid value.",
  };
  const translated = known[code];
  if (translated !== undefined) {
    return translated;
  }
  return fallbackMessage;
}

function describeRequestError(scope: "auth" | "create_lobby" | "join_lobby" | "delete_lobby" | "create_question_pair", code: string, fallback?: string): string {
  const known: Record<string, string> = {
    no_session: "Please log in first.",
    invalid_auth_request: "Please enter a valid username and password.",
    invalid_credentials: "Incorrect username or password.",
    user_exists: "That username is already taken.",
    invalid_lobby_create_request: "Lobby ID must be 4-32 characters.",
    lobby_already_exists: "A lobby with that ID already exists.",
    game_not_found: "That lobby was not found.",
    invalid_question_pair: "Please enter two valid prompts and targets.",
    question_pair_not_found: "That question pair was not found.",
    forbidden: "You do not have permission for this action.",
  };
  const translated = known[code];
  if (translated !== undefined) {
    return translated;
  }
  if (fallback !== undefined && fallback.trim().length > 0) {
    return fallback;
  }
  if (scope === "auth") {
    return "Could not complete sign-in right now.";
  }
  if (scope === "create_lobby") {
    return "Could not create lobby right now.";
  }
  if (scope === "join_lobby") {
    return "Could not join that lobby right now.";
  }
  if (scope === "delete_lobby") {
    return "Could not delete that lobby right now.";
  }
  return "Could not save question pair right now.";
}

function describeCommandSuccess(commandType: CommandPayload["type"]): string | null {
  if (commandType === "cast_vote") {
    return "Your vote has been submitted.";
  }
  if (commandType === "submit_answer") {
    return "Your answer has been submitted.";
  }
  if (commandType === "transfer_host") {
    return "Host has been transferred.";
  }
  return null;
}
