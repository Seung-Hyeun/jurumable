import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { errorTrace } from '../error-trace.js';
import type { RoomStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RoomsGateway } from './rooms.gateway.js';

const HOUR_MS = 60 * 60 * 1000;

// How long a room may stay without activity (Room.lastActivityAt) before it is removed.
export const ROOM_TTL_MS: Record<RoomStatus, number> = {
  WAITING: 6 * HOUR_MS,
  PLAYING: 24 * HOUR_MS,
  ENDED: 2 * HOUR_MS,
};
const FIRST_CLEANUP_DELAY_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = HOUR_MS;

// Removes rooms nobody has used for a while. Players, content and votes go with the room
// through the schema's onDelete: Cascade relations.
@Injectable()
export class RoomCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RoomCleanup');
  private firstRun?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RoomsGateway,
  ) {}

  onModuleInit() {
    this.firstRun = setTimeout(() => {
      void this.tick();
      this.interval = setInterval(() => void this.tick(), CLEANUP_INTERVAL_MS);
      this.interval.unref();
    }, FIRST_CLEANUP_DELAY_MS);
    this.firstRun.unref();
  }

  onModuleDestroy() {
    clearTimeout(this.firstRun);
    clearInterval(this.interval);
  }

  // Returns how many rooms were removed. A room with a player online right now is kept,
  // whatever its timestamp says.
  async runCleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [status, ttl] of Object.entries(ROOM_TTL_MS) as [
      RoomStatus,
      number,
    ][]) {
      const cutoff = new Date(now - ttl);
      const expired = await this.prisma.room.findMany({
        where: { status, lastActivityAt: { lt: cutoff } },
        select: { id: true, players: { select: { id: true } } },
      });
      const ids = expired
        .filter(
          (room) =>
            !room.players.some((player) => this.gateway.isOnline(player.id)),
        )
        .map((room) => room.id);
      if (ids.length === 0) {
        continue;
      }
      // The same conditions again in the delete itself: a room that was used or changed
      // state since the query above no longer matches and is skipped.
      const { count } = await this.prisma.room.deleteMany({
        where: { id: { in: ids }, status, lastActivityAt: { lt: cutoff } },
      });
      removed += count;
    }
    return removed;
  }

  // One failed run must not take the server down; the next interval tries again.
  private async tick() {
    try {
      const removed = await this.runCleanup();
      if (removed > 0) {
        this.logger.log(`removed ${removed} expired rooms`);
      }
    } catch (error) {
      this.logger.error('Room cleanup failed', errorTrace(error));
    }
  }
}
