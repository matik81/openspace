import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

type ErrorPayload = {
  code: string;
  message: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (statusCode: number) => { json: (body: ErrorPayload) => void };
    }>();

    const normalized = this.normalizeException(exception);
    response.status(normalized.statusCode).json(normalized.error);
  }

  private normalizeException(exception: unknown): { statusCode: number; error: ErrorPayload } {
    if (exception instanceof HttpException) {
      return this.normalizeHttpException(exception);
    }

    if (exception instanceof PrismaClientKnownRequestError) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: {
          code: 'DATABASE_CONSTRAINT_ERROR',
          message: 'Database constraint violated',
        },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
      },
    };
  }

  private normalizeHttpException(exception: HttpException): { statusCode: number; error: ErrorPayload } {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const defaultCode = this.mapStatusToCode(statusCode);

    if (typeof response === 'string') {
      return {
        statusCode,
        error: {
          code: defaultCode,
          message: response,
        },
      };
    }

    if (typeof response === 'object' && response !== null) {
      const body = response as Record<string, unknown>;
      const code = typeof body.code === 'string' && body.code.trim().length > 0 ? body.code : defaultCode;
      const message = this.extractMessage(body);

      return {
        statusCode,
        error: {
          code,
          message,
        },
      };
    }

    return {
      statusCode,
      error: {
        code: defaultCode,
        message: 'Request failed',
      },
    };
  }

  private extractMessage(body: Record<string, unknown>): string {
    if (typeof body.message === 'string') {
      return body.message;
    }

    if (Array.isArray(body.message) && body.message.every((item) => typeof item === 'string')) {
      return body.message.join(', ');
    }

    if (typeof body.error === 'string') {
      return body.error;
    }

    return 'Request failed';
  }

  private mapStatusToCode(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return `HTTP_${statusCode}`;
    }
  }
}
