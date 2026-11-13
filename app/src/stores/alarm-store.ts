import { create } from 'zustand';

// 예시 스토어: 화면에 영향을 주는 동적 데이터는 Zustand 스토어로 관리합니다.
export type Alarm = {
  id: string;
  time: string; // "HH:mm"
  enabled: boolean;
  soundId?: string;
};

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
