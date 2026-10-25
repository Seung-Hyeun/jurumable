import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Process-only liveness check for the hosting provider: no DB query, no env.
  @Get('health')
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
