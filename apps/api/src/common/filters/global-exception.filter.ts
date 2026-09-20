import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { Request, Response } from 'express';

/**
 * Query params whose values must never reach the logs.
 **/
// The callback's `code` and the redirect's `ownerToken` are bearer-grade, and logs outlive both.
const REDACTED_QUERY_PARAMS = new Set(['code', 'state', 'ownertoken', 'token', 'access_token']);

/**
 * Request URL with sensitive query values masked, for logging.
 **/
const safeUrl = (url: string): string => {
  const [path, query] = url.split('?');

  if (!query) {
    return path;
  }

  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (REDACTED_QUERY_PARAMS.has(key.toLowerCase())) {
      params.set(key, '[redacted]');
    }
  }

  return `${path}?${params.toString()}`;
};

/**
 * Prisma constraint failures worth a specific status; anything else stays a 500.
 **/
// The messages are ours on purpose: Prisma's own carry the model, field and constraint names, and
// this response goes to the client. Unmapped codes fall through and are logged as unhandled.
const PRISMA_ERROR_RESPONSES: Record<string, () => HttpException> = {
  // Unique constraint violated.
  P2002: () => new ConflictException('This already exists.'),
  // Foreign key constraint violated.
  P2003: () => new ConflictException('This item is still referenced by something else.'),
  // Record required by the operation was not found (e.g. deleted by a concurrent request).
  P2025: () => new NotFoundException('This item no longer exists.'),
};

/**
 * The exception as an HttpException, mapping known Prisma failures; null when it is neither.
 **/
const asHttpException = (exception: unknown): HttpException | null => {
  if (exception instanceof HttpException) {
    return exception;
  }

  if (exception instanceof PrismaClientKnownRequestError) {
    return PRISMA_ERROR_RESPONSES[exception.code]?.() ?? null;
  }

  return null;
};

/**
 * Normalizes every exception to `{ status, message }`; unknown errors → 500.
 **/
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpException = asHttpException(exception);

    if (httpException) {
      const status = httpException.getStatus();
      const message = this.extractHttpExceptionMessage(httpException);

      const log =
        status >= 500 ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger);

      log(`[${status}] ${request.method} ${safeUrl(request.url)} - ${JSON.stringify(message)}`);

      response.status(status).json({ status, message });
      return;
    }

    this.logger.error(
      `Unhandled exception at ${request.method} ${safeUrl(request.url)} from ${request.ip}`,
      exception instanceof Error ? exception : String(exception),
    );

    response.status(500).json({ status: 500, message: 'An unexpected error occurred.' });
    return;
  }

  private extractHttpExceptionMessage(exception: HttpException): unknown {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null && 'message' in response) {
      return (response as { message?: unknown }).message ?? 'An error occurred.';
    }

    return response;
  }
}
