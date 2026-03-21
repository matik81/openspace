import {
  OPAQUE_TOKEN_MAX_LENGTH,
  PASSWORD_MAX_UTF8_BYTES,
  STRING_LENGTH_LIMITS,
} from '@openspace/shared';
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
    expect(await screen.findByText('The passwords do not match.')).toBeVisible();
  });

  it('shows invalid credentials when login fails with the backend login error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PublicAuthModal
        mode="login"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const form = screen.getByLabelText('Password').closest('form');

    expect(form).not.toBeNull();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(within(form as HTMLFormElement).getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid credentials.')).toBeVisible();
    expect(screen.queryByText('Your session has expired. Please log in again.')).not.toBeInTheDocument();
  });

  it('blocks login when the password exceeds the UTF-8 byte limit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PublicAuthModal
        mode="login"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const form = screen.getByLabelText('Password').closest('form');

    expect(form).not.toBeNull();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), '\u00E9'.repeat(40));
    await user.click(within(form as HTMLFormElement).getByRole('button', { name: 'Login' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        new RegExp(`^Password must be at most ${PASSWORD_MAX_UTF8_BYTES} UTF-8 bytes\\.$`),
      ),
    ).toBeVisible();
  });

  it('marks registration credential fields to resist browser autofill', () => {
    render(
      <PublicAuthModal
        mode="register"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    const form = screen.getByLabelText('Confirm password').closest('form');

    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('First name')).toHaveAttribute(
      'maxlength',
      String(STRING_LENGTH_LIMITS.userFirstName),
    );
    expect(screen.getByLabelText('Last name')).toHaveAttribute(
      'maxlength',
      String(STRING_LENGTH_LIMITS.userLastName),
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'register-email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'maxlength',
      String(STRING_LENGTH_LIMITS.userEmail),
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'register-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'maxlength',
      String(PASSWORD_MAX_UTF8_BYTES),
    );
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
      'name',
      'register-confirm-password',
    );
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
      'maxlength',
      String(PASSWORD_MAX_UTF8_BYTES),
    );
  });

  it('limits opaque token inputs in verification and password reset flows', () => {
    const { rerender } = render(
      <PublicAuthModal
        mode="verify-email"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Verification token')).toHaveAttribute(
      'maxlength',
      String(OPAQUE_TOKEN_MAX_LENGTH),
    );

    rerender(
      <PublicAuthModal
        mode="reset-password"
        searchParams={createSearchParams()}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Reset token')).toHaveAttribute(
      'maxlength',
      String(OPAQUE_TOKEN_MAX_LENGTH),
    );
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

  it('loads invitation details and submits invitation registration without verify-email step', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            email: 'invitee@example.com',
            workspaceName: 'Engineering',
            inviterName: 'Ada Lovelace',
            expiresAt: '2026-03-25T10:00:00.000Z',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
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
        mode="register-invitation"
        searchParams={createSearchParams({ invitationToken: 'invite-token' })}
        onClose={vi.fn()}
        onSwitchMode={onSwitchMode}
      />,
    );

    expect(await screen.findByText(/Ada Lovelace/)).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('invitee@example.com');

    const user = userEvent.setup();
    const form = screen.getByLabelText('Confirm password').closest('form');

    expect(form).not.toBeNull();
    await user.type(screen.getByLabelText('First name'), 'Grace');
    await user.type(screen.getByLabelText('Last name'), 'Hopper');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(
      within(form as HTMLFormElement).getByRole('button', { name: 'Create invited account' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [url, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/auth/register');
    expect(JSON.parse(String(requestInit.body))).toEqual({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'invitee@example.com',
      password: 'password123',
      invitationToken: 'invite-token',
    });

    expect(onSwitchMode).toHaveBeenCalledWith('login', {
      email: 'invitee@example.com',
      invitationRegistered: '1',
      inviterName: 'Ada Lovelace',
      workspaceName: 'Engineering',
      invitationToken: null,
      reason: null,
      token: null,
      registered: null,
      verified: null,
    });
  });
});
