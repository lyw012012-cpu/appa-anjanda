// contracts.md C7 사용자 설정 (A). Zustand persist, 키 'appa.settings.v1'. 몸통은 I-4.
import type { UserSettings } from '@/types/contracts';

export const defaultSettings: UserSettings = { chosen: [], excluded: [], startVolume: 0.5, gentleMode: false };

export function getSettings(): UserSettings {
  throw new Error('getSettings: 아직 구현 안 됨 (I-4)');
}

export function updateSettings(patch: Partial<UserSettings>): void {
  throw new Error('updateSettings: 아직 구현 안 됨 (I-4)');
}
