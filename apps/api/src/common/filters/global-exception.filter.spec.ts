import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * A Prisma known-request error whose message carries model/field names, like the real ones do.
 **/
const prismaError = (code: string) =>
  new PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`email\`) on model \`DriveAccount\``,
    { code, clientVersion: '7.10.0' },
  );

/**
 * Captures the response `status()`/`json()` calls a filter makes.
 **/
const buildHost = (
  url = '/api/v1/x',
): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url, ip: '127.0.0.1' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('maps an HttpException to its status and message', () => {
    const { host, status, json } = buildHost();

    filter.catch(new NotFoundException('Missing thing.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ status: 404, message: 'Missing thing.' });
  });

  it('preserves the default message array for a validation error', () => {
    const { host, json } = buildHost();

    filter.catch(new BadRequestException(['name should not be empty']), host);

    expect(json).toHaveBeenCalledWith({
      status: 400,
      message: ['name should not be empty'],
    });
  });

  it('maps an unknown (non-HTTP) error to a generic 500', () => {
    const { host, status, json } = buildHost();

    filter.catch(new Error('kaboom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      status: 500,
      message: 'An unexpected error occurred.',
    });
  });

  it('logs 5xx as error and 4xx as warn', () => {
    const warn = jest.spyOn(filter['logger'], 'warn');
    const error = jest.spyOn(filter['logger'], 'error');

    filter.catch(new NotFoundException('nope'), buildHost().host);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();

    filter.catch(new Error('unknown'), buildHost().host);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('redacts bearer-grade query values before logging the URL', () => {
    const warn = jest.spyOn(filter['logger'], 'warn');
    const { host } = buildHost(
      '/google-auth/google/callback?code=4/secret&state=nonce&scope=drive',
    );

    filter.catch(new NotFoundException('nope'), host);

    const logged = warn.mock.calls[0][0] as string;
    expect(logged).not.toContain('4/secret');
    expect(logged).not.toContain('nonce');
    expect(logged).toContain('code=%5Bredacted%5D');
    // Non-sensitive params survive, so the log is still useful for debugging.
    expect(logged).toContain('scope=drive');
  });

  it('leaves a query-less URL untouched', () => {
    const warn = jest.spyOn(filter['logger'], 'warn');

    filter.catch(new NotFoundException('nope'), buildHost('/api/v1/storage/drive/folders').host);

    expect(warn.mock.calls[0][0]).toContain('/api/v1/storage/drive/folders');
  });
  describe('Prisma errors', () => {
    it('maps a unique-constraint failure (P2002) to 409', () => {
      const { host, status, json } = buildHost();

      filter.catch(prismaError('P2002'), host);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ status: 409, message: 'This already exists.' });
    });

    it('maps a foreign-key failure (P2003) to 409', () => {
      const { host, status } = buildHost();

      filter.catch(prismaError('P2003'), host);

      expect(status).toHaveBeenCalledWith(409);
    });

    // The race this exists for: `disconnect()` reads the account, then deletes it, and a concurrent
    // request can remove it in between — a 404 is the honest answer, not a 500.
    it('maps a missing record (P2025) to 404', () => {
      const { host, status, json } = buildHost();

      filter.catch(prismaError('P2025'), host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ status: 404, message: 'This item no longer exists.' });
    });

    // Prisma's own messages name the model, field and constraint; that must not reach the client.
    it('never leaks Prisma internals into the response', () => {
      const { host, json } = buildHost();

      filter.catch(prismaError('P2002'), host);

      const body = JSON.stringify(json.mock.calls[0][0]);
      expect(body).not.toContain('DriveAccount');
      expect(body).not.toContain('email');
      expect(body).not.toContain('Unique constraint');
    });

    it('leaves an unmapped Prisma code as an unhandled 500', () => {
      const { host, status, json } = buildHost();
      jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

      filter.catch(prismaError('P2010'), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        status: 500,
        message: 'An unexpected error occurred.',
      });
    });
  });
});
