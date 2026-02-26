'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';
import type { WorkspaceItem } from '@/lib/types';

type WorkspaceSessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
} | null;

type WorkspaceContextValue = {
  workspace: WorkspaceItem;
  currentUser: WorkspaceSessionUser;
  isAdmin: boolean;
  isActiveMember: boolean;
  isPendingInvitationOnly: boolean;
  timezone: string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspace,
  currentUser,
  children,
}: {
  workspace: WorkspaceItem;
  currentUser: WorkspaceSessionUser;
  children: ReactNode;
}) {
  const value = useMemo<WorkspaceContextValue>(() => {
    const isActiveMember = workspace.membership?.status === 'ACTIVE';
    const isAdmin = isActiveMember && workspace.membership?.role === 'ADMIN';
    const isPendingInvitationOnly =
      workspace.membership === null && workspace.invitation?.status === 'PENDING';

    return {
      workspace,
      currentUser,
      isAdmin,
      isActiveMember,
      isPendingInvitationOnly,
      timezone: workspace.timezone,
    };
  }, [workspace, currentUser]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }

  return context;
}

