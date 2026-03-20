'use client';

import { DateTime } from 'luxon';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CriticalUserActionModal,
  type CriticalUserActionFormState,
} from '@/components/layout/CriticalUserActionModal';
import { WorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { WorkspaceShell, WorkspaceShellRenderContext } from '@/components/workspace-shell';
import { useSharedSelectedDate } from '@/hooks/useSharedSelectedDate';
import { normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import { getErrorDisplayMessage } from '@/lib/error-display';
import { IANA_TIMEZONES } from '@/lib/iana-timezones';
import { isUserSuspendedError, logoutSuspendedUser } from '@/lib/session-guards';
import {
  readWorkspaceSidebarState,
  writeWorkspaceSidebarState,
} from '@/lib/workspace-sidebar-state';
import {
  buildMarkerCountByDateKey,
  buildMiniCalendarCells,
  groupMyBookingsForSidebar,
  resolveBookingLoadDateRange,
} from '@/lib/time';
import type {
  BookingListItem,
  ErrorPayload,
  RoomItem,
  WorkspaceAdminSummaryPayload,
  WorkspaceInvitationSummary,
  WorkspaceMemberListItem,
} from '@/lib/types';
import {
  buildWorkspaceAdminPathFromSlug,
  buildWorkspacePathFromSlug,
  normalizeWorkspaceSlugCandidate,
} from '@/lib/workspace-routing';
import { isBookingListPayload, isWorkspaceAdminSummaryPayload } from '@/lib/workspace-payloads';

type WorkspacePageParams = {
  workspaceId?: string;
  workspaceName?: string;
};

type RoomEditState = {
  name: string;
  description: string;
};

type WorkspaceSettingsState = {
  name: string;
  slug: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
};

type AdminSubpanelId = 'settings' | 'resources' | 'members' | 'cancellation';

type AdminSubpanelDefinition = {
  id: AdminSubpanelId;
  label: string;
};

const adminSettingsBannerCache = new Map<string, string>();
const ADMIN_SETTINGS_BANNER_STORAGE_PREFIX = 'openspace:admin-settings-banner:';
const ADMIN_SUCCESS_QUERY_KEY = 'notice';
const ADMIN_SETTINGS_SAVED_NOTICE = 'settings-saved';

function getAdminSettingsBannerStorageKey(workspaceId: string): string {
  return `${ADMIN_SETTINGS_BANNER_STORAGE_PREFIX}${workspaceId}`;
}

function readAdminSettingsBanner(workspaceId: string): string | null {
  const cached = adminSettingsBannerCache.get(workspaceId) ?? null;
  adminSettingsBannerCache.delete(workspaceId);

  if (typeof window === 'undefined') {
    return cached;
  }

  try {
    const stored = window.sessionStorage.getItem(getAdminSettingsBannerStorageKey(workspaceId));
    if (stored) {
      window.sessionStorage.removeItem(getAdminSettingsBannerStorageKey(workspaceId));
      return stored;
    }
  } catch {
    return cached;
  }

  return cached;
}

function writeAdminSettingsBanner(workspaceId: string, message: string): void {
  adminSettingsBannerCache.set(workspaceId, message);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(getAdminSettingsBannerStorageKey(workspaceId), message);
  } catch {
    // Ignore storage errors and rely on the in-memory fallback.
  }
}

function AdminSubpanelIcon({ id }: { id: AdminSubpanelId }) {
  const iconClassName = 'h-4 w-4 shrink-0';

  if (id === 'settings') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={iconClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 5.5h12" />
        <path d="M4 10h12" />
        <path d="M4 14.5h12" />
        <path d="M7.5 4v3" />
        <path d="M12 8.5v3" />
        <path d="M9 13v3" />
      </svg>
    );
  }

  if (id === 'resources') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={iconClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 6.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 13.5z" />
        <path d="M8 5V3.75A.75.75 0 0 1 8.75 3h6.5a.75.75 0 0 1 .75.75v6.5A.75.75 0 0 1 15.25 11H15" />
      </svg>
    );
  }

  if (id === 'cancellation') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={iconClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3.75 15.75 7v6L10 16.25 4.25 13V7z" />
        <path d="m7.75 7.75 4.5 4.5" />
        <path d="m12.25 7.75-4.5 4.5" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={iconClassName}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.25" cy="7.25" r="2.25" />
      <path d="M3.75 15c.7-1.8 1.95-2.8 3.5-2.8 1.55 0 2.8 1 3.5 2.8" />
      <path d="M13.75 9.25a1.75 1.75 0 1 0 0-3.5" />
      <path d="M13.1 12.05c1.35.25 2.42 1.2 3.15 2.95" />
    </svg>
  );
}

type CancelWorkspaceState = {
  workspaceName: string;
  email: string;
  password: string;
};

type DeleteRoomConfirmationState = {
  roomId: string;
  roomName: string;
  confirmRoomName: string;
  email: string;
  password: string;
};

type AdminRightSidebarState = {
  myBookings: BookingListItem[];
};

type AdminWorkspaceDataState = WorkspaceAdminSummaryPayload;

type MemberDirectoryStatus = 'OWNER' | 'ADMIN' | 'ACTIVE' | 'INVITED' | 'INACTIVE';

type MemberDirectoryItem = {
  id: string;
  displayName: string | null;
  email: string;
  status: MemberDirectoryStatus;
  detail: string;
  isWorkspaceOwner: boolean;
  invitationId: string | null;
  memberUserId: string | null;
  canRevokeInvitation: boolean;
  canRemove: boolean;
  canPromoteToAdmin: boolean;
  canDemoteToMember: boolean;
};

const MEMBER_DIRECTORY_STATUS_OPTIONS: MemberDirectoryStatus[] = [
  'OWNER',
  'ADMIN',
  'ACTIVE',
  'INVITED',
  'INACTIVE',
];

type RemoveMemberConfirmationState = {
  memberUserId: string;
  memberEmail: string;
  memberDisplayName: string;
};

const removeMemberInitialFormState: CriticalUserActionFormState = {
  email: '',
  password: '',
};

function formatMemberDirectoryDate(value: string, timezone: string): string {
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid) {
    return value;
  }

  const zoned = parsed.setZone(timezone);
  if (!zoned.isValid) {
    return parsed.toUTC().toISODate() ?? value;
  }

  return zoned.toLocaleString(DateTime.DATE_MED);
}

function getMemberDirectoryBadgeClassName(status: MemberDirectoryStatus): string {
  if (status === 'OWNER') {
    return 'inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-indigo-700';
  }

  if (status === 'ADMIN') {
    return 'inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-sky-800';
  }

  if (status === 'ACTIVE') {
    return 'inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-emerald-800';
  }

  if (status === 'INVITED') {
    return 'inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-amber-800';
  }

  return 'inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-slate-700';
}
function buildMemberDirectoryItems({
  members,
  invitations,
  timezone,
  ownerUserId,
  canManageMembers,
  canManageRoles,
}: {
  members: WorkspaceMemberListItem[];
  invitations: WorkspaceInvitationSummary[];
  timezone: string;
  ownerUserId: string | null;
  canManageMembers: boolean;
  canManageRoles: boolean;
}): MemberDirectoryItem[] {
  const activeMembers = members
    .filter((member) => member.status === 'ACTIVE')
    .map((member) => {
      const isWorkspaceOwner = ownerUserId !== null && member.userId === ownerUserId;

      return {
        id: `member:${member.userId}`,
        displayName: `${member.firstName} ${member.lastName}`.trim(),
        email: member.email,
        status: isWorkspaceOwner
          ? ('OWNER' as const)
          : member.role === 'ADMIN'
            ? ('ADMIN' as const)
            : ('ACTIVE' as const),
        detail: `Member since ${formatMemberDirectoryDate(member.joinedAt, timezone)}`,
        isWorkspaceOwner,
        invitationId: null,
        memberUserId: member.userId,
        canRevokeInvitation: false,
        canRemove: !isWorkspaceOwner && canManageMembers && member.role !== 'ADMIN',
        canPromoteToAdmin: !isWorkspaceOwner && canManageRoles && member.role !== 'ADMIN',
        canDemoteToMember: !isWorkspaceOwner && canManageRoles && member.role === 'ADMIN',
      };
    });

  const invitedPeople = invitations.map((invitation) => ({
    id: `invitation:${invitation.id}`,
    displayName: null,
    email: invitation.email,
    status: 'INVITED' as const,
    detail: `Invited ${formatMemberDirectoryDate(invitation.createdAt, timezone)}`,
    isWorkspaceOwner: false,
    invitationId: invitation.id,
    memberUserId: null,
    canRevokeInvitation: canManageMembers,
    canRemove: false,
    canPromoteToAdmin: false,
    canDemoteToMember: false,
  }));

  const inactiveMembers = members
    .filter((member) => member.status !== 'ACTIVE')
    .map((member) => ({
      id: `member:${member.userId}`,
      displayName: `${member.firstName} ${member.lastName}`.trim(),
      email: member.email,
      status: 'INACTIVE' as const,
      detail: `Member since ${formatMemberDirectoryDate(member.joinedAt, timezone)}`,
      isWorkspaceOwner: ownerUserId !== null && member.userId === ownerUserId,
      invitationId: null,
      memberUserId: member.userId,
      canRevokeInvitation: false,
      canRemove: false,
      canPromoteToAdmin: false,
      canDemoteToMember: false,
    }));

  return [...activeMembers, ...invitedPeople, ...inactiveMembers];
}

function AdminViewportDialog({
  open,
  labelledBy,
  dismissLabel,
  onDismiss,
  children,
}: {
  open: boolean;
  labelledBy: string;
  dismissLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!open || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute inset-0"
        aria-label={dismissLabel}
      />
      {children}
    </div>,
    portalTarget,
  );
}

function buildWorkspaceSettingsState({
  name,
  slug,
  timezone,
  scheduleStartHour,
  scheduleEndHour,
}: {
  name?: string | null;
  slug?: string | null;
  timezone?: string | null;
  scheduleStartHour?: number | null;
  scheduleEndHour?: number | null;
}): WorkspaceSettingsState {
  return {
    name: name ?? '',
    slug: slug ?? '',
    timezone: timezone ?? 'UTC',
    scheduleStartHour: scheduleStartHour ?? 8,
    scheduleEndHour: scheduleEndHour ?? 18,
  };
}

const adminRightSidebarStateCache = new Map<string, AdminRightSidebarState>();
const adminWorkspaceDataCache = new Map<string, AdminWorkspaceDataState>();
const WORKSPACE_SCHEDULE_HOUR_OPTIONS = Array.from({ length: 25 }, (_, index) => index);
const ADMIN_SUBPANEL_QUERY_KEY = 'panel';
const ADMIN_SUBPANELS: AdminSubpanelDefinition[] = [
  {
    id: 'settings',
    label: 'Settings',
  },
  {
    id: 'resources',
    label: 'Resources',
  },
  {
    id: 'members',
    label: 'Members',
  },
  {
    id: 'cancellation',
    label: 'Cancellation',
  },
];

function resolveAdminSubpanel(value: string | null | undefined): AdminSubpanelId {
  if (value === 'resources' || value === 'members' || value === 'cancellation') {
    return value;
  }

  if (value === 'people') {
    return 'members';
  }

  if (value === 'danger') {
    return 'cancellation';
  }

  return 'settings';
}

function buildAdminSubpanelHref(
  pathname: string,
  subpanel: AdminSubpanelId,
  currentQuery?: string,
): string {
  const nextSearchParams = new URLSearchParams(currentQuery);
  nextSearchParams.set(ADMIN_SUBPANEL_QUERY_KEY, subpanel);
  const query = nextSearchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function WorkspaceAdminPage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params?.workspaceId ?? '';
  const workspaceName = params?.workspaceName ?? '';
  const pageBackHref = workspaceName
    ? buildWorkspacePathFromSlug(workspaceName)
    : workspaceId
      ? `/workspaces/${workspaceId}`
      : '/dashboard';

  return (
    <WorkspaceShell
      selectedWorkspaceId={workspaceId || undefined}
      selectedWorkspaceName={workspaceName || undefined}
      pageTitle="Workspace Admin"
      pageDescription="Manage workspace settings, resources, members, and invitations."
      pageContentPaddingClassName="px-4 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0"
      pageBackHref={pageBackHref}
      pageBackLabel="Close"
      pageBackAriaLabel="Close admin panel"
    >
      {(context) => WorkspaceAdminContent({ context })}
    </WorkspaceShell>
  );
}

function WorkspaceAdminContent({ context }: { context: WorkspaceShellRenderContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedWorkspace, currentUser, isLoading, loadWorkspaces } = context;
  const requestedSubpanelParam = searchParams?.get(ADMIN_SUBPANEL_QUERY_KEY) ?? null;
  const requestedSubpanel = resolveAdminSubpanel(requestedSubpanelParam);
  const currentAdminQuery = searchParams?.toString();
  const isSettingsSavedNoticeVisible =
    searchParams?.get(ADMIN_SUCCESS_QUERY_KEY) === ADMIN_SETTINGS_SAVED_NOTICE;
  const cachedRightSidebarState = selectedWorkspace
    ? adminRightSidebarStateCache.get(selectedWorkspace.id)
    : null;
  const cachedWorkspaceSidebarState = selectedWorkspace
    ? readWorkspaceSidebarState(selectedWorkspace.id)
    : undefined;
  const cachedAdminData = selectedWorkspace
    ? adminWorkspaceDataCache.get(selectedWorkspace.id)
    : null;
  const [rooms, setRooms] = useState<RoomItem[]>(
    () => cachedAdminData?.rooms.items ?? cachedWorkspaceSidebarState?.rooms ?? [],
  );
  const [members, setMembers] = useState<WorkspaceMemberListItem[]>(
    () => cachedAdminData?.members.items ?? [],
  );
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitationSummary[]>(
    () => cachedAdminData?.invitations.items ?? [],
  );
  const [myBookings, setMyBookings] = useState<BookingListItem[]>(
    () => cachedRightSidebarState?.myBookings ?? [],
  );
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [hasLoadedAdminData, setHasLoadedAdminData] = useState(Boolean(cachedAdminData));
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomEditForm, setRoomEditForm] = useState<RoomEditState>({ name: '', description: '' });
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [removeMemberConfirmation, setRemoveMemberConfirmation] =
    useState<RemoveMemberConfirmationState | null>(null);
  const [removeMemberForm, setRemoveMemberForm] = useState<CriticalUserActionFormState>(
    removeMemberInitialFormState,
  );
  const [removeMemberError, setRemoveMemberError] = useState<ErrorPayload | null>(null);
  const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null);
  const [memberRoleChange, setMemberRoleChange] = useState<{
    userId: string;
    role: 'ADMIN' | 'MEMBER';
  } | null>(null);
  const [isSubmittingWorkspaceSettings, setIsSubmittingWorkspaceSettings] = useState(false);
  const [settingsBanner, setSettingsBanner] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<ErrorPayload | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [deleteRoomConfirmation, setDeleteRoomConfirmation] =
    useState<DeleteRoomConfirmationState | null>(null);
  const [isMemberDirectoryFilterOpen, setIsMemberDirectoryFilterOpen] = useState(false);
  const [visibleMemberDirectoryStatuses, setVisibleMemberDirectoryStatuses] = useState<
    Set<MemberDirectoryStatus>
  >(() => new Set(MEMBER_DIRECTORY_STATUS_OPTIONS));
  const [isDeleteRoomCredentialsUnlocked, setIsDeleteRoomCredentialsUnlocked] = useState(false);
  const [workspaceSettingsForm, setWorkspaceSettingsForm] = useState<WorkspaceSettingsState>(() =>
    buildWorkspaceSettingsState({
      name: selectedWorkspace?.name,
      slug: selectedWorkspace?.slug,
      timezone: selectedWorkspace?.timezone,
      scheduleStartHour: selectedWorkspace?.scheduleStartHour,
      scheduleEndHour: selectedWorkspace?.scheduleEndHour,
    }),
  );
  const [isCancelWorkspaceFormVisible, setIsCancelWorkspaceFormVisible] = useState(false);
  const [isCancellingWorkspace, setIsCancellingWorkspace] = useState(false);
  const [isCancelWorkspaceCredentialsUnlocked, setIsCancelWorkspaceCredentialsUnlocked] =
    useState(false);
  const [cancelWorkspaceForm, setCancelWorkspaceForm] = useState<CancelWorkspaceState>({
    workspaceName: '',
    email: '',
    password: '',
  });
  const { dateKey, monthKey, setDateKey, setMonthKey, goToToday } = useSharedSelectedDate(
    selectedWorkspace?.timezone ?? 'UTC',
  );
  const adminDataRequestIdRef = useRef(0);
  const lastSelectedWorkspaceIdRef = useRef<string | null>(null);
  const memberDirectoryFilterMenuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    selectedWorkspace?.membership?.role === 'ADMIN';
  const isOwner =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    currentUser?.id !== undefined &&
    selectedWorkspace.createdByUserId === currentUser.id;
  const canAccessAdmin = Boolean(
    selectedWorkspace?.membership?.status === 'ACTIVE' && (isAdmin || isOwner),
  );
  const canManageWorkspaceResources = canAccessAdmin;
  const canEditWorkspaceSettings = Boolean(isOwner);
  const canManageWorkspaceRoles = Boolean(isOwner);
  const visibleAdminSubpanels = isOwner
    ? ADMIN_SUBPANELS
    : ADMIN_SUBPANELS.filter((subpanel) => subpanel.id !== 'cancellation');
  const defaultAdminSubpanel: AdminSubpanelId = isOwner ? 'settings' : 'resources';
  const activeSubpanel =
    requestedSubpanelParam === null
      ? defaultAdminSubpanel
      : (visibleAdminSubpanels.find((subpanel) => subpanel.id === requestedSubpanel)?.id ??
        defaultAdminSubpanel);
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;
  const selectedWorkspaceName = selectedWorkspace?.name ?? null;
  const selectedWorkspaceSlug = selectedWorkspace?.slug ?? null;
  const selectedWorkspaceTimezone = selectedWorkspace?.timezone ?? null;
  const selectedWorkspaceScheduleStartHour = selectedWorkspace?.scheduleStartHour ?? null;
  const selectedWorkspaceScheduleEndHour = selectedWorkspace?.scheduleEndHour ?? null;
  const isResolvingSelectedWorkspace = isLoading && !selectedWorkspace;
  const currentUserId = currentUser?.id ?? '';
  const rightSidebarTimezone = selectedWorkspace?.timezone ?? 'UTC';
  const memberDirectoryItems = useMemo(
    () =>
      buildMemberDirectoryItems({
        members,
        invitations: pendingInvitations,
        timezone: selectedWorkspace?.timezone ?? 'UTC',
        ownerUserId: selectedWorkspace?.createdByUserId ?? null,
        canManageMembers: canManageWorkspaceResources,
        canManageRoles: canManageWorkspaceRoles,
      }),
    [
      members,
      pendingInvitations,
      selectedWorkspace?.timezone,
      selectedWorkspace?.createdByUserId,
      canManageWorkspaceResources,
      canManageWorkspaceRoles,
    ],
  );
  const filteredMemberDirectoryItems = useMemo(
    () =>
      memberDirectoryItems.filter((person) => visibleMemberDirectoryStatuses.has(person.status)),
    [memberDirectoryItems, visibleMemberDirectoryStatuses],
  );
  const hiddenMemberDirectoryStatusCount =
    MEMBER_DIRECTORY_STATUS_OPTIONS.length - visibleMemberDirectoryStatuses.size;
  const bookingLoadDateRange = useMemo(
    () => resolveBookingLoadDateRange({ timezone: rightSidebarTimezone, monthKey }),
    [monthKey, rightSidebarTimezone],
  );

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setRooms([]);
      setMembers([]);
      setPendingInvitations([]);
      setHasLoadedAdminData(false);
      return;
    }

    const cachedSidebarState = readWorkspaceSidebarState(selectedWorkspaceId);
    const cachedState = adminWorkspaceDataCache.get(selectedWorkspaceId);
    setRooms(cachedState?.rooms.items ?? cachedSidebarState?.rooms ?? []);
    setMembers(cachedState?.members.items ?? []);
    setPendingInvitations(cachedState?.invitations.items ?? []);
    setHasLoadedAdminData(Boolean(cachedState));
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!isMemberDirectoryFilterOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (memberDirectoryFilterMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsMemberDirectoryFilterOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMemberDirectoryFilterOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMemberDirectoryFilterOpen]);

  const loadAdminData = useCallback(async () => {
    if (!selectedWorkspaceId || !canAccessAdmin) {
      setRooms([]);
      setMembers([]);
      setPendingInvitations([]);
      setHasLoadedAdminData(false);
      setIsLoadingData(false);
      return;
    }

    const requestId = ++adminDataRequestIdRef.current;
    setIsLoadingData(true);
    const response = await fetch(`/api/workspaces/${selectedWorkspaceId}/admin-summary`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await safeReadJson(response);

    if (adminDataRequestIdRef.current !== requestId) {
      return;
    }

    if (!response.ok || !isWorkspaceAdminSummaryPayload(payload)) {
      setIsLoadingData(false);
      return;
    }

    adminWorkspaceDataCache.set(selectedWorkspaceId, payload);
    setRooms(payload.rooms.items);
    setMembers(payload.members.items);
    setPendingInvitations(payload.invitations.items);
    setHasLoadedAdminData(true);
    setIsLoadingData(false);
  }, [selectedWorkspaceId, canAccessAdmin]);

  const loadMyBookings = useCallback(async () => {
    if (!selectedWorkspaceId || !canAccessAdmin) {
      setMyBookings([]);
      return;
    }

    const query = new URLSearchParams({
      mine: 'true',
      fromDate: bookingLoadDateRange.fromDate,
      toDate: bookingLoadDateRange.toDate,
    });

    const response = await fetch(
      `/api/workspaces/${selectedWorkspaceId}/bookings?${query.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );
    const payload = await safeReadJson(response);

    if (!response.ok || !isBookingListPayload(payload)) {
      setMyBookings([]);
      return;
    }

    setMyBookings(payload.items);
  }, [
    bookingLoadDateRange.fromDate,
    bookingLoadDateRange.toDate,
    selectedWorkspaceId,
    canAccessAdmin,
  ]);

  useEffect(() => {
    if (isResolvingSelectedWorkspace) {
      return;
    }

    void loadAdminData();
  }, [isResolvingSelectedWorkspace, loadAdminData]);

  useEffect(() => {
    if (isResolvingSelectedWorkspace) {
      return;
    }

    void loadMyBookings();
  }, [isResolvingSelectedWorkspace, loadMyBookings]);

  useEffect(() => {
    if (
      !selectedWorkspaceId ||
      !selectedWorkspaceName ||
      !selectedWorkspaceSlug ||
      !selectedWorkspaceTimezone
    ) {
      lastSelectedWorkspaceIdRef.current = null;
      return;
    }

    setMyBookings(adminRightSidebarStateCache.get(selectedWorkspaceId)?.myBookings ?? []);

    const nextWorkspaceSettingsForm = buildWorkspaceSettingsState({
      name: selectedWorkspaceName,
      slug: selectedWorkspaceSlug,
      timezone: selectedWorkspaceTimezone,
      scheduleStartHour: selectedWorkspaceScheduleStartHour,
      scheduleEndHour: selectedWorkspaceScheduleEndHour,
    });

    setWorkspaceSettingsForm((previous) =>
      previous.name === nextWorkspaceSettingsForm.name &&
      previous.slug === nextWorkspaceSettingsForm.slug &&
      previous.timezone === nextWorkspaceSettingsForm.timezone &&
      previous.scheduleStartHour === nextWorkspaceSettingsForm.scheduleStartHour &&
      previous.scheduleEndHour === nextWorkspaceSettingsForm.scheduleEndHour
        ? previous
        : nextWorkspaceSettingsForm,
    );

    if (lastSelectedWorkspaceIdRef.current !== selectedWorkspaceId) {
      setCancelWorkspaceForm((previous) => ({
        ...previous,
        workspaceName: '',
        password: '',
      }));
      setIsCancelWorkspaceFormVisible(false);
      setIsCancelWorkspaceCredentialsUnlocked(false);
      setDeleteRoomConfirmation(null);
      setIsDeleteRoomCredentialsUnlocked(false);
      setMemberRoleChange(null);
      lastSelectedWorkspaceIdRef.current = selectedWorkspaceId;
    }
  }, [
    selectedWorkspaceId,
    selectedWorkspaceName,
    selectedWorkspaceSlug,
    selectedWorkspaceTimezone,
    selectedWorkspaceScheduleStartHour,
    selectedWorkspaceScheduleEndHour,
  ]);
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSettingsBanner(null);
      setSettingsError(null);
      return;
    }

    setSettingsBanner(readAdminSettingsBanner(selectedWorkspaceId));
    setSettingsError(null);
  }, [selectedWorkspaceId]);
  useEffect(() => {
    if (!isSettingsSavedNoticeVisible) {
      return;
    }

    setSettingsBanner('Settings saved.');
    const nextSearchParams = new URLSearchParams(currentAdminQuery);
    nextSearchParams.delete(ADMIN_SUCCESS_QUERY_KEY);
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [currentAdminQuery, isSettingsSavedNoticeVisible, pathname, router]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    if (hasLoadedAdminData) {
      adminWorkspaceDataCache.set(selectedWorkspaceId, {
        rooms: { items: rooms },
        members: { items: members },
        invitations: { items: pendingInvitations },
      });
    }

    const cachedSidebarState = readWorkspaceSidebarState(selectedWorkspaceId);
    writeWorkspaceSidebarState(selectedWorkspaceId, {
      rooms,
      bookings: cachedSidebarState?.bookings ?? [],
    });

    adminRightSidebarStateCache.set(selectedWorkspaceId, {
      myBookings,
    });
  }, [selectedWorkspaceId, myBookings, hasLoadedAdminData, rooms, members, pendingInvitations]);

  const handleSaveWorkspaceSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isOwner || isSubmittingWorkspaceSettings) {
        return;
      }

      setSettingsBanner(null);
      setSettingsError(null);
      setIsSubmittingWorkspaceSettings(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: workspaceSettingsForm.name,
          slug: workspaceSettingsForm.slug,
          timezone: workspaceSettingsForm.timezone,
          scheduleStartHour: workspaceSettingsForm.scheduleStartHour,
          scheduleEndHour: workspaceSettingsForm.scheduleEndHour,
        }),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
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
        setSettingsError(normalized);
        setIsSubmittingWorkspaceSettings(false);
        return;
      }

      await loadWorkspaces();
      const successMessage = 'Settings saved.';
      const nextWorkspaceSlug = normalizeWorkspaceSlugCandidate(workspaceSettingsForm.slug);
      const nextSearchParams = new URLSearchParams(currentAdminQuery);
      nextSearchParams.set(ADMIN_SUBPANEL_QUERY_KEY, activeSubpanel);
      nextSearchParams.set(ADMIN_SUCCESS_QUERY_KEY, ADMIN_SETTINGS_SAVED_NOTICE);
      const nextHref = nextWorkspaceSlug
        ? (() => {
            const nextQuery = nextSearchParams.toString();
            const nextPath = buildWorkspaceAdminPathFromSlug(nextWorkspaceSlug);
            return nextQuery ? `${nextPath}?${nextQuery}` : nextPath;
          })()
        : null;
      const currentHref = currentAdminQuery ? `${pathname}?${currentAdminQuery}` : pathname;
      setSettingsBanner(successMessage);
      if (nextHref && nextHref !== currentHref) {
        writeAdminSettingsBanner(selectedWorkspace.id, successMessage);
        router.replace(nextHref);
      }
      setIsSubmittingWorkspaceSettings(false);
    },
    [
      pathname,
      router,
      selectedWorkspace,
      isOwner,
      isSubmittingWorkspaceSettings,
      workspaceSettingsForm,
      loadWorkspaces,
      activeSubpanel,
      currentAdminQuery,
    ],
  );
  const clearSettingsFeedback = useCallback(() => {
    setSettingsBanner(null);
    setSettingsError(null);
  }, []);

  const handleCreateRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !canManageWorkspaceResources || isSubmittingRoom) {
        return;
      }

      setIsSubmittingRoom(true);
      const payload =
        newRoomDescription.trim().length > 0
          ? { name: newRoomName, description: newRoomDescription }
          : { name: newRoomName };

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/rooms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        setIsSubmittingRoom(false);
        return;
      }

      setNewRoomName('');
      setNewRoomDescription('');
      await loadAdminData();
      setIsSubmittingRoom(false);
    },
    [
      selectedWorkspace,
      canManageWorkspaceResources,
      isSubmittingRoom,
      newRoomName,
      newRoomDescription,
      loadAdminData,
      router,
    ],
  );

  const handleSaveRoom = useCallback(
    async (roomId: string) => {
      if (!selectedWorkspace || !canManageWorkspaceResources || isSubmittingRoom) {
        return;
      }

      setIsSubmittingRoom(true);
      const payload =
        roomEditForm.description.trim().length > 0
          ? { name: roomEditForm.name, description: roomEditForm.description }
          : { name: roomEditForm.name, description: null };

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/rooms/${roomId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsSubmittingRoom(false);
        return;
      }

      setEditingRoomId(null);
      await loadAdminData();
      setIsSubmittingRoom(false);
    },
    [selectedWorkspace, canManageWorkspaceResources, isSubmittingRoom, roomEditForm, loadAdminData],
  );

  const handleOpenDeleteRoomConfirmation = useCallback(
    (roomId: string) => {
      if (!selectedWorkspace || !canManageWorkspaceResources || deletingRoomId) {
        return;
      }

      const room = rooms.find((item) => item.id === roomId);
      if (!room) {
        return;
      }

      setIsDeleteRoomCredentialsUnlocked(false);
      setDeleteRoomConfirmation({
        roomId: room.id,
        roomName: room.name,
        confirmRoomName: '',
        email: '',
        password: '',
      });
    },
    [selectedWorkspace, canManageWorkspaceResources, deletingRoomId, rooms],
  );

  const handleConfirmDeleteRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (
        !selectedWorkspace ||
        !canManageWorkspaceResources ||
        deletingRoomId ||
        !deleteRoomConfirmation
      ) {
        return;
      }

      setDeletingRoomId(deleteRoomConfirmation.roomId);
      const response = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/rooms/${deleteRoomConfirmation.roomId}`,
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            roomName: deleteRoomConfirmation.confirmRoomName,
            email: deleteRoomConfirmation.email,
            password: deleteRoomConfirmation.password,
          }),
        },
      );
      await safeReadJson(response);

      if (!response.ok) {
        setDeletingRoomId(null);
        return;
      }

      setIsDeleteRoomCredentialsUnlocked(false);
      setDeleteRoomConfirmation(null);
      await loadAdminData();
      setDeletingRoomId(null);
    },
    [
      selectedWorkspace,
      canManageWorkspaceResources,
      deletingRoomId,
      deleteRoomConfirmation,
      loadAdminData,
    ],
  );

  const handleInvite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !canManageWorkspaceResources || isSubmittingInvite) {
        return;
      }

      setIsSubmittingInvite(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/invitations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
        }),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        setIsSubmittingInvite(false);
        return;
      }

      setInviteEmail('');
      await loadAdminData();
      setIsSubmittingInvite(false);
    },
    [
      selectedWorkspace,
      canManageWorkspaceResources,
      isSubmittingInvite,
      inviteEmail,
      loadAdminData,
      router,
    ],
  );

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!selectedWorkspace || !canManageWorkspaceResources || revokingInvitationId) {
        return;
      }

      setRevokingInvitationId(invitationId);
      const response = await fetch(`/api/workspaces/invitations/${invitationId}/revoke`, {
        method: 'POST',
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
        if (isUserSuspendedError(normalized)) {
          await logoutSuspendedUser(router);
          return;
        }
        setRevokingInvitationId(null);
        return;
      }

      await loadAdminData();
      setRevokingInvitationId(null);
    },
    [selectedWorkspace, canManageWorkspaceResources, revokingInvitationId, loadAdminData, router],
  );

  const closeRemoveMemberDialog = useCallback(() => {
    setRemoveMemberConfirmation(null);
    setRemoveMemberForm(removeMemberInitialFormState);
    setRemoveMemberError(null);
  }, []);

  const handleOpenRemoveMemberDialog = useCallback(
    (memberUserId: string) => {
      if (!selectedWorkspace || !canManageWorkspaceResources || removingMemberUserId) {
        return;
      }

      const member = members.find(
        (item) =>
          item.userId === memberUserId &&
          item.status === 'ACTIVE' &&
          item.role !== 'ADMIN' &&
          item.userId !== selectedWorkspace.createdByUserId,
      );
      if (!member) {
        return;
      }

      const memberDisplayName = `${member.firstName} ${member.lastName}`.trim();
      setRemoveMemberForm(removeMemberInitialFormState);
      setRemoveMemberError(null);
      setRemoveMemberConfirmation({
        memberUserId: member.userId,
        memberEmail: member.email,
        memberDisplayName: memberDisplayName || member.email,
      });
    },
    [selectedWorkspace, canManageWorkspaceResources, removingMemberUserId, members],
  );

  const handleRemoveMember = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (
        !selectedWorkspace ||
        !canManageWorkspaceResources ||
        !removeMemberConfirmation ||
        removingMemberUserId
      ) {
        return;
      }

      setRemovingMemberUserId(removeMemberConfirmation.memberUserId);
      setRemoveMemberError(null);
      const response = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/members/${removeMemberConfirmation.memberUserId}`,
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(removeMemberForm),
        },
      );
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
        if (isUserSuspendedError(normalized)) {
          setRemovingMemberUserId(null);
          await logoutSuspendedUser(router);
          return;
        }
        if (normalized.code === 'UNAUTHORIZED') {
          setRemovingMemberUserId(null);
          router.replace('/login?reason=session-expired');
          return;
        }
        setRemoveMemberError(normalized);
        setRemovingMemberUserId(null);
        return;
      }

      closeRemoveMemberDialog();
      setRemovingMemberUserId(null);
      await loadAdminData();
    },
    [
      selectedWorkspace,
      canManageWorkspaceResources,
      removeMemberConfirmation,
      removingMemberUserId,
      removeMemberForm,
      router,
      closeRemoveMemberDialog,
      loadAdminData,
    ],
  );

  const handleUpdateMemberRole = useCallback(
    async (memberUserId: string, role: 'ADMIN' | 'MEMBER') => {
      if (!selectedWorkspace || !canManageWorkspaceRoles || memberRoleChange) {
        return;
      }

      setMemberRoleChange({
        userId: memberUserId,
        role,
      });
      const response = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/members/${memberUserId}/${role === 'ADMIN' ? 'promote' : 'demote'}`,
        {
          method: 'POST',
        },
      );
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(responsePayload, response.status);
        if (isUserSuspendedError(normalized)) {
          setMemberRoleChange(null);
          await logoutSuspendedUser(router);
          return;
        }
        if (normalized.code === 'UNAUTHORIZED') {
          setMemberRoleChange(null);
          router.replace('/login?reason=session-expired');
          return;
        }
        setMemberRoleChange(null);
        return;
      }

      await loadAdminData();
      setMemberRoleChange(null);
    },
    [selectedWorkspace, canManageWorkspaceRoles, memberRoleChange, router, loadAdminData],
  );

  const handleCancelWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isOwner || isCancellingWorkspace) {
        return;
      }

      setIsCancellingWorkspace(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/cancel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(cancelWorkspaceForm),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsCancellingWorkspace(false);
        return;
      }

      await loadWorkspaces();
      router.replace('/dashboard');
      router.refresh();
    },
    [
      selectedWorkspace,
      isOwner,
      isCancellingWorkspace,
      cancelWorkspaceForm,
      loadWorkspaces,
      router,
    ],
  );
  const openCancelWorkspaceDialog = useCallback(() => {
    setCancelWorkspaceForm({
      workspaceName: '',
      email: '',
      password: '',
    });
    setIsCancelWorkspaceCredentialsUnlocked(false);
    setIsCancelWorkspaceFormVisible(true);
  }, []);
  const closeCancelWorkspaceDialog = useCallback(() => {
    setIsCancelWorkspaceFormVisible(false);
    setIsCancelWorkspaceCredentialsUnlocked(false);
  }, []);

  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone: rightSidebarTimezone,
        monthKey,
        selectedDateKey: dateKey,
        markerCountByDateKey: buildMarkerCountByDateKey(
          myBookings,
          rightSidebarTimezone,
          currentUserId || undefined,
        ),
      }),
    [currentUserId, dateKey, monthKey, myBookings, rightSidebarTimezone],
  );
  const myBookingGroups = useMemo(
    () =>
      currentUserId
        ? groupMyBookingsForSidebar(myBookings, rightSidebarTimezone, currentUserId)
        : [],
    [currentUserId, myBookings, rightSidebarTimezone],
  );

  if (isResolvingSelectedWorkspace) {
    return <p className="text-slate-600">Loading workspace...</p>;
  }

  if (!selectedWorkspace) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        This workspace is not available to your account.
      </p>
    );
  }

  if (!canAccessAdmin) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Only workspace admins and owners can access this page.
      </p>
    );
  }

  const rightSidebar = (
    <WorkspaceRightSidebar
      timezone={selectedWorkspace.timezone}
      monthKey={monthKey}
      onSelectDateKey={setDateKey}
      onSelectMonthKey={setMonthKey}
      onToday={goToToday}
      miniCalendarCells={miniCalendarCells}
      bookingGroups={myBookingGroups}
      onOpenBooking={(booking) =>
        router.push(`${buildWorkspacePathFromSlug(selectedWorkspace.slug)}?bookingId=${booking.id}`)
      }
    />
  );

  const activeSubpanelContent =
    activeSubpanel === 'settings' ? (
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Workspace Settings</h3>
              <p className="mt-1 text-sm text-slate-600">
                Update the workspace identity, timezone, and daily booking schedule.
              </p>
            </div>
            {isLoadingData ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Refreshing admin data...
              </span>
            ) : null}
          </div>

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => void handleSaveWorkspaceSettings(event)}
          >
            {!canEditWorkspaceSettings ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Only the workspace owner can edit these settings. Admins can review them here for
                reference.
              </p>
            ) : null}

            {settingsBanner || isSettingsSavedNoticeVisible || settingsError ? (
              <div className="space-y-2">
                {settingsBanner || isSettingsSavedNoticeVisible ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                  >
                    {settingsBanner ?? 'Settings saved.'}
                  </p>
                ) : null}
                {settingsError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {getErrorDisplayMessage(settingsError)}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Identity
                  </h4>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep the workspace name and web address aligned with how members find it.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Display Name
                    </span>
                    <input
                      required
                      disabled={!canEditWorkspaceSettings}
                      value={workspaceSettingsForm.name}
                      onChange={(event) => {
                        clearSettingsFeedback();
                        setWorkspaceSettingsForm((previous) => {
                          const nextName = event.target.value;
                          const generatedSlug = normalizeWorkspaceSlugCandidate(previous.name);
                          const nextGeneratedSlug = normalizeWorkspaceSlugCandidate(nextName);

                          return {
                            ...previous,
                            name: nextName,
                            slug:
                              !previous.slug || previous.slug === generatedSlug
                                ? nextGeneratedSlug
                                : previous.slug,
                          };
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Web Address
                    </span>
                    <input
                      required
                      disabled={!canEditWorkspaceSettings}
                      value={workspaceSettingsForm.slug}
                      onChange={(event) => {
                        clearSettingsFeedback();
                        setWorkspaceSettingsForm((previous) => ({
                          ...previous,
                          slug: normalizeWorkspaceSlugCandidate(event.target.value),
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Use lowercase letters, numbers, dots, and hyphens only.
                    </p>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Schedule
                  </h4>
                  <p className="mt-2 text-sm text-slate-600">
                    Choose the workspace timezone and the daily booking window shown to members.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Timezone</span>
                    <select
                      required
                      disabled={!canEditWorkspaceSettings}
                      value={workspaceSettingsForm.timezone}
                      onChange={(event) => {
                        clearSettingsFeedback();
                        setWorkspaceSettingsForm((previous) => ({
                          ...previous,
                          timezone: event.target.value,
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      {IANA_TIMEZONES.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Schedule Start
                      </span>
                      <select
                        required
                        disabled={!canEditWorkspaceSettings}
                        value={workspaceSettingsForm.scheduleStartHour}
                        onChange={(event) => {
                          clearSettingsFeedback();
                          setWorkspaceSettingsForm((previous) => {
                            const nextStartHour = Number(event.target.value);
                            const nextEndHour =
                              previous.scheduleEndHour < nextStartHour
                                ? nextStartHour
                                : previous.scheduleEndHour;

                            return {
                              ...previous,
                              scheduleStartHour: nextStartHour,
                              scheduleEndHour: nextEndHour,
                            };
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter((hour) => hour <= 23).map(
                          (hour) => (
                            <option key={`start-${hour}`} value={hour}>
                              {hour.toString().padStart(2, '0')}:00
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Schedule End
                      </span>
                      <select
                        required
                        disabled={!canEditWorkspaceSettings}
                        value={workspaceSettingsForm.scheduleEndHour}
                        onChange={(event) => {
                          clearSettingsFeedback();
                          setWorkspaceSettingsForm((previous) => ({
                            ...previous,
                            scheduleEndHour: Number(event.target.value),
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter(
                          (hour) => hour >= workspaceSettingsForm.scheduleStartHour,
                        ).map((hour) => (
                          <option key={`end-${hour}`} value={hour}>
                            {hour.toString().padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end">
              <button
                type="submit"
                disabled={!canEditWorkspaceSettings || isSubmittingWorkspaceSettings}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save Settings
              </button>
            </div>
          </form>
        </section>
      </div>
    ) : activeSubpanel === 'resources' ? (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Resources</h3>
            <p className="mt-1 text-sm text-slate-600">
              Create, rename, and retire rooms available to workspace members.
            </p>
          </div>
          {isLoadingData ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Refreshing admin data...
            </span>
          ) : null}
        </div>

        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => void handleCreateRoom(event)}
        >
          <input
            required
            placeholder="Room name"
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <input
            placeholder="Description (optional)"
            value={newRoomDescription}
            onChange={(event) => setNewRoomDescription(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={isSubmittingRoom}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create Room
          </button>
        </form>
        {hasLoadedAdminData && rooms.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No rooms created yet.</p>
        ) : null}

        {rooms.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {rooms.map((room) => {
              const isEditing = editingRoomId === room.id;

              return (
                <li key={room.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {!isEditing ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{room.name}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {room.description ?? 'No description'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoomId(room.id);
                            setRoomEditForm({
                              name: room.name,
                              description: room.description ?? '',
                            });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteRoomConfirmation(room.id)}
                          disabled={deletingRoomId === room.id}
                          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingRoomId === room.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Room Name
                        </span>
                        <p className="mb-2 text-xs text-slate-500">
                          Unique among active rooms in this workspace. Used in reservation lists and
                          filters.
                        </p>
                        <input
                          value={roomEditForm.name}
                          onChange={(event) =>
                            setRoomEditForm((previous) => ({
                              ...previous,
                              name: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Description
                        </span>
                        <p className="mb-2 text-xs text-slate-500">
                          Optional notes such as capacity, equipment, or room usage.
                        </p>
                        <input
                          value={roomEditForm.description}
                          onChange={(event) =>
                            setRoomEditForm((previous) => ({
                              ...previous,
                              description: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveRoom(room.id)}
                          disabled={isSubmittingRoom}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRoomId(null)}
                          disabled={isSubmittingRoom}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    ) : activeSubpanel === 'members' ? (
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Members</h3>
              <p className="mt-1 text-sm text-slate-600">
                Admins can invite teammates and remove non-admin members. Owners also manage admin
                access.
              </p>
            </div>
            {isLoadingData ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Refreshing admin data...
              </span>
            ) : null}
          </div>

          <form
            className="mt-4 flex flex-wrap items-center gap-3"
            onSubmit={(event) => void handleInvite(event)}
          >
            <input
              required
              type="email"
              placeholder="Invite by email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="submit"
              disabled={isSubmittingInvite}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Invite
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Directory
              </h4>
              <p className="mt-1 text-sm text-slate-600">
                Keep active members, former members, and invited people in one list.
              </p>
            </div>
            <div className="relative" ref={memberDirectoryFilterMenuRef}>
              <button
                type="button"
                onClick={() => setIsMemberDirectoryFilterOpen((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 ${
                  hiddenMemberDirectoryStatusCount > 0
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                aria-expanded={isMemberDirectoryFilterOpen}
                aria-haspopup="dialog"
              >
                Filter
                {hiddenMemberDirectoryStatusCount > 0 ? (
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-900">
                    {visibleMemberDirectoryStatuses.size}/{MEMBER_DIRECTORY_STATUS_OPTIONS.length}
                  </span>
                ) : null}
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${
                    isMemberDirectoryFilterOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  <path d="m5 8 5 5 5-5" />
                </svg>
              </button>
              {isMemberDirectoryFilterOpen ? (
                <div
                  className="absolute right-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                  style={{
                    width: 'max-content',
                    maxWidth: 'min(28rem, calc(100vw - 2rem))',
                  }}
                >
                  <div className="flex items-center justify-start">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleMemberDirectoryStatuses(new Set(MEMBER_DIRECTORY_STATUS_OPTIONS))
                      }
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Show all
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {MEMBER_DIRECTORY_STATUS_OPTIONS.map((status) => {
                      const isVisible = visibleMemberDirectoryStatuses.has(status);

                      return (
                        <label
                          key={status}
                          className="flex cursor-pointer items-center justify-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() =>
                              setVisibleMemberDirectoryStatuses((previous) => {
                                const next = new Set(previous);

                                if (next.has(status)) {
                                  next.delete(status);
                                } else {
                                  next.add(status);
                                }

                                return next;
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                          />
                          <span className={getMemberDirectoryBadgeClassName(status)}>{status}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {hasLoadedAdminData && memberDirectoryItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No members or invitations yet.</p>
          ) : memberDirectoryItems.length > 0 ? (
            filteredMemberDirectoryItems.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[940px] w-full table-fixed border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="w-[20%] border-b border-slate-200 px-3 py-3">Name</th>
                      <th className="w-[27%] border-b border-slate-200 px-3 py-3">Email</th>
                      <th className="w-[21%] border-b border-slate-200 px-3 py-3">Timeline</th>
                      <th className="w-[14%] border-b border-slate-200 px-3 py-3">Status</th>
                      <th className="w-[18%] border-b border-slate-200 px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMemberDirectoryItems.map((person) => {
                      const isPromoting =
                        memberRoleChange?.userId === person.memberUserId &&
                        memberRoleChange.role === 'ADMIN';
                      const isDemoting =
                        memberRoleChange?.userId === person.memberUserId &&
                        memberRoleChange.role === 'MEMBER';
                      const hasAction =
                        person.canRevokeInvitation ||
                        person.canPromoteToAdmin ||
                        person.canDemoteToMember ||
                        person.canRemove;

                      return (
                        <tr key={person.id} className="align-middle">
                          <td className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900">
                            {person.displayName ? (
                              <span className="font-medium text-slate-900">
                                {person.displayName}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                            <span className="break-all">{person.email}</span>
                          </td>
                          <td className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                            {person.detail}
                          </td>
                          <td className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                            <span className={getMemberDirectoryBadgeClassName(person.status)}>
                              {person.status}
                            </span>
                          </td>
                          <td className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                            {hasAction ? (
                              <div className="flex flex-wrap gap-2">
                                {person.canRevokeInvitation && person.invitationId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleRevokeInvitation(person.invitationId!)
                                    }
                                    disabled={revokingInvitationId === person.invitationId}
                                    className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {revokingInvitationId === person.invitationId
                                      ? 'Revoking...'
                                      : 'Revoke'}
                                  </button>
                                ) : null}
                                {person.canPromoteToAdmin && person.memberUserId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleUpdateMemberRole(person.memberUserId!, 'ADMIN')
                                    }
                                    disabled={memberRoleChange !== null}
                                    className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isPromoting ? 'Promoting...' : 'Promote to admin'}
                                  </button>
                                ) : null}
                                {person.canDemoteToMember && person.memberUserId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleUpdateMemberRole(person.memberUserId!, 'MEMBER')
                                    }
                                    disabled={memberRoleChange !== null}
                                    className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isDemoting ? 'Demoting...' : 'Demote to member'}
                                  </button>
                                ) : null}
                                {person.canRemove && person.memberUserId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenRemoveMemberDialog(person.memberUserId!)
                                    }
                                    disabled={removingMemberUserId === person.memberUserId}
                                    className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {removingMemberUserId === person.memberUserId
                                      ? 'Removing...'
                                      : 'Remove'}
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p>No people match the selected status filters.</p>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMemberDirectoryStatuses(new Set(MEMBER_DIRECTORY_STATUS_OPTIONS))
                  }
                  className="mt-2 text-sm font-medium text-brand hover:brightness-95"
                >
                  Show all statuses
                </button>
              </div>
            )
          ) : null}
        </section>
      </div>
    ) : (
      <div className="space-y-4">
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-rose-900">Workspace Cancellation</h3>
              <p className="mt-1 text-sm text-rose-800">
                Retire the workspace when it should no longer accept active rooms, reservations,
                memberships, or invitations.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-xl border border-rose-200 bg-white/90 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-700">
                What Happens Next
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-rose-900">
                <li>Active rooms are marked as cancelled and stop accepting new reservations.</li>
                <li>Future reservations are cancelled while historical records stay preserved.</li>
                <li>
                  Memberships and invitations are deactivated as part of the workspace shutdown.
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-rose-200 bg-white/90 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-700">
                Confirmation Required
              </h4>
              <p className="mt-3 text-sm text-rose-900">
                You will need the workspace name, your owner email, and your password to confirm
                cancellation.
              </p>
              <p className="mt-2 text-sm text-rose-800">
                This action is logical and preserves the workspace history for audit and reporting.
              </p>
              <button
                type="button"
                onClick={openCancelWorkspaceDialog}
                className="mt-4 rounded-lg border border-rose-500 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Cancel Workspace
              </button>
            </div>
          </div>
        </section>
      </div>
    );

  return {
    rightSidebar,
    main: (
      <div className="space-y-4">
        <div className="grid items-start gap-3 xl:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-4">
            <nav className="flex flex-col gap-1" aria-label="Admin subpanels">
              {visibleAdminSubpanels.map((subpanel) => {
                const isActive = subpanel.id === activeSubpanel;

                return (
                  <Link
                    key={subpanel.id}
                    href={buildAdminSubpanelHref(pathname, subpanel.id, currentAdminQuery)}
                    aria-label={subpanel.label}
                    aria-current={isActive ? 'page' : undefined}
                    scroll={false}
                    className={`block rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-brand/10 font-semibold text-brand ring-1 ring-brand/15 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <AdminSubpanelIcon id={subpanel.id} />
                      <span className="block">{subpanel.label}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="pt-2 sm:pt-3">{activeSubpanelContent}</div>
        </div>

        {isCancelWorkspaceFormVisible ? (
          <AdminViewportDialog
            open={isCancelWorkspaceFormVisible}
            labelledBy="cancel-workspace-dialog-title"
            dismissLabel="Close workspace cancellation dialog"
            onDismiss={closeCancelWorkspaceDialog}
          >
            <div className="relative w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="cancel-workspace-dialog-title"
                    className="text-lg font-semibold text-rose-900"
                  >
                    Cancel Workspace
                  </h3>
                  <p className="mt-1 text-sm text-rose-800">
                    This marks the workspace as cancelled. Rooms, reservations, memberships, and
                    invitations are preserved for history and no longer remain active.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCancelWorkspaceDialog}
                  disabled={isCancellingWorkspace}
                  className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <form
                className="mt-4 space-y-3"
                autoComplete="off"
                onSubmit={(event) => void handleCancelWorkspace(event)}
              >
                <div className="hidden" aria-hidden="true">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} />
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    tabIndex={-1}
                  />
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">
                    Workspace Name Confirmation
                  </span>
                  <p className="mb-2 text-xs text-rose-800">
                    Type <span className="font-semibold">{selectedWorkspace.name}</span> to confirm.
                  </p>
                  <input
                    required
                    name="cancel-workspace-confirm-name"
                    autoComplete="off"
                    value={cancelWorkspaceForm.workspaceName}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        workspaceName: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Email</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Enter your owner account email address.
                  </p>
                  <input
                    required
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="cancel-workspace-confirm-contact"
                    autoComplete="new-password"
                    readOnly={!isCancelWorkspaceCredentialsUnlocked}
                    onFocus={() => setIsCancelWorkspaceCredentialsUnlocked(true)}
                    value={cancelWorkspaceForm.email}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Password</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Re-enter your password to confirm workspace cancellation.
                  </p>
                  <input
                    required
                    type="password"
                    name="cancel-workspace-confirm-secret"
                    autoComplete="new-password"
                    readOnly={!isCancelWorkspaceCredentialsUnlocked}
                    onFocus={() => setIsCancelWorkspaceCredentialsUnlocked(true)}
                    value={cancelWorkspaceForm.password}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        password: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={isCancellingWorkspace}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCancellingWorkspace
                      ? 'Cancelling Workspace...'
                      : 'Confirm Workspace Cancellation'}
                  </button>
                  <button
                    type="button"
                    onClick={closeCancelWorkspaceDialog}
                    disabled={isCancellingWorkspace}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Keep Workspace Active
                  </button>
                </div>
              </form>
            </div>
          </AdminViewportDialog>
        ) : null}

        <CriticalUserActionModal
          open={Boolean(removeMemberConfirmation)}
          title="Remove Member"
          description={
            removeMemberConfirmation
              ? `Confirm with your email and password to remove ${removeMemberConfirmation.memberDisplayName} (${removeMemberConfirmation.memberEmail}) from this workspace. Future bookings by this member in this workspace will be cancelled.`
              : 'Confirm with your email and password to remove this member from the workspace.'
          }
          confirmLabel="Remove member"
          cancelLabel="Keep member"
          emailLabel="Email"
          passwordLabel="Password"
          isSubmitting={Boolean(removingMemberUserId)}
          error={removeMemberError}
          form={removeMemberForm}
          onChange={setRemoveMemberForm}
          onClose={closeRemoveMemberDialog}
          onSubmit={handleRemoveMember}
        />

        {deleteRoomConfirmation ? (
          <AdminViewportDialog
            open={Boolean(deleteRoomConfirmation)}
            labelledBy="delete-room-dialog-title"
            dismissLabel="Close room cancellation dialog"
            onDismiss={() => {
              setDeleteRoomConfirmation(null);
              setIsDeleteRoomCredentialsUnlocked(false);
            }}
          >
            <div className="relative w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="delete-room-dialog-title" className="text-lg font-semibold text-rose-900">
                    Cancel Room
                  </h3>
                  <p className="mt-1 text-sm text-rose-800">
                    This marks the room as cancelled. Future reservations in this room are
                    cancelled, while past reservation history is preserved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteRoomConfirmation(null);
                    setIsDeleteRoomCredentialsUnlocked(false);
                  }}
                  disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                  className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <form
                className="mt-4 space-y-3"
                autoComplete="off"
                onSubmit={(event) => void handleConfirmDeleteRoom(event)}
              >
                {/* Decoy credentials fields reduce Chrome autofill on destructive confirmation dialogs. */}
                <div className="hidden" aria-hidden="true">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} />
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    tabIndex={-1}
                  />
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">
                    Room Name Confirmation
                  </span>
                  <p className="mb-2 text-xs text-rose-800">
                    Type <span className="font-semibold">{deleteRoomConfirmation.roomName}</span> to
                    confirm.
                  </p>
                  <input
                    required
                    name="delete-room-confirm-name"
                    autoComplete="off"
                    value={deleteRoomConfirmation.confirmRoomName}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              confirmRoomName: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Email</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Enter your admin account email address.
                  </p>
                  <input
                    required
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="delete-room-confirm-contact"
                    autoComplete="new-password"
                    readOnly={!isDeleteRoomCredentialsUnlocked}
                    onFocus={() => setIsDeleteRoomCredentialsUnlocked(true)}
                    value={deleteRoomConfirmation.email}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              email: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Password</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Re-enter your password to confirm room cancellation.
                  </p>
                  <input
                    required
                    type="password"
                    name="delete-room-confirm-secret"
                    autoComplete="new-password"
                    readOnly={!isDeleteRoomCredentialsUnlocked}
                    onFocus={() => setIsDeleteRoomCredentialsUnlocked(true)}
                    value={deleteRoomConfirmation.password}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              password: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingRoomId === deleteRoomConfirmation.roomId
                      ? 'Cancelling Room...'
                      : 'Confirm Room Cancellation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteRoomConfirmation(null);
                      setIsDeleteRoomCredentialsUnlocked(false);
                    }}
                    disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Keep Room Active
                  </button>
                </div>
              </form>
            </div>
          </AdminViewportDialog>
        ) : null}
      </div>
    ),
  };
}
