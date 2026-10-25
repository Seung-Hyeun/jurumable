import 'dotenv/config';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { errorTrace } from './error-trace.js';
import { PrismaClient } from './generated/prisma/client.js';

const logger = new Logger('PrismaService');

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  // The last step of a shutdown (signal or app.close()): Socket.IO and HTTP are already closed,
  // so nothing new reaches the pool; queries still running finish before it ends.
  async onApplicationShutdown() {
    try {
      await this.$disconnect();
      logger.log('database disconnected');
    } catch (error) {
      logger.error('Database disconnect failed', errorTrace(error));
    }
  }
}
