'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDaysToDateKey, workspaceTodayDateKey } from '@/lib/time';

type SharedSelectedDateState = {
  dateKey: string;
  monthKey: string;
};

const SHARED_SELECTED_DATE_STORAGE_KEY = 'openspace:selected-date';
let sharedSelectedDateStateCache: SharedSelectedDateState | null = null;

function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function readSharedSelectedDateState(): SharedSelectedDateState | null {
  if (sharedSelectedDateStateCache) {
    return sharedSelectedDateStateCache;
  }
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SHARED_SELECTED_DATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SharedSelectedDateState> | null;
    if (
      !parsed ||
      typeof parsed.dateKey !== 'string' ||
      typeof parsed.monthKey !== 'string' ||
      !isValidDateKey(parsed.dateKey) ||
      !isValidMonthKey(parsed.monthKey)
    ) {
      return null;
    }

    const state = {
      dateKey: parsed.dateKey,
      monthKey: parsed.monthKey,
    } satisfies SharedSelectedDateState;

    sharedSelectedDateStateCache = state;
    return state;
  } catch {
    return null;
  }
}

function writeSharedSelectedDateState(state: SharedSelectedDateState): void {
  sharedSelectedDateStateCache = state;
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SHARED_SELECTED_DATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
}

function resolveInitialSharedSelectedDateState(timezone: string): SharedSelectedDateState {
  const existingState = readSharedSelectedDateState();
  if (existingState) {
    return existingState;
  }

  const today = workspaceTodayDateKey(timezone);
  return {
    dateKey: today,
    monthKey: today.slice(0, 7),
  };
}

export function useSharedSelectedDate(timezone: string) {
  const [state, setState] = useState<SharedSelectedDateState>(() =>
    resolveInitialSharedSelectedDateState(timezone),
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SHARED_SELECTED_DATE_STORAGE_KEY) {
        return;
      }

      const nextState = readSharedSelectedDateState();
      if (!nextState) {
        return;
      }

      setState((previous) =>
        previous.dateKey === nextState.dateKey && previous.monthKey === nextState.monthKey
          ? previous
          : nextState,
      );
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateState = useCallback(
    (
      nextState:
        | SharedSelectedDateState
        | ((previous: SharedSelectedDateState) => SharedSelectedDateState),
    ) => {
      setState((previous) => {
        const resolved = typeof nextState === 'function' ? nextState(previous) : nextState;
        writeSharedSelectedDateState(resolved);
        return resolved;
      });
    },
    [],
  );

  const setDateKey = useCallback(
    (dateKey: string) => {
      updateState({
        dateKey,
        monthKey: dateKey.slice(0, 7),
      });
    },
    [updateState],
  );

  const setMonthKey = useCallback(
    (monthKey: string) => {
      updateState((previous) => ({
        ...previous,
        monthKey,
      }));
    },
    [updateState],
  );

  const goToToday = useCallback(() => {
    const today = workspaceTodayDateKey(timezone);
    updateState({
      dateKey: today,
      monthKey: today.slice(0, 7),
    });
  }, [timezone, updateState]);

  const goToPreviousDay = useCallback(() => {
    updateState((previous) => {
      const nextDateKey = addDaysToDateKey(previous.dateKey, -1, timezone);
      return {
        dateKey: nextDateKey,
        monthKey: nextDateKey.slice(0, 7),
      };
    });
  }, [timezone, updateState]);

  const goToNextDay = useCallback(() => {
    updateState((previous) => {
      const nextDateKey = addDaysToDateKey(previous.dateKey, 1, timezone);
      return {
        dateKey: nextDateKey,
        monthKey: nextDateKey.slice(0, 7),
      };
    });
  }, [timezone, updateState]);

  return useMemo(
    () => ({
      dateKey: state.dateKey,
      monthKey: state.monthKey,
      setDateKey,
      setMonthKey,
      goToToday,
      goToPreviousDay,
      goToNextDay,
    }),
    [goToNextDay, goToPreviousDay, goToToday, setDateKey, setMonthKey, state],
  );
}
