import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { errorTrace } from './error-trace.js';

// Stable codes for the error messages this API throws itself; any other error gets the code
// for its status. A new 4xx message without an entry here still gets a sensible code.
const CODE_BY_MESSAGE: Record<string, string> = {
  'Room not found': 'ROOM_NOT_FOUND',
  'Room is full': 'ROOM_FULL',
  'Room is not accepting new players': 'ROOM_NOT_WAITING',
  'Invalid reconnect token': 'INVALID_RECONNECT_TOKEN',
  'Invalid room code': 'INVALID_ROOM_CODE',
  'Question not found': 'QUESTION_NOT_FOUND',
  'Mission not found': 'MISSION_NOT_FOUND',
  'Penalty not found': 'PENALTY_NOT_FOUND',
  'Failed to generate a unique room code': 'ROOM_CODE_GENERATION_FAILED',
};
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

function codeFor(status: number, message: unknown) {
  if (typeof message === 'string' && CODE_BY_MESSAGE[message]) {
    return CODE_BY_MESSAGE[message];
  }
  // ValidationPipe answers with the list of failed constraints.
  if (status === 400 && Array.isArray(message)) {
    return 'VALIDATION_FAILED';
  }
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}

// REST errors in one shape. An HttpException keeps its status and body (statusCode / message /
// error, which the frontend reads) and gets a stable `code`; it is an expected outcome, so it is
// not logged here. Anything else is an unexpected server error: logged once with method, route
// pattern and a safe trace (never headers or body), answered with a generic 500.
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    // Socket.IO handlers answer through acks and never let errors out.
    if (host.getType() !== 'http') {
      return;
    }
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const fields: Record<string, unknown> =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { ...body };
      fields.code ??= codeFor(status, fields.message);
      response.status(status).json(fields);
      return;
    }
    const request = http.getRequest<Request>();
    const route = (request.route as { path?: string } | undefined)?.path;
    this.logger.error(
      `${request.method} ${route ?? 'unmatched route'} failed`,
      errorTrace(exception),
    );
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
