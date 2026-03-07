import { NextRequest, NextResponse } from 'next/server';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type BookingRouteContext = {
  params: Promise<{
    workspaceId: string;
    bookingId: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: BookingRouteContext,
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    const bookingId = params.bookingId?.trim();
    if (!workspaceId || !bookingId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId and bookingId are required',
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'Request body must be a JSON object',
        },
        { status: 400 },
      );
    }

    const updatePayload: {
      roomId?: string;
      startAt?: string;
      endAt?: string;
      subject?: string;
      criticality?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'roomId')) {
      const roomId = getTrimmedString(body, 'roomId');
      if (!roomId) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'roomId must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
      updatePayload.roomId = roomId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'startAt')) {
      const startAt = getTrimmedString(body, 'startAt');
      if (!startAt) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'startAt must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
      updatePayload.startAt = startAt;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'endAt')) {
      const endAt = getTrimmedString(body, 'endAt');
      if (!endAt) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'endAt must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
      updatePayload.endAt = endAt;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'subject')) {
      const subject = getTrimmedString(body, 'subject');
      if (!subject) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'subject must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
      updatePayload.subject = subject;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'criticality')) {
      const criticality = getTrimmedString(body, 'criticality');
      if (!criticality) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'criticality must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
      updatePayload.criticality = criticality;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'At least one field must be provided',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(
        bookingId,
      )}`,
      method: 'PATCH',
      body: updatePayload,
    });
  } catch {
    return NextResponse.json<ErrorPayload>(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Unable to reach API service',
      },
      { status: 503 },
    );
  }
}

