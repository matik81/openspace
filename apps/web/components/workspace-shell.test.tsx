import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    let releaseFetches!: () => void;
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

    releaseFetches();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ada Lovelace/i })).toBeVisible();
    });
  });

  it('opens leave workspace with an empty email field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/workspaces') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'workspace-1',
                name: 'Focus Lab',
                slug: 'focus-lab',
                timezone: 'UTC',
                scheduleStartHour: 8,
                scheduleEndHour: 18,
                createdAt: '2026-03-07T12:00:00.000Z',
                updatedAt: '2026-03-07T12:00:00.000Z',
                membership: {
                  role: 'MEMBER',
                  status: 'ACTIVE',
                },
                invitation: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
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
      <WorkspaceShell
        selectedWorkspaceId="workspace-1"
        pageTitle=""
        pageDescription=""
      >
        {() => <p>Workspace content</p>}
      </WorkspaceShell>,
    );

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ada Lovelace/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Leave workspace' }));

    expect(await screen.findByRole('heading', { name: 'Leave Workspace' })).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('opens the create workspace modal from the header switcher menu', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/workspaces') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'workspace-1',
                name: 'Focus Lab',
                slug: 'focus-lab',
                timezone: 'UTC',
                scheduleStartHour: 8,
                scheduleEndHour: 18,
                createdAt: '2026-03-07T12:00:00.000Z',
                updatedAt: '2026-03-07T12:00:00.000Z',
                membership: {
                  role: 'ADMIN',
                  status: 'ACTIVE',
                },
                invitation: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
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
      <WorkspaceShell selectedWorkspaceId="workspace-1" pageTitle="" pageDescription="">
        {() => <p>Workspace content</p>}
      </WorkspaceShell>,
    );

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Focus Lab/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /Focus Lab/i }));
    await user.click(screen.getByRole('menuitem', { name: /New workspace/i }));

    expect(await screen.findByRole('heading', { name: 'Create Workspace' })).toBeVisible();
  });

  it('switches workspaces from the header dropdown', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/workspaces') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'workspace-1',
                name: 'Focus Lab',
                slug: 'focus-lab',
                timezone: 'UTC',
                scheduleStartHour: 8,
                scheduleEndHour: 18,
                createdAt: '2026-03-07T12:00:00.000Z',
                updatedAt: '2026-03-07T12:00:00.000Z',
                membership: {
                  role: 'ADMIN',
                  status: 'ACTIVE',
                },
                invitation: null,
              },
              {
                id: 'workspace-2',
                name: 'Blue Room',
                slug: 'blue-room',
                timezone: 'UTC',
                scheduleStartHour: 8,
                scheduleEndHour: 18,
                createdAt: '2026-03-07T12:00:00.000Z',
                updatedAt: '2026-03-07T12:00:00.000Z',
                membership: {
                  role: 'MEMBER',
                  status: 'ACTIVE',
                },
                invitation: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
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
      <WorkspaceShell selectedWorkspaceId="workspace-1" pageTitle="" pageDescription="">
        {() => <p>Workspace content</p>}
      </WorkspaceShell>,
    );

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Focus Lab/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /Focus Lab/i }));
    const focusLabItem = screen.getByRole('menuitemradio', { name: /Focus Lab/i });
    const blueRoomItem = screen.getByRole('menuitemradio', { name: /Blue Room/i });

    expect(within(focusLabItem).getByText('ADMIN')).toBeVisible();
    expect(within(blueRoomItem).queryByText('ADMIN')).not.toBeInTheDocument();

    await user.click(blueRoomItem);

    expect(pushMock).toHaveBeenCalledWith('/blue-room');
  });

  it('resolves selected workspace from the slug-based route parameter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/workspaces') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'workspace-1',
                name: 'Focus Lab',
                slug: 'focus-lab',
                timezone: 'UTC',
                scheduleStartHour: 8,
                scheduleEndHour: 18,
                createdAt: '2026-03-07T12:00:00.000Z',
                updatedAt: '2026-03-07T12:00:00.000Z',
                membership: {
                  role: 'MEMBER',
                  status: 'ACTIVE',
                },
                invitation: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
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
      <WorkspaceShell selectedWorkspaceName="focus-lab" pageTitle="" pageDescription="">
        {() => <p>Workspace content</p>}
      </WorkspaceShell>,
    );

    await waitFor(() => {
      expect(screen.getByText('Workspace content')).toBeVisible();
    });

    expect(replaceMock).not.toHaveBeenCalledWith('/dashboard');
  });
});
