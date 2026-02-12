import { PlayerId, QuestionPair, QuestionPairId } from "../domain/game/types";

export interface QuestionPairRepo {
  listByOwner(ownerId: PlayerId): Promise<QuestionPair[]>;
  listByOwnerIds(ownerIds: PlayerId[]): Promise<QuestionPair[]>;
  create(pair: QuestionPair): Promise<void>;
  deleteByOwner(ownerId: PlayerId, pairId: QuestionPairId): Promise<boolean>;
}
