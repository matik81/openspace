import { NextRequest, NextResponse } from 'next/server';
import { STRING_LENGTH_LIMITS } from '@openspace/shared';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import { getMaxLengthError } from '@/lib/string-field-validation';
import type { ErrorPayload } from '@/lib/types';

type WorkspaceRouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
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

    const query = request.nextUrl.searchParams.toString();
    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms${
        query.length > 0 ? `?${query}` : ''
      }`,
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

export async function POST(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
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

    const name = getTrimmedString(body, 'name');
    if (!name) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'name is required',
        },
        { status: 400 },
      );
    }

    const nameError = getMaxLengthError(name, 'name', STRING_LENGTH_LIMITS.roomName);
    if (nameError) {
      return NextResponse.json<ErrorPayload>(nameError, { status: 400 });
    }

    let description: string | undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      const value = getTrimmedString(body, 'description');
      if (!value) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'description must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }

      const descriptionError = getMaxLengthError(
        value,
        'description',
        STRING_LENGTH_LIMITS.roomDescription,
      );
      if (descriptionError) {
        return NextResponse.json<ErrorPayload>(descriptionError, { status: 400 });
      }

      description = value;
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms`,
      method: 'POST',
      body: description === undefined ? { name } : { name, description },
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
