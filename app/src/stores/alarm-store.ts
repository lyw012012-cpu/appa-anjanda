import { create } from 'zustand';

import type { Alarm } from '@/types/contracts';

// 알람 목록. Alarm 타입은 contracts C4(types/contracts.ts). 저장(persist, 'appa.alarms.v1')은 I-4.

type AlarmState = {
  alarms: Alarm[];
  addAlarm: (alarm: Alarm) => void;
  toggleAlarm: (id: string) => void;
  removeAlarm: (id: string) => void;
};

export const useAlarmStore = create<AlarmState>((set) => ({
  alarms: [],
  addAlarm: (alarm) => set((s) => ({ alarms: [...s.alarms, alarm] })),
  toggleAlarm: (id) =>
    set((s) => ({
      alarms: s.alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    })),
  removeAlarm: (id) => set((s) => ({ alarms: s.alarms.filter((a) => a.id !== id) })),
}));
