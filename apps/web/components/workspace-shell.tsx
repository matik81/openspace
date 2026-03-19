'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccountSettingsModal,
  type AccountSettingsFormState,
} from '@/components/layout/AccountSettingsModal';
import {
  CreateWorkspaceModal,
  type CreateWorkspaceFormState,
} from '@/components/layout/CreateWorkspaceModal';
import {
  CriticalUserActionModal,
  type CriticalUserActionFormState,
} from '@/components/layout/CriticalUserActionModal';
import { Header } from '@/components/layout/Header';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { getErrorDisplayMessage } from '@/lib/error-display';
import { isRecord, normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import { resolveDefaultTimezone } from '@/lib/iana-timezones';
import { isUserSuspendedError, logoutSuspendedUser } from '@/lib/session-guards';
import type { ErrorPayload, WorkspaceItem } from '@/lib/types';
import {
  buildWorkspaceAdminPathFromSlug,
  buildWorkspacePathFromSlug,
  normalizeWorkspaceSlugCandidate,
  resolveWorkspaceByRouteSlug,
} from '@/lib/workspace-routing';
import { isWorkspaceListPayload } from '@/lib/workspace-payloads';

type InvitationAction = 'accept' | 'reject';

type AuthUserSummary = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type WorkspaceShellRenderContext = {
  items: WorkspaceItem[];
  selectedWorkspace: WorkspaceItem | null;
  currentUser: AuthUserSummary | null;
  isLoading: boolean;
  error: ErrorPayload | null;
  banner: string | null;
  pendingInvitationAction: {
    invitationId: string;
    action: InvitationAction;
  } | null;
  loadWorkspaces: () => Promise<void>;
  runInvitationAction: (invitationId: string, action: InvitationAction) => Promise<void>;
};

type WorkspaceShellPageLayout = {
  main: ReactNode;
  rightSidebar?: ReactNode;
};

type WorkspaceShellProps = {
  selectedWorkspaceId?: string;
  selectedWorkspaceName?: string;
  pageTitle: string;
  pageDescription: string;
  pageBackHref?: string;
  pageBackLabel?: string;
  pageBackAriaLabel?: string;
  children: (context: WorkspaceShellRenderContext) => ReactNode | WorkspaceShellPageLayout;
};

const createWorkspaceInitialState: CreateWorkspaceFormState = {
  name: '',
  slug: '',
  timezone: 'UTC',
  scheduleStartHour: 8,
  scheduleEndHour: 18,
};
const criticalActionInitialState: CriticalUserActionFormState = {
  email: '',
  password: '',
};
const accountSettingsInitialState: AccountSettingsFormState = {
  firstName: '',
  lastName: '',
  email: '',
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

let workspaceItemsCache: WorkspaceItem[] | null = null;
let currentUserCache: AuthUserSummary | null = null;

function isAuthUserSummary(value: unknown): value is AuthUserSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

export function WorkspaceShell({
  selectedWorkspaceId,
  selectedWorkspaceName,
  pageTitle,
  pageDescription,
  pageBackHref,
  pageBackLabel,
  pageBackAriaLabel,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>(() => workspaceItemsCache ?? []);
  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(() => currentUserCache);
  const [isLoading, setIsLoading] = useState(workspaceItemsCache === null);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<{
    invitationId: string;
    action: InvitationAction;
  } | null>(null);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceForm, setCreateWorkspaceForm] = useState<CreateWorkspaceFormState>(
    createWorkspaceInitialState,
  );
  const [createWorkspaceError, setCreateWorkspaceError] = useState<ErrorPayload | null>(null);
  const [isRightSidebarOpenMobile, setIsRightSidebarOpenMobile] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountSettingsForm, setAccountSettingsForm] = useState<AccountSettingsFormState>(
    accountSettingsInitialState,
  );
  const [accountSettingsError, setAccountSettingsError] = useState<ErrorPayload | null>(null);
  const [isSubmittingAccountSettings, setIsSubmittingAccountSettings] = useState(false);
  const [activeCriticalAction, setActiveCriticalAction] = useState<
    'leave' | 'delete-account' | null
  >(null);
  const [criticalActionForm, setCriticalActionForm] = useState<CriticalUserActionFormState>(
    criticalActionInitialState,
  );
  const [criticalActionError, setCriticalActionError] = useState<ErrorPayload | null>(null);
  const [isSubmittingCriticalAction, setIsSubmittingCriticalAction] = useState(false);

  const selectedWorkspace = useMemo(
    () =>
      selectedWorkspaceId
        ? (items.find((item) => item.id === selectedWorkspaceId) ?? null)
        : selectedWorkspaceName
          ? resolveWorkspaceByRouteSlug(items, selectedWorkspaceName)
          : null,
    [items, selectedWorkspaceId, selectedWorkspaceName],
  );
  const loadWorkspaces = useCallback(async () => {
    setIsLoading((current) => current || workspaceItemsCache === null);
    setError(null);

    const [workspaceResult, meResult] = await Promise.all([
      (async () => {
        const response = await fetch('/api/workspaces', { method: 'GET', cache: 'no-store' });
        const payload = await safeReadJson(response);
        return { response, payload };
      })(),
      (async () => {
        const response = await fetch('/api/auth/me', { method: 'GET', cache: 'no-store' });
        const payload = await safeReadJson(response);
        return { response, payload };
      })(),
    ]);
    const { response, payload } = workspaceResult;

    if (!response.ok) {
      const normalized = normalizeErrorPayload(payload, response.status);
      if (isUserSuspendedError(normalized)) {
        await logoutSuspendedUser(router);
        return;
      }
      if (normalized.code === 'UNAUTHORIZED') {
        router.replace('/login?reason=session-expired');
        return;
      }

      if (normalized.code === 'EMAIL_NOT_VERIFIED') {
        router.replace('/verify-email');
        return;
      }

      setError(normalized);
      setIsLoading(false);
      return;
    }

    if (!isWorkspaceListPayload(payload)) {
      setError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected workspace payload',
      });
      setIsLoading(false);
      return;
    }

    setItems(payload.items);
    workspaceItemsCache = payload.items;
    const { response: meResponse, payload: mePayload } = meResult;
    if (meResponse.ok && isAuthUserSummary(mePayload)) {
      setCurrentUser(mePayload);
      currentUserCache = mePayload;
    } else if (!meResponse.ok) {
      const normalized = normalizeErrorPayload(mePayload, meResponse.status);
      if (isUserSuspendedError(normalized)) {
        await logoutSuspendedUser(router);
        return;
      }
      if (normalized.code === 'UNAUTHORIZED') {
        router.replace('/login?reason=session-expired');
        return;
      }

      if (normalized.code === 'EMAIL_NOT_VERIFIED') {
        router.replace('/verify-email');
        return;
      }

      setCurrentUser(null);
      currentUserCache = null;
    } else {
      setCurrentUser(null);
      currentUserCache = null;
    }

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    workspaceItemsCache = items;
  }, [items]);

  useEffect(() => {
    setIsRightSidebarOpenMobile(false);
  }, [selectedWorkspaceId, selectedWorkspaceName]);

  useEffect(() => {
    if (!selectedWorkspaceId || isLoading || error) {
      return;
    }
    if (!selectedWorkspace) {
      router.replace('/dashboard');
    }
  }, [error, isLoading, router, selectedWorkspace, selectedWorkspaceId]);

  const resetCreateWorkspaceForm = useCallback(() => {
    setCreateWorkspaceForm({
      name: '',
      slug: '',
      timezone: resolveDefaultTimezone(),
      scheduleStartHour: 8,
      scheduleEndHour: 18,
    });
    setCreateWorkspaceError(null);
  }, []);

  const closeCreateWorkspaceModal = useCallback(() => {
    setIsCreateWorkspaceModalOpen(false);
    resetCreateWorkspaceForm();
    setIsCreatingWorkspace(false);
  }, [resetCreateWorkspaceForm]);

  const runInvitationAction = useCallback(
    async (invitationId: string, action: InvitationAction) => {
      setPendingInvitationAction({ invitationId, action });
      setError(null);
      setBanner(null);

      const response = await fetch(`/api/workspaces/invitations/${invitationId}/${action}`, {
        method: 'POST',
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(payload, response.status);
        if (normalized.code === 'UNAUTHORIZED') {
          router.replace('/login?reason=session-expired');
          return;
        }

        setError(normalized);
        setPendingInvitationAction(null);
        return;
      }

      setBanner(action === 'accept' ? 'Invitation accepted.' : 'Invitation rejected.');
      await loadWorkspaces();
      setPendingInvitationAction(null);
    },
    [loadWorkspaces, router],
  );

  const handleCreateWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isCreatingWorkspace) {
        return;
      }

      setIsCreatingWorkspace(true);
      setCreateWorkspaceError(null);
      setBanner(null);

      try {
        const response = await fetch('/api/workspaces', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            name: createWorkspaceForm.name,
            slug: createWorkspaceForm.slug,
            timezone: createWorkspaceForm.timezone,
            scheduleStartHour: createWorkspaceForm.scheduleStartHour,
            scheduleEndHour: createWorkspaceForm.scheduleEndHour,
          }),
        });
        const payload = await safeReadJson(response);

        if (!response.ok) {
          const normalized = normalizeErrorPayload(payload, response.status);
          if (normalized.code === 'UNAUTHORIZED') {
            router.replace('/login?reason=session-expired');
            return;
          }

          if (normalized.code === 'EMAIL_NOT_VERIFIED') {
            router.replace('/verify-email');
            return;
          }

          setCreateWorkspaceError(normalized);
          return;
        }

        const createdWorkspaceId =
          isRecord(payload) && typeof payload.id === 'string' ? payload.id : null;
        const createdWorkspaceSlug = normalizeWorkspaceSlugCandidate(createWorkspaceForm.slug);

        setBanner('Workspace created.');
        closeCreateWorkspaceModal();
        await loadWorkspaces();
        if (createdWorkspaceSlug) {
          router.push(buildWorkspaceAdminPathFromSlug(createdWorkspaceSlug));
          return;
        }
        if (createdWorkspaceId) {
          const createdWorkspace =
            workspaceItemsCache?.find((item) => item.id === createdWorkspaceId) ?? null;
          if (createdWorkspace) {
            router.push(buildWorkspaceAdminPathFromSlug(createdWorkspace.slug));
          }
          return;
        }
      } catch {
        setCreateWorkspaceError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to reach API service',
        });
      } finally {
        setIsCreatingWorkspace(false);
      }
    },
    [closeCreateWorkspaceModal, createWorkspaceForm, isCreatingWorkspace, loadWorkspaces, router],
  );

  const handleLogout = useCallback(async () => {
    workspaceItemsCache = null;
    currentUserCache = null;
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const closeAccountSettingsModal = useCallback(() => {
    setIsAccountSettingsOpen(false);
    setAccountSettingsError(null);
    setIsSubmittingAccountSettings(false);
    setAccountSettingsForm(
      currentUser
        ? {
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.email,
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: '',
          }
        : accountSettingsInitialState,
    );
  }, [currentUser]);

  const closeCriticalActionModal = useCallback(() => {
    setActiveCriticalAction(null);
    setCriticalActionForm(criticalActionInitialState);
    setCriticalActionError(null);
    setIsSubmittingCriticalAction(false);
  }, []);

  const handleLeaveWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !currentUser || isSubmittingCriticalAction) {
        return;
      }

      setIsSubmittingCriticalAction(true);
      setCriticalActionError(null);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/leave`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(criticalActionForm),
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(payload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        if (normalized.code === 'UNAUTHORIZED') {
          router.replace('/login?reason=session-expired');
          return;
        }
        setCriticalActionError(normalized);
        setIsSubmittingCriticalAction(false);
        return;
      }

      closeCriticalActionModal();
      setBanner('You left the workspace.');
      await loadWorkspaces();
      router.replace('/dashboard');
    },
    [
      closeCriticalActionModal,
      criticalActionForm,
      currentUser,
      isSubmittingCriticalAction,
      loadWorkspaces,
      router,
      selectedWorkspace,
    ],
  );

  const handleDeleteAccount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!currentUser || isSubmittingCriticalAction) {
        return;
      }

      setIsSubmittingCriticalAction(true);
      setCriticalActionError(null);
      const response = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(criticalActionForm),
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(payload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        if (normalized.code === 'UNAUTHORIZED') {
          router.replace('/login?reason=session-expired');
          return;
        }
        setCriticalActionError(normalized);
        setIsSubmittingCriticalAction(false);
        return;
      }

      workspaceItemsCache = null;
      currentUserCache = null;
      closeCriticalActionModal();
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/?auth=login&reason=account-deleted');
      router.refresh();
    },
    [closeCriticalActionModal, criticalActionForm, currentUser, isSubmittingCriticalAction, router],
  );

  const handleAccountSettingsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!currentUser || isSubmittingAccountSettings) {
        return;
      }

      setAccountSettingsError(null);
      if (
        accountSettingsForm.newPassword &&
        accountSettingsForm.newPassword !== accountSettingsForm.confirmNewPassword
      ) {
        setAccountSettingsError({
          code: 'PASSWORD_MISMATCH',
          message: 'New password and confirmation must match',
        });
        return;
      }

      if (accountSettingsForm.newPassword && !accountSettingsForm.currentPassword.trim()) {
        setAccountSettingsError({
          code: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Current password is required when changing password',
        });
        return;
      }

      setIsSubmittingAccountSettings(true);
      const response = await fetch('/api/auth/update-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: accountSettingsForm.firstName,
          lastName: accountSettingsForm.lastName,
          currentPassword: accountSettingsForm.currentPassword || undefined,
          newPassword: accountSettingsForm.newPassword || undefined,
        }),
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(payload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        if (normalized.code === 'UNAUTHORIZED') {
          router.replace('/login?reason=session-expired');
          return;
        }
        setAccountSettingsError(normalized);
        setIsSubmittingAccountSettings(false);
        return;
      }

      if (!isAuthUserSummary(payload)) {
        setAccountSettingsError({
          code: 'BAD_GATEWAY',
          message: 'Unexpected account payload',
        });
        setIsSubmittingAccountSettings(false);
        return;
      }

      setCurrentUser(payload);
      currentUserCache = payload;
      setBanner('Account updated.');
      setIsSubmittingAccountSettings(false);
      closeAccountSettingsModal();
    },
    [
      accountSettingsForm,
      closeAccountSettingsModal,
      currentUser,
      isSubmittingAccountSettings,
      router,
    ],
  );

  const renderedChildren = children({
    items,
    selectedWorkspace,
    currentUser,
    isLoading,
    error,
    banner,
    pendingInvitationAction,
    loadWorkspaces,
    runInvitationAction,
  });
  const hasCustomLayout =
    renderedChildren !== null &&
    typeof renderedChildren === 'object' &&
    !Array.isArray(renderedChildren) &&
    'main' in renderedChildren;
  const pageMainContent = hasCustomLayout
    ? (renderedChildren as WorkspaceShellPageLayout).main
    : renderedChildren;
  const pageRightSidebar = hasCustomLayout
    ? ((renderedChildren as WorkspaceShellPageLayout).rightSidebar ?? null)
    : null;
  const effectiveRightSidebar = pageRightSidebar ?? null;
  const hasPageHeader = Boolean(pageTitle || pageDescription);
  const hasTopBlockContent = hasPageHeader || Boolean(banner) || Boolean(error);
  const canLeaveSelectedWorkspace =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    selectedWorkspace.membership.role !== 'ADMIN';
  const canOpenSelectedWorkspaceAdmin =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    selectedWorkspace.membership.role === 'ADMIN';
  const userMenuActions = currentUser
    ? [
        {
          key: 'account',
          label: 'Account',
          onClick: () => {
            setAccountSettingsForm({
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              email: currentUser.email,
              currentPassword: '',
              newPassword: '',
              confirmNewPassword: '',
            });
            setAccountSettingsError(null);
            setIsAccountSettingsOpen(true);
          },
        },
        ...(canLeaveSelectedWorkspace
          ? [
              {
                key: 'leave-workspace',
                label: 'Leave workspace',
                onClick: () => {
                  setCriticalActionForm({
                    email: '',
                    password: '',
                  });
                  setCriticalActionError(null);
                  setActiveCriticalAction('leave');
                },
              },
            ]
          : []),
        {
          key: 'logout',
          label: 'Logout',
          onClick: () => void handleLogout(),
        },
      ]
    : undefined;

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <Header
        user={currentUser}
        onLogout={() => void handleLogout()}
        onToggleRightSidebar={() => setIsRightSidebarOpenMobile(true)}
        leftContent={
          <div className="flex min-w-0 items-center gap-2">
            <WorkspaceSwitcher
              workspaces={items}
              selectedWorkspace={selectedWorkspace}
              onSelectWorkspace={(workspace) => {
                router.push(buildWorkspacePathFromSlug(workspace.slug));
              }}
              onCreateWorkspace={() => {
                resetCreateWorkspaceForm();
                setIsCreatingWorkspace(false);
                setIsCreateWorkspaceModalOpen(true);
              }}
            />
            {canOpenSelectedWorkspaceAdmin && selectedWorkspace ? (
              <Link
                href={buildWorkspaceAdminPathFromSlug(selectedWorkspace.slug)}
                className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex"
              >
                Admin
              </Link>
            ) : null}
          </div>
        }
        userActions={userMenuActions}
        showGuestActions={false}
      />

      <div className="flex h-full pt-16">
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="h-full p-3 sm:p-4">
              <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
                {hasPageHeader ? (
                  <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
                    {pageTitle ? (
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                          {pageTitle}
                        </h2>
                        {pageBackHref ? (
                          <Link
                            href={pageBackHref}
                            aria-label={pageBackAriaLabel ?? 'Close'}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            {pageBackLabel ?? 'Close'}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                    {pageDescription ? (
                      <p className="mt-1 text-sm text-slate-600">{pageDescription}</p>
                    ) : null}
                  </header>
                ) : null}

                {banner || error ? (
                  <div className="space-y-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                    {banner ? (
                      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        {banner}
                      </p>
                    ) : null}
                    {error ? (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {getErrorDisplayMessage(error)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div
                  className={`min-h-0 flex-1 overflow-y-auto ${
                    hasTopBlockContent ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
                  }`}
                >
                  {pageMainContent}
                </div>
              </section>
            </div>
          </div>

          <RightSidebar
            isOpenOnMobile={isRightSidebarOpenMobile}
            onCloseMobile={() => setIsRightSidebarOpenMobile(false)}
          >
            {effectiveRightSidebar}
          </RightSidebar>
        </div>
      </div>

      <CriticalUserActionModal
        open={activeCriticalAction === 'leave'}
        title="Leave Workspace"
        description="Confirm with your email and password. Future bookings in this workspace will be cancelled."
        confirmLabel="Leave workspace"
        cancelLabel="Stay in workspace"
        emailLabel="Email"
        passwordLabel="Password"
        isSubmitting={isSubmittingCriticalAction}
        error={criticalActionError}
        form={criticalActionForm}
        onChange={setCriticalActionForm}
        onClose={closeCriticalActionModal}
        onSubmit={handleLeaveWorkspace}
      />

      <AccountSettingsModal
        open={isAccountSettingsOpen}
        form={accountSettingsForm}
        error={accountSettingsError}
        isSubmitting={isSubmittingAccountSettings}
        onChange={setAccountSettingsForm}
        onClose={closeAccountSettingsModal}
        onSubmit={handleAccountSettingsSubmit}
        onDeleteAccount={() => {
          closeAccountSettingsModal();
          setCriticalActionForm({
            email: '',
            password: '',
          });
          setCriticalActionError(null);
          setActiveCriticalAction('delete-account');
        }}
      />

      <CriticalUserActionModal
        open={activeCriticalAction === 'delete-account'}
        title="Delete Account"
        description="Confirm with your email and password. Your account will be cancelled and admin-owned workspaces will be cancelled."
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        emailLabel="Email"
        passwordLabel="Password"
        isSubmitting={isSubmittingCriticalAction}
        error={criticalActionError}
        form={criticalActionForm}
        onChange={setCriticalActionForm}
        onClose={closeCriticalActionModal}
        onSubmit={handleDeleteAccount}
      />

      <CreateWorkspaceModal
        open={isCreateWorkspaceModalOpen}
        form={createWorkspaceForm}
        error={createWorkspaceError}
        isSubmitting={isCreatingWorkspace}
        onChange={setCreateWorkspaceForm}
        onClose={closeCreateWorkspaceModal}
        onSubmit={handleCreateWorkspace}
      />
    </div>
  );
}
