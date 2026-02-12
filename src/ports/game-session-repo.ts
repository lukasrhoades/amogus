import { GameState, LobbyId } from "../domain/game/types";

export interface GameSessionRepo {
  getByLobbyId(lobbyId: LobbyId): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  deleteByLobbyId(lobbyId: LobbyId): Promise<boolean>;
}
