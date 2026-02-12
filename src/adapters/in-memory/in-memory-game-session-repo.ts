import { GameState, LobbyId } from "../../domain/game/types";
import { GameSessionRepo } from "../../ports/game-session-repo";

export class InMemoryGameSessionRepo implements GameSessionRepo {
  private readonly store = new Map<LobbyId, GameState>();

  async getByLobbyId(lobbyId: LobbyId): Promise<GameState | null> {
    return this.store.get(lobbyId) ?? null;
  }

  async save(state: GameState): Promise<void> {
    this.store.set(state.lobbyId, state);
  }
}
