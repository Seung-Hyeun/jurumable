-- CreateEnum
CREATE TYPE "TurnPhase" AS ENUM ('AWAITING_ROLL', 'RESOLVING_TILE');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "currentTurnOrder" INTEGER,
ADD COLUMN     "turnPhase" "TurnPhase";
