import { getRuntime } from "../../../../../server/runtime";
import { serializeGameState } from "../../../../../server/serialize-game-state";
import { readSessionFromRequest } from "../../../../../server/session/session";

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
  const { lobbyId } = await context.params;
  const runtime = getRuntime();
  const session = readSessionFromRequest(request);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // Ignore duplicate close races.
        }
      };

      const safeEnqueue = (payload: string) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      const existing = await runtime.gameService.get(lobbyId);
      if (existing.ok) {
        safeEnqueue(sseData({ type: "state", state: serializeGameState(existing.value, session?.playerId) }));
      }

      unsubscribe = runtime.lobbyEvents.subscribe(lobbyId, (state) => {
        safeEnqueue(sseData({ type: "state", state: serializeGameState(state, session?.playerId) }));
      });

      heartbeat = setInterval(() => {
        safeEnqueue(": heartbeat\n\n");
      }, 15000);

      request.signal.addEventListener("abort", () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
