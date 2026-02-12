import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../../server/runtime";
import { serializeGameState } from "../../../../../server/serialize-game-state";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

const roleAssignmentSchema = z.record(z.string().min(1), z.enum(["impostor", "crew"]));

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start_round"),
    payload: z.object({
      selection: z.object({
        questionPair: z.object({
          id: z.string().min(1),
          ownerId: z.string().min(1),
          canonicalQuestion: z.string().min(1),
          impostorQuestion: z.string().min(1),
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
    type: z.literal("submit_answer"),
    payload: z.object({
      playerId: z.string().min(1),
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
    type: z.literal("end_discussion"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("cast_vote"),
    payload: z.object({
      voterId: z.string().min(1),
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
      playerId: z.string().min(1),
      connected: z.boolean(),
      nowMs: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    type: z.literal("cast_host_transfer_vote"),
    payload: z.object({
      voterId: z.string().min(1),
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
]);

type Command = z.infer<typeof commandSchema>;

function domainErrorStatus(code: string): number {
  if (code === "game_not_found") {
    return 404;
  }

  if (code === "invalid_phase" || code === "invalid_role_assignment" || code === "invalid_round") {
    return 409;
  }

  if (code === "missing_answers" || code === "missing_votes" || code === "missing_tiebreak") {
    return 400;
  }

  if (code === "insufficient_players") {
    return 422;
  }

  return 400;
}

async function runCommand(lobbyId: string, command: Command) {
  const runtime = getRuntime();
  const service = runtime.gameService;

  switch (command.type) {
    case "start_round":
      return service.startRound(lobbyId, command.payload);
    case "submit_answer":
      return service.submitAnswer(lobbyId, command.payload.playerId, command.payload.answer);
    case "reveal_question":
      return service.revealQuestion(lobbyId);
    case "start_discussion":
      return service.startDiscussion(lobbyId);
    case "end_discussion":
      return service.endDiscussion(lobbyId);
    case "cast_vote":
      return service.castVote(lobbyId, command.payload.voterId, command.payload.targetId);
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
    case "cancel_round":
      return service.cancelCurrentRoundBeforeReveal(lobbyId, command.payload.reason);
    case "set_player_connection":
      return service.setPlayerConnection(
        lobbyId,
        command.payload.playerId,
        command.payload.connected,
        command.payload.nowMs,
      );
    case "cast_host_transfer_vote":
      return service.castHostTransferVote(lobbyId, command.payload.voterId, command.payload.newHostId);
    case "apply_host_disconnect_timeout":
      return service.applyHostDisconnectTimeout(lobbyId, command.payload.nowMs);
    case "extend_host_disconnect_pause":
      return service.extendHostDisconnectPause(lobbyId);
    default: {
      const exhausted: never = command;
      return exhausted;
    }
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
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

  const result = await runCommand(params.data.lobbyId, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error.code,
        message: result.error.message,
      },
      { status: domainErrorStatus(result.error.code) },
    );
  }

  return NextResponse.json({
    ok: true,
    state: serializeGameState(result.value),
  });
}
