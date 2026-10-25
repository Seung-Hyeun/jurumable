import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { RoomCleanupService } from './room-cleanup.service.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsService } from './rooms.service.js';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService, RoomsGateway, RoomCleanupService],
})
export class RoomsModule {}
