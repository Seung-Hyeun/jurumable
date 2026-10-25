-- CreateEnum
CREATE TYPE "PenaltySource" AS ENUM ('TILE', 'MISSION_FAILURE');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activePenaltySource" "PenaltySource";

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
