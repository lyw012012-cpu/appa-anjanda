// contracts.md C7 사용자 설정 (A). Zustand persist, 키 'appa.settings.v1'.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserSettings } from '@/types/contracts';

export const defaultSettings: UserSettings = { chosen: [], excluded: [], startVolume: 0.5, gentleMode: false };

export const useSettingsStore = create<UserSettings>()(
  persist(() => defaultSettings, { name: 'appa.settings.v1', storage: createJSONStorage(() => AsyncStorage) }),
);

export function getSettings(): UserSettings {
  const { chosen, excluded, startVolume, gentleMode } = useSettingsStore.getState();
  return { chosen, excluded, startVolume, gentleMode };
}

export function updateSettings(patch: Partial<UserSettings>): void {
  useSettingsStore.setState(patch);
}
