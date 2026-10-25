-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('NORMAL', 'TIMED');

-- CreateEnum
CREATE TYPE "MissionStage" AS ENUM ('READY', 'RUNNING', 'AWAITING_VOTE');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activeMissionContent" TEXT,
ADD COLUMN     "activeMissionDurationSeconds" INTEGER,
ADD COLUMN     "activeMissionStage" "MissionStage",
ADD COLUMN     "activeMissionStartedAt" TIMESTAMP(3),
ADD COLUMN     "activeMissionType" "MissionType";

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MissionType" NOT NULL,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
