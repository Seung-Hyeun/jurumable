-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "reconnectTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_reconnectTokenHash_key" ON "Player"("reconnectTokenHash");
