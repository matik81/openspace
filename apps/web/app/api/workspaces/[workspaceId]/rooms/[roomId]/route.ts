import { NextRequest, NextResponse } from 'next/server';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type RoomRouteContext = {
  params: Promise<{
    workspaceId: string;
    roomId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RoomRouteContext): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    const roomId = params.roomId?.trim();

    if (!workspaceId || !roomId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId and roomId are required',
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
      description?: string | null;
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

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      const rawDescription = body.description;
      if (rawDescription === null) {
        updatePayload.description = null;
      } else {
        const description = getTrimmedString(body, 'description');
        if (!description) {
          return NextResponse.json<ErrorPayload>(
            {
              code: 'BAD_REQUEST',
              message: 'description must be a non-empty string or null',
            },
            { status: 400 },
          );
        }

        updatePayload.description = description;
      }
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
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms/${encodeURIComponent(roomId)}`,
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

export async function DELETE(request: NextRequest, context: RoomRouteContext): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    const roomId = params.roomId?.trim();
    if (!workspaceId || !roomId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId and roomId are required',
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

    const roomName = getTrimmedString(body, 'roomName');
    const email = getTrimmedString(body, 'email');
    const password = getTrimmedString(body, 'password');
    if (!roomName || !email || !password) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'roomName, email, and password are required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms/${encodeURIComponent(roomId)}`,
      method: 'DELETE',
      body: {
        roomName,
        email,
        password,
      },
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
