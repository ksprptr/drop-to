import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';

import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Captures the response `status()`/`json()` calls a filter makes.
 */
const buildHost = (): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/x', ip: '127.0.0.1' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    // Silence the logger so test output stays clean.
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
});
