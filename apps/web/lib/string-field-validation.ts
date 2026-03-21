import {
  buildMaxLengthMessage,
  buildMaxUtf8BytesMessage,
  isWithinMaxLength,
  isWithinMaxUtf8Bytes,
} from '@openspace/shared';
import type { ErrorPayload } from '@/lib/types';

export function getMaxLengthError(
  value: string,
  fieldName: string,
  maxLength: number,
): ErrorPayload | null {
  if (isWithinMaxLength(value, maxLength)) {
    return null;
  }

  return {
    code: 'BAD_REQUEST',
    message: buildMaxLengthMessage(fieldName, maxLength),
  };
}

export function getMaxUtf8BytesError(
  value: string,
  fieldName: string,
  maxBytes: number,
): ErrorPayload | null {
  if (isWithinMaxUtf8Bytes(value, maxBytes)) {
    return null;
  }

  return {
    code: 'BAD_REQUEST',
    message: buildMaxUtf8BytesMessage(fieldName, maxBytes),
  };
}
