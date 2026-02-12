import { GameState, LobbyId } from "../../domain/game/types";

type LobbyListener = (state: GameState) => void;

export class LobbyEventBus {
  private readonly listenersByLobby = new Map<LobbyId, Set<LobbyListener>>();

  subscribe(lobbyId: LobbyId, listener: LobbyListener): () => void {
    const existing = this.listenersByLobby.get(lobbyId) ?? new Set<LobbyListener>();
    existing.add(listener);
    this.listenersByLobby.set(lobbyId, existing);

    return () => {
      const listeners = this.listenersByLobby.get(lobbyId);
      if (listeners === undefined) {
        return;
      }
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByLobby.delete(lobbyId);
      }
    };
  }

  publish(state: GameState): void {
    const listeners = this.listenersByLobby.get(state.lobbyId);
    if (listeners === undefined) {
      return;
    }

    listeners.forEach((listener) => {
      listener(state);
    });
  }
}
