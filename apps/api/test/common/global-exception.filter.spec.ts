import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';

function createHostMocks() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('formats HttpException responses to { code, message }', () => {
    const { host, status, json } = createHostMocks();
    const exception = new HttpException(
      { code: 'EMAIL_NOT_VERIFIED', message: 'Email must be verified before login' },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email must be verified before login',
    });
  });

  it('maps unknown errors to INTERNAL_SERVER_ERROR', () => {
    const { host, status, json } = createHostMocks();

    filter.catch(new Error('unexpected'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    });
  });

  it('maps Prisma constraint errors to DATABASE_CONSTRAINT_ERROR', () => {
    const { host, status, json } = createHostMocks();
    const prismaError = new PrismaClientKnownRequestError('constraint', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });

    filter.catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      code: 'DATABASE_CONSTRAINT_ERROR',
      message: 'Database constraint violated',
    });
  });
});
