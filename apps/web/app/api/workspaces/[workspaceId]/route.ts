import { NextRequest, NextResponse } from 'next/server';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type WorkspaceRouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: WorkspaceRouteContext,
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    if (!workspaceId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId is required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}`,
      method: 'GET',
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

export async function PATCH(
  request: NextRequest,
  context: WorkspaceRouteContext,
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    if (!workspaceId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId is required',
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
      name?: string;
      timezone?: string;
      scheduleStartHour?: number;
      scheduleEndHour?: number;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = getTrimmedString(body, 'name');
      if (!name) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'name must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }

      updatePayload.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'timezone')) {
      const timezone = getTrimmedString(body, 'timezone');
      if (!timezone) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'timezone must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }

      updatePayload.timezone = timezone;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'scheduleStartHour')) {
      if (
        typeof body.scheduleStartHour !== 'number' ||
        !Number.isInteger(body.scheduleStartHour)
      ) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'scheduleStartHour must be an integer when provided',
          },
          { status: 400 },
        );
      }

      updatePayload.scheduleStartHour = body.scheduleStartHour;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'scheduleEndHour')) {
      if (typeof body.scheduleEndHour !== 'number' || !Number.isInteger(body.scheduleEndHour)) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'scheduleEndHour must be an integer when provided',
          },
          { status: 400 },
        );
      }

      updatePayload.scheduleEndHour = body.scheduleEndHour;
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
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}`,
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
