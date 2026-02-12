import { getRuntime } from "../../../../../server/runtime";
import { serializeGameState } from "../../../../../server/serialize-game-state";

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
  const { lobbyId } = await context.params;
  const runtime = getRuntime();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const existing = await runtime.gameService.get(lobbyId);
      if (existing.ok) {
        controller.enqueue(encoder.encode(sseData({ type: "state", state: serializeGameState(existing.value) })));
      }

      const unsubscribe = runtime.lobbyEvents.subscribe(lobbyId, (state) => {
        controller.enqueue(encoder.encode(sseData({ type: "state", state: serializeGameState(state) })));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
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
