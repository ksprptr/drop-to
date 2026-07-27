import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

/** Messages for the handled Prisma codes: P2002/P2003 → 409, P2025 → 404. */
export interface PrismaErrorMessages {
  P2002?: string;
  P2003?: string;
  P2025?: string;
}

/**
 * Maps a caught Prisma error onto an HTTP exception (always throws; rethrows unmapped).
 **/
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
