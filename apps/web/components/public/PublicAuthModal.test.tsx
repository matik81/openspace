import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicAuthModal } from '@/components/public/PublicAuthModal';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

function createSearchParams(entries: Record<string, string> = {}) {
  return {
    get: (key: string) => entries[key] ?? null,
  };
}

describe('PublicAuthModal', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.restoreAllMocks();
  });

  it('shows a validation error before sending a mismatched registration form', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PublicAuthModal
        mode="register"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const form = screen.getByLabelText('Confirm password').closest('form');

    expect(form).not.toBeNull();
    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'different123');
    await user.click(within(form as HTMLFormElement).getByRole('button', { name: 'Register' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('The password confirmation does not match.')).toBeVisible();
  });

  it('submits registration and switches to verify-email mode on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    const onSwitchMode = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PublicAuthModal
        mode="register"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={onSwitchMode}
      />,
    );

    const user = userEvent.setup();
    const form = screen.getByLabelText('Confirm password').closest('form');

    expect(form).not.toBeNull();
    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(within(form as HTMLFormElement).getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/register');
    expect(requestInit.method).toBe('POST');
    expect(JSON.parse(String(requestInit.body))).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'password123',
    });

    expect(onSwitchMode).toHaveBeenCalledWith('verify-email', {
      email: 'ada@example.com',
      registered: '1',
      token: null,
      verified: null,
    });
  });
});
