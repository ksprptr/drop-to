import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
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
 * Normalizes every exception to `{ status, message }`; unknown errors → 500.
 **/
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractHttpExceptionMessage(exception);

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
