import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { handlePrismaError } from './prisma-error.functions';

/**
 * Builds a Prisma known-request error with the given code.
 **/
const prismaError = (code: string): PrismaClientKnownRequestError =>
  new PrismaClientKnownRequestError('boom', { code, clientVersion: '7.0.0' });

const messages = {
  P2002: 'Already exists.',
  P2003: 'Related record missing.',
  P2025: 'Not found.',
};

describe('handlePrismaError', () => {
  it('maps P2002 (unique violation) to 409 Conflict', () => {
    expect(() => handlePrismaError(prismaError('P2002'), messages)).toThrow(ConflictException);
    expect(() => handlePrismaError(prismaError('P2002'), messages)).toThrow('Already exists.');
  });

  it('maps P2003 (foreign-key violation) to 409 Conflict', () => {
    expect(() => handlePrismaError(prismaError('P2003'), messages)).toThrow(ConflictException);
    expect(() => handlePrismaError(prismaError('P2003'), messages)).toThrow(
      'Related record missing.',
    );
  });

  it('maps P2025 (record not found) to 404 Not Found', () => {
    expect(() => handlePrismaError(prismaError('P2025'), messages)).toThrow(NotFoundException);
    expect(() => handlePrismaError(prismaError('P2025'), messages)).toThrow('Not found.');
  });

  it('rethrows a known Prisma code that has no message mapped', () => {
    const error = prismaError('P2002');

    expect(() => handlePrismaError(error, {})).toThrow(error);
  });

  it('rethrows an unhandled Prisma code unchanged', () => {
    const error = prismaError('P9999');

    expect(() => handlePrismaError(error, messages)).toThrow(error);
  });

  it('rethrows an existing HttpException unchanged', () => {
    const error = new BadRequestException('nope');

    expect(() => handlePrismaError(error, messages)).toThrow(error);
  });

  it('rethrows a non-Prisma error unchanged', () => {
    const error = new Error('some other error');

    expect(() => handlePrismaError(error, messages)).toThrow(error);
  });
});
