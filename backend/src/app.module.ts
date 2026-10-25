import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HttpErrorFilter } from './http-error.filter.js';
import { RoomsModule } from './rooms/rooms.module.js';

@Module({
  imports: [RoomsModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: HttpErrorFilter }],
})
export class AppModule {}
