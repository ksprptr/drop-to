import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

/**
 * Per-code messages for mapping a Prisma error onto an HTTP exception.
 * - `P2002` unique-constraint violation  → 409 Conflict
 * - `P2003` foreign-key-constraint violation → 409 Conflict
 * - `P2025` record not found → 404 Not Found
 */
export interface PrismaErrorMessages {
  P2002?: string;
  P2003?: string;
  P2025?: string;
}

/**
 * Function to normalize a caught Prisma error into the appropriate HTTP exception.
 *
 * Rethrows the original error unchanged when it is already an `HttpException`, is not a known Prisma
 * request error, or its code has no message mapped. Always throws (return type `never`), so it can be
 * the only statement in a catch block.
 *
 * @param error - The caught error
 * @param messages - Messages to throw for the handled Prisma codes
 */
export function handlePrismaError(error: unknown, messages: PrismaErrorMessages): never {
  if (error instanceof HttpException || !(error instanceof PrismaClientKnownRequestError)) {
    throw error;
  }

  if (error.code === 'P2002' && messages.P2002) {
    throw new ConflictException(messages.P2002);
  }

  if (error.code === 'P2003' && messages.P2003) {
    throw new ConflictException(messages.P2003);
  }

  if (error.code === 'P2025' && messages.P2025) {
    throw new NotFoundException(messages.P2025);
  }

  throw error;
}
