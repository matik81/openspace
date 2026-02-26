'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { addDaysToDateKey, workspaceTodayDateKey } from '@/lib/time';

type SelectedDateContextValue = {
  dateKey: string;
  monthKey: string;
  setDateKey: (dateKey: string) => void;
  setMonthKey: (monthKey: string) => void;
  goToToday: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
};

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  const [dateKey, setDateKeyState] = useState(() => workspaceTodayDateKey(timezone));
  const [monthKey, setMonthKey] = useState(() => workspaceTodayDateKey(timezone).slice(0, 7));

  useEffect(() => {
    const today = workspaceTodayDateKey(timezone);
    setDateKeyState(today);
    setMonthKey(today.slice(0, 7));
  }, [timezone]);

  const value = useMemo<SelectedDateContextValue>(
    () => ({
      dateKey,
      monthKey,
      setDateKey: (nextDateKey) => {
        setDateKeyState(nextDateKey);
        setMonthKey(nextDateKey.slice(0, 7));
      },
      setMonthKey,
      goToToday: () => {
        const today = workspaceTodayDateKey(timezone);
        setDateKeyState(today);
        setMonthKey(today.slice(0, 7));
      },
      goToPreviousDay: () => {
        setDateKeyState((previous) => {
          const next = addDaysToDateKey(previous, -1, timezone);
          setMonthKey(next.slice(0, 7));
          return next;
        });
      },
      goToNextDay: () => {
        setDateKeyState((previous) => {
          const next = addDaysToDateKey(previous, 1, timezone);
          setMonthKey(next.slice(0, 7));
          return next;
        });
      },
    }),
    [dateKey, monthKey, timezone],
  );

  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>;
}

export function useSelectedDate(): SelectedDateContextValue {
  const context = useContext(SelectedDateContext);
  if (!context) {
    throw new Error('useSelectedDate must be used within SelectedDateProvider');
  }

  return context;
}

