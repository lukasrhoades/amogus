import { PlayerId, QuestionPair, QuestionPairId, QuestionPrompt } from "../domain/game/types";
import { QuestionPairRepo } from "../ports/question-pair-repo";

export type QuestionPairResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: "question_pair_not_found" | "invalid_question_pair";
        message: string;
      };
    };

function ok<T>(value: T): QuestionPairResult<T> {
  return { ok: true, value };
}

function err<T>(code: "question_pair_not_found" | "invalid_question_pair", message: string): QuestionPairResult<T> {
  return { ok: false, error: { code, message } };
}

function isPermissibleForCrew(prompt: QuestionPrompt): boolean {
  return prompt.target === "crew" || prompt.target === "both";
}

function isPermissibleForImpostor(prompt: QuestionPrompt): boolean {
  return prompt.target === "impostor" || prompt.target === "both";
}

export class QuestionPairService {
  constructor(private readonly repo: QuestionPairRepo) {}

  async listOwn(ownerId: PlayerId): Promise<QuestionPair[]> {
    return this.repo.listByOwner(ownerId);
  }

  async createOwn(input: {
    ownerId: PlayerId;
    promptA: QuestionPrompt;
    promptB: QuestionPrompt;
  }): Promise<QuestionPairResult<QuestionPair>> {
    const crewPermissible = isPermissibleForCrew(input.promptA) || isPermissibleForCrew(input.promptB);
    const impostorPermissible =
      isPermissibleForImpostor(input.promptA) || isPermissibleForImpostor(input.promptB);
    if (!crewPermissible || !impostorPermissible) {
      return err(
        "invalid_question_pair",
        "Question pair must include at least one crew-permissible and one impostor-permissible prompt",
      );
    }

    const pair: QuestionPair = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      promptA: input.promptA,
      promptB: input.promptB,
    };

    await this.repo.create(pair);
    return ok(pair);
  }

  async deleteOwn(ownerId: PlayerId, pairId: QuestionPairId): Promise<QuestionPairResult<{ deleted: true }>> {
    const deleted = await this.repo.deleteByOwner(ownerId, pairId);
    if (!deleted) {
      return err("question_pair_not_found", `Question pair ${pairId} not found for owner`);
    }

    return ok({ deleted: true });
  }
}
