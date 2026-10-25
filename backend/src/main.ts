import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { FRONTEND_ORIGIN } from './frontend-origin.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The host's edge proxy (Railway) is the one hop in front of the app: trusting exactly that
  // hop makes req.ip, the rate-limit key, the client address the proxy saw, never a value the
  // client wrote into X-Forwarded-For itself.
  app.set('trust proxy', 1);
  // Same origin the Socket.IO gateway allows: the Next.js frontend.
  app.enableCors({ origin: FRONTEND_ORIGIN });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Railway stops a deployment with SIGTERM, Ctrl+C sends SIGINT: either one runs the lifecycle
  // hooks (timers stopped, Socket.IO / HTTP / DB closed) before the process exits.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
