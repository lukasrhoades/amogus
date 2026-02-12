import { PrismaClient } from "@prisma/client";

import { GameState, LobbyId } from "../../domain/game/types";
import { GameSessionRepo } from "../../ports/game-session-repo";
import { fromPersistedGameState, toPersistedGameState } from "./game-state-json";

export class PrismaGameSessionRepo implements GameSessionRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async getByLobbyId(lobbyId: LobbyId): Promise<GameState | null> {
    const row = await this.prisma.gameSession.findUnique({
      where: { lobbyId },
      select: { state: true },
    });

    if (row === null) {
      return null;
    }

    return fromPersistedGameState(row.state);
  }

  async save(state: GameState): Promise<void> {
    await this.prisma.gameSession.upsert({
      where: { lobbyId: state.lobbyId },
      update: { state: toPersistedGameState(state) },
      create: {
        lobbyId: state.lobbyId,
        state: toPersistedGameState(state),
      },
    });
  }

  async deleteByLobbyId(lobbyId: LobbyId): Promise<boolean> {
    const result = await this.prisma.gameSession.deleteMany({
      where: { lobbyId },
    });
    return result.count > 0;
  }
}
