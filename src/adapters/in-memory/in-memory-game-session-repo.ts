import { GameState, LobbyId } from "../../domain/game/types";
import { GameSessionRepo } from "../../ports/game-session-repo";

export class InMemoryGameSessionRepo implements GameSessionRepo {
  private readonly store = new Map<LobbyId, GameState>();
  private readonly updatedAt = new Map<LobbyId, number>();

  constructor(private readonly nowMs: () => number = Date.now) {}

  async getByLobbyId(lobbyId: LobbyId): Promise<GameState | null> {
    return this.store.get(lobbyId) ?? null;
  }

  async save(state: GameState): Promise<void> {
    this.store.set(state.lobbyId, state);
    this.updatedAt.set(state.lobbyId, this.nowMs());
  }

  async deleteByLobbyId(lobbyId: LobbyId): Promise<boolean> {
    const deleted = this.store.delete(lobbyId);
    this.updatedAt.delete(lobbyId);
    return deleted;
  }

  async listLobbyIds(): Promise<LobbyId[]> {
    return Array.from(this.store.keys());
  }

  async listLobbyIdsUpdatedBefore(cutoff: Date): Promise<LobbyId[]> {
    const cutoffMs = cutoff.getTime();
    const ids: LobbyId[] = [];
    for (const [lobbyId, updatedAtMs] of this.updatedAt.entries()) {
      if (updatedAtMs < cutoffMs) {
        ids.push(lobbyId);
      }
    }
    return ids;
  }
}
