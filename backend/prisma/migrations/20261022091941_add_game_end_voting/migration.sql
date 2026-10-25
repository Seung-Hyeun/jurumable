-- CreateEnum
CREATE TYPE "EndVoteChoice" AS ENUM ('YES', 'NO');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activeEndVoteRoundId" TEXT,
ADD COLUMN     "activeEndVoteStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GameEndVote" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "voteRoundId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "choice" "EndVoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEndVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameEndVote_voteRoundId_voterId_key" ON "GameEndVote"("voteRoundId", "voterId");

-- AddForeignKey
ALTER TABLE "GameEndVote" ADD CONSTRAINT "GameEndVote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEndVote" ADD CONSTRAINT "GameEndVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
