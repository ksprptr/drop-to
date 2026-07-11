import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Class representing a global exception filter
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  /**
   * Handles all uncaught exceptions in the application
   * @param exception - The caught exception
   * @param host - The arguments host containing the request and response objects
   *
   * Logs the error and sends a standardized JSON response.
   * - Returns the original status and message for HttpException
   * - Returns 500 for unknown errors
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Handle HttpExceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractHttpExceptionMessage(exception);

      const log =
        status >= 500 ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger);

      log(`[${status}] ${request.method} ${request.url} - ${JSON.stringify(message)}`);

      response.status(status).json({ status, message });
      return;
    }

    // Handle unknown errors
    this.logger.error(
      `Unhandled exception at ${request.method} ${request.url} from ${request.ip}`,
      exception instanceof Error ? exception : String(exception),
    );

    response.status(500).json({ status: 500, message: 'An unexpected error occurred.' });
    return;
  }

  /**
   * Helper function to extract message from HttpException
   * @param exception - The HttpException instance
   * @returns The extracted message or the original response if no message is found
   */
  private extractHttpExceptionMessage(exception: HttpException): unknown {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null && 'message' in response) {
      return (response as { message?: unknown }).message ?? 'An error occurred.';
    }

    return response;
  }
}
