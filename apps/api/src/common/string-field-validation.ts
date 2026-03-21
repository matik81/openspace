import { BadRequestException } from '@nestjs/common';
import {
  PASSWORD_MAX_UTF8_BYTES,
  PASSWORD_MIN_LENGTH,
  buildMaxLengthMessage,
  buildMaxUtf8BytesMessage,
  getUtf8ByteLength,
} from '@openspace/shared';

export function requireTrimmedString(
  value: string | undefined | null,
  fieldName: string,
  options?: { maxLength?: number },
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: `${fieldName} is required`,
    });
  }

  const normalized = value.trim();
  if (options?.maxLength !== undefined && normalized.length > options.maxLength) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: buildMaxLengthMessage(fieldName, options.maxLength),
    });
  }

  return normalized;
}

export function requirePassword(
  value: string | undefined | null,
  fieldName = 'password',
): string {
  const password = requireTrimmedString(value, fieldName);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new BadRequestException({
      code: 'WEAK_PASSWORD',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    });
  }
  if (getUtf8ByteLength(password) > PASSWORD_MAX_UTF8_BYTES) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: buildMaxUtf8BytesMessage(fieldName, PASSWORD_MAX_UTF8_BYTES),
    });
  }

  return password;
}

export function assertMaxUtf8ByteLength(
  value: string,
  fieldName: string,
  maxBytes: number,
): void {
  if (getUtf8ByteLength(value) > maxBytes) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: buildMaxUtf8BytesMessage(fieldName, maxBytes),
    });
  }
}
