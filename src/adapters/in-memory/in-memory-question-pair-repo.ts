import { PlayerId, QuestionPair, QuestionPairId } from "../../domain/game/types";
import { QuestionPairRepo } from "../../ports/question-pair-repo";

export class InMemoryQuestionPairRepo implements QuestionPairRepo {
  private readonly store = new Map<QuestionPairId, QuestionPair>();

  async listByOwner(ownerId: PlayerId): Promise<QuestionPair[]> {
    return Array.from(this.store.values()).filter((pair) => pair.ownerId === ownerId);
  }

  async listByOwnerIds(ownerIds: PlayerId[]): Promise<QuestionPair[]> {
    const ownerSet = new Set(ownerIds);
    return Array.from(this.store.values()).filter((pair) => ownerSet.has(pair.ownerId));
  }

  async create(pair: QuestionPair): Promise<void> {
    this.store.set(pair.id, pair);
  }

  async deleteByOwner(ownerId: PlayerId, pairId: QuestionPairId): Promise<boolean> {
    const pair = this.store.get(pairId);
    if (pair === undefined || pair.ownerId !== ownerId) {
      return false;
    }

    this.store.delete(pairId);
    return true;
  }
}
