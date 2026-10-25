import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

// Requests per client IP per window, by purpose. Generous enough for a group of friends
// behind one shared public IP: one create, a few joins, refreshes and content edits.
export const RATE_LIMITS = {
  createRoom: { limit: 5, windowMs: 60_000 },
  joinRoom: { limit: 20, windowMs: 60_000 },
  reconnect: { limit: 30, windowMs: 60_000 },
  contentChange: { limit: 60, windowMs: 60_000 },
};
export type RateLimitBucket = keyof typeof RATE_LIMITS;

const BUCKET_KEY = 'rateLimitBucket';
const SWEEP_INTERVAL_MS = 60_000;

// Fixed-window counters of this process: "bucket:ip" -> count until resetAt. Expired entries
// are swept at most once a minute while requests come in, so the map cannot grow without bound.
const hits = new Map<string, { count: number; resetAt: number }>();
let nextSweep = 0;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const bucket = this.reflector.get<RateLimitBucket | undefined>(
      BUCKET_KEY,
      context.getHandler(),
    );
    if (!bucket) {
      return true;
    }
    const { limit, windowMs } = RATE_LIMITS[bucket];
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [key, entry] of hits) {
        if (entry.resetAt <= now) {
          hits.delete(key);
        }
      }
      nextSweep = now + SWEEP_INTERVAL_MS;
    }
    const http = context.switchToHttp();
    // req.ip follows the app's `trust proxy` setting (main.ts), so a client cannot choose its key.
    const key = `${bucket}:${http.getRequest<Request>().ip ?? 'unknown'}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count <= limit) {
      return true;
    }
    if (entry.count === limit + 1) {
      // Once per client and window, without the address or anything from the request.
      this.logger.warn(`${bucket} request limited`);
    }
    http
      .getResponse<Response>()
      .setHeader(
        'Retry-After',
        String(Math.ceil((entry.resetAt - now) / 1000)),
      );
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Counts the route's requests against `bucket` per client IP and answers 429 past the limit.
// Failed requests (bad code, bad token, invalid body) count too. CORS preflights never reach it.
export const RateLimit = (bucket: RateLimitBucket) =>
  applyDecorators(SetMetadata(BUCKET_KEY, bucket), UseGuards(RateLimitGuard));
