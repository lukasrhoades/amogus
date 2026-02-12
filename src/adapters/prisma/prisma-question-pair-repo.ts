import { PrismaClient } from "@prisma/client";

import { PlayerId, QuestionPair, QuestionPairId, QuestionPromptTarget } from "../../domain/game/types";
import { QuestionPairRepo } from "../../ports/question-pair-repo";

function parseTarget(value: string): QuestionPromptTarget {
  if (value === "crew" || value === "impostor" || value === "both") {
    return value;
  }
  throw new Error(`Invalid question prompt target in persistence: ${value}`);
}

function toDomainPair(row: {
  id: string;
  ownerId: string;
  promptAText: string;
  promptATarget: string;
  promptBText: string;
  promptBTarget: string;
}): QuestionPair {
  return {
    id: row.id,
    ownerId: row.ownerId,
    promptA: {
      text: row.promptAText,
      target: parseTarget(row.promptATarget),
    },
    promptB: {
      text: row.promptBText,
      target: parseTarget(row.promptBTarget),
    },
  };
}

export class PrismaQuestionPairRepo implements QuestionPairRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async listByOwner(ownerId: PlayerId): Promise<QuestionPair[]> {
    const rows = await this.prisma.questionPair.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ownerId: true,
        promptAText: true,
        promptATarget: true,
        promptBText: true,
        promptBTarget: true,
      },
    });

    return rows.map(toDomainPair);
  }

  async listByOwnerIds(ownerIds: PlayerId[]): Promise<QuestionPair[]> {
    if (ownerIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.questionPair.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ownerId: true,
        promptAText: true,
        promptATarget: true,
        promptBText: true,
        promptBTarget: true,
      },
    });

    return rows.map(toDomainPair);
  }

  async create(pair: QuestionPair): Promise<void> {
    await this.prisma.questionPair.upsert({
      where: { id: pair.id },
      update: {
        ownerId: pair.ownerId,
        promptAText: pair.promptA.text,
        promptATarget: pair.promptA.target,
        promptBText: pair.promptB.text,
        promptBTarget: pair.promptB.target,
      },
      create: {
        id: pair.id,
        ownerId: pair.ownerId,
        promptAText: pair.promptA.text,
        promptATarget: pair.promptA.target,
        promptBText: pair.promptB.text,
        promptBTarget: pair.promptB.target,
      },
    });
  }

  async deleteByOwner(ownerId: PlayerId, pairId: QuestionPairId): Promise<boolean> {
    const result = await this.prisma.questionPair.deleteMany({
      where: {
        id: pairId,
        ownerId,
      },
    });

    return result.count > 0;
  }
}
