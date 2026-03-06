import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AccountSettingsModal,
  type AccountSettingsFormState,
} from '@/components/layout/AccountSettingsModal';

const formState: AccountSettingsFormState = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

describe('AccountSettingsModal', () => {
  it('starts with password fields protected from browser autofill', async () => {
    const user = userEvent.setup();

    render(
      <AccountSettingsModal
        open
        form={formState}
        error={null}
        isSubmitting={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    );

    const currentPasswordInput = screen.getByLabelText('Current password');
    const newPasswordInput = screen.getByLabelText('New password');
    const confirmPasswordInput = screen.getByLabelText('Confirm new password');

    expect(currentPasswordInput).toHaveAttribute('autocomplete', 'off');
    expect(currentPasswordInput).toHaveAttribute('name', 'account-current-secret');
    expect(currentPasswordInput).toHaveAttribute('readonly');
    expect(newPasswordInput).toHaveAttribute('readonly');
    expect(confirmPasswordInput).toHaveAttribute('readonly');

    await user.click(currentPasswordInput);

    expect(currentPasswordInput).not.toHaveAttribute('readonly');
    expect(newPasswordInput).not.toHaveAttribute('readonly');
    expect(confirmPasswordInput).not.toHaveAttribute('readonly');
  });
});
