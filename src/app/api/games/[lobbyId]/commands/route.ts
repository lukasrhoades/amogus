import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../../server/runtime";
import { serializeGameState } from "../../../../../server/serialize-game-state";
import { requireSession } from "../../../../../server/session/require-session";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

const roleAssignmentSchema = z.record(z.string().min(1), z.enum(["impostor", "crew"]));
const promptTargetSchema = z.union([z.literal("crew"), z.literal("impostor"), z.literal("both")]);
const gameSettingsUpdateSchema = z.object({
  plannedRounds: z.number().int().min(5).max(30),
  roundsCappedByQuestions: z.boolean(),
  questionReuseEnabled: z.boolean(),
  impostorWeights: z.object({
    zero: z.number().min(0).max(1),
    one: z.number().min(0).max(1),
    two: z.number().min(0).max(1),
  }),
  scoring: z.object({
    impostorSurvivesPoints: z.number().int().min(0),
    crewVotesOutImpostorPoints: z.number().int().min(0),
    crewVotedOutPenaltyEnabled: z.boolean(),
    crewVotedOutPenaltyPoints: z.number().int().max(0),
  }),
});

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start_round"),
    payload: z.object({
      selection: z.object({
        questionPair: z.object({
          id: z.string().min(1),
          ownerId: z.string().min(1),
          promptA: z.object({
            text: z.string().min(1),
            target: promptTargetSchema,
          }),
          promptB: z.object({
            text: z.string().min(1),
            target: promptTargetSchema,
          }),
        }),
        impostorCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      }),
      roundPolicy: z.object({
        eligibilityEnabled: z.boolean(),
        allowVoteChanges: z.boolean(),
      }),
      roleAssignment: roleAssignmentSchema,
    }),
  }),
  z.object({
    type: z.literal("start_round_auto"),
    payload: z.object({
      roundPolicy: z
        .object({
          eligibilityEnabled: z.boolean(),
          allowVoteChanges: z.boolean(),
        })
        .partial()
        .optional(),
      impostorCountOverride: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    }),
  }),
  z.object({
    type: z.literal("submit_answer"),
    payload: z.object({
      answer: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("reveal_question"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("start_discussion"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("reveal_next_answer"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("end_discussion"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("cast_vote"),
    payload: z.object({
      targetId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("close_voting"),
    payload: z.object({
      allowMissingVotes: z.boolean(),
      tieBreakLoserId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal("finalize_round"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("update_settings"),
    payload: gameSettingsUpdateSchema,
  }),
  z.object({
    type: z.literal("cancel_round"),
    payload: z.object({
      reason: z.union([
        z.literal("player_removed_before_reveal"),
        z.literal("host_removed_disconnected_player"),
        z.literal("admin_skip"),
      ]),
    }),
  }),
  z.object({
    type: z.literal("set_player_connection"),
    payload: z.object({
      connected: z.boolean(),
      nowMs: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    type: z.literal("cast_host_transfer_vote"),
    payload: z.object({
      newHostId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("apply_host_disconnect_timeout"),
    payload: z.object({
      nowMs: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    type: z.literal("extend_host_disconnect_pause"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("remove_player"),
    payload: z.object({
      playerId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("leave_lobby"),
    payload: z.object({}),
  }),
]);

type Command = z.infer<typeof commandSchema>;

function domainErrorStatus(code: string): number {
  if (code === "forbidden") {
    return 403;
  }

  if (code === "game_not_found") {
    return 404;
  }

  if (code === "invalid_phase" || code === "invalid_role_assignment" || code === "invalid_round") {
    return 409;
  }
  if (code === "invalid_settings") {
    return 400;
  }

  if (code === "missing_answers" || code === "missing_votes" || code === "missing_tiebreak") {
    return 400;
  }

  if (code === "insufficient_players") {
    return 422;
  }
  if (code === "question_pool_empty") {
    return 422;
  }

  return 400;
}

function isHostOnlyCommand(commandType: Command["type"]): boolean {
  return (
    commandType === "start_round" ||
    commandType === "start_round_auto" ||
    commandType === "reveal_question" ||
    commandType === "reveal_next_answer" ||
    commandType === "start_discussion" ||
    commandType === "end_discussion" ||
    commandType === "close_voting" ||
    commandType === "finalize_round" ||
    commandType === "update_settings" ||
    commandType === "cancel_round" ||
    commandType === "remove_player"
  );
}

async function runCommand(lobbyId: string, command: Command, sessionPlayerId: string) {
  const runtime = getRuntime();
  const service = runtime.gameService;

  if (isHostOnlyCommand(command.type)) {
    const state = await service.get(lobbyId);
    if (!state.ok) {
      return state;
    }
    const caller = state.value.players[sessionPlayerId];
    if (caller === undefined || !caller.isHost) {
      const hostId = Object.values(state.value.players).find((player) => player.isHost)?.id ?? "unknown";
      return {
        ok: false as const,
        error: {
          code: "forbidden" as const,
          message: `Host privileges required for this command (session=${sessionPlayerId}, host=${hostId})`,
        },
      };
    }
  }

  switch (command.type) {
    case "start_round":
      return service.startRound(lobbyId, command.payload);
    case "start_round_auto":
      return service.startRoundAuto(lobbyId, command.payload);
    case "submit_answer":
      return service.submitAnswer(lobbyId, sessionPlayerId, command.payload.answer);
    case "reveal_question":
      return service.revealQuestion(lobbyId);
    case "start_discussion":
      return service.startDiscussion(lobbyId);
    case "reveal_next_answer":
      return service.revealNextAnswer(lobbyId);
    case "end_discussion":
      return service.endDiscussion(lobbyId);
    case "cast_vote":
      return service.castVote(lobbyId, sessionPlayerId, command.payload.targetId);
    case "close_voting": {
      const input =
        command.payload.tieBreakLoserId === undefined
          ? { allowMissingVotes: command.payload.allowMissingVotes }
          : {
              allowMissingVotes: command.payload.allowMissingVotes,
              tieBreakLoserId: command.payload.tieBreakLoserId,
            };
      return service.closeVotingAndResolve(lobbyId, input);
    }
    case "finalize_round":
      return service.finalizeRound(lobbyId);
    case "update_settings":
      return service.updateSettings(lobbyId, command.payload);
    case "cancel_round":
      return service.cancelCurrentRoundBeforeReveal(lobbyId, command.payload.reason);
    case "set_player_connection":
      return service.setPlayerConnection(lobbyId, sessionPlayerId, command.payload.connected, command.payload.nowMs);
    case "cast_host_transfer_vote":
      return service.castHostTransferVote(lobbyId, sessionPlayerId, command.payload.newHostId);
    case "apply_host_disconnect_timeout":
      return service.applyHostDisconnectTimeout(lobbyId, command.payload.nowMs);
    case "extend_host_disconnect_pause":
      return service.extendHostDisconnectPause(lobbyId);
    case "remove_player":
      return service.removePlayer(lobbyId, command.payload.playerId);
    case "leave_lobby":
      return service.removePlayer(lobbyId, sessionPlayerId);
    default: {
      const exhausted: never = command;
      return exhausted;
    }
  }
}

async function getTieCandidates(lobbyId: string): Promise<string[]> {
  const runtime = getRuntime();
  const state = await runtime.gameService.get(lobbyId);
  if (!state.ok || state.value.currentRound === null || state.value.currentRound.phase !== "voting") {
    return [];
  }

  const { activePlayerIds, votes } = state.value.currentRound;
  const tally = activePlayerIds.reduce<Record<string, number>>((acc, playerId) => {
    acc[playerId] = 0;
    return acc;
  }, Object.create(null) as Record<string, number>);

  Object.values(votes).forEach((targetId) => {
    if (targetId !== undefined && tally[targetId] !== undefined) {
      tally[targetId] += 1;
    }
  });

  const maxVotes = Math.max(...Object.values(tally));
  return Object.keys(tally).filter((playerId) => tally[playerId] === maxVotes);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json(
      {
        error: "no_session",
        message: "Create a session before sending commands",
      },
      { status: 401 },
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      {
        error: "invalid_params",
        details: params.error.flatten(),
      },
      { status: 400 },
    );
  }

  const parsed = commandSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_command",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const result = await runCommand(params.data.lobbyId, parsed.data, session.userId);
  if (!result.ok) {
    const tieCandidates =
      result.error.code === "missing_tiebreak" ? await getTieCandidates(params.data.lobbyId) : undefined;
    return NextResponse.json(
      {
        error: result.error.code,
        message: result.error.message,
        tieCandidates,
      },
      { status: domainErrorStatus(result.error.code) },
    );
  }

  return NextResponse.json({
    ok: true,
    state: serializeGameState(result.value, session.userId),
  });
}
