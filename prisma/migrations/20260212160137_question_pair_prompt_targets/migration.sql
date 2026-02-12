-- CreateTable
CREATE TABLE "QuestionPair" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "promptAText" TEXT NOT NULL,
    "promptATarget" TEXT NOT NULL,
    "promptBText" TEXT NOT NULL,
    "promptBTarget" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionPair_ownerId_idx" ON "QuestionPair"("ownerId");
