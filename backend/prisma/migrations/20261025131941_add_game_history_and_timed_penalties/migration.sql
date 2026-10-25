-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('NORMAL', 'TIMED');

-- CreateEnum
CREATE TYPE "GameHistoryKind" AS ENUM ('MISSION', 'PENALTY');

-- CreateEnum
CREATE TYPE "GameHistoryStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED', 'INVALID', 'CANCELLED', 'DONE');

-- AlterTable
ALTER TABLE "Penalty" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "type" "PenaltyType" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "GameHistory" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "GameHistoryKind" NOT NULL,
    "content" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "penaltySource" "PenaltySource",
    "status" "GameHistoryStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameHistory_roomId_createdAt_idx" ON "GameHistory"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameHistory" ADD CONSTRAINT "GameHistory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
