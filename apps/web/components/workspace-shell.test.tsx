import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '@/components/workspace-shell';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

describe('WorkspaceShell', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    vi.restoreAllMocks();
  });

  it('does not render a fallback mini-calendar while page content is still loading', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/workspaces') {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({
            id: 'user-1',
            email: 'ada@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <WorkspaceShell pageTitle="" pageDescription="">
        {() => <p>Loading workspace...</p>}
      </WorkspaceShell>,
    );

    expect(screen.getByText('Loading workspace...')).toBeVisible();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/workspaces', {
        method: 'GET',
        cache: 'no-store',
      });
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
        method: 'GET',
        cache: 'no-store',
      });
    });
  });

  it('does not render guest auth actions while authenticated shell data is still loading', async () => {
    let releaseFetches: (() => void) | null = null;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetches = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      await fetchGate;

      if (url === '/api/workspaces') {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({
            id: 'user-1',
            email: 'ada@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <WorkspaceShell pageTitle="" pageDescription="">
        {() => <p>Loading workspace...</p>}
      </WorkspaceShell>,
    );

    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();

    releaseFetches?.();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ada Lovelace/i })).toBeVisible();
    });
  });
});
