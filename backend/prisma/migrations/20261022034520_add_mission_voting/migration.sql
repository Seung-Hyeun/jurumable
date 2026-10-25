-- CreateEnum
CREATE TYPE "MissionVoteChoice" AS ENUM ('O', 'X');

-- AlterEnum
ALTER TYPE "MissionStage" ADD VALUE 'PENALTY_PENDING';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activeMissionVoteRoundId" TEXT;

-- CreateTable
CREATE TABLE "MissionVote" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "voteRoundId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "choice" "MissionVoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MissionVote_voteRoundId_voterId_key" ON "MissionVote"("voteRoundId", "voterId");

-- AddForeignKey
ALTER TABLE "MissionVote" ADD CONSTRAINT "MissionVote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionVote" ADD CONSTRAINT "MissionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
