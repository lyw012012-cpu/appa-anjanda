// contracts.md C9. 값을 바꾸는 PR에는 근거 실험 결과를 붙이고 configVersion을 1 올린다.
import type { Sim520Method } from '@/types/contracts';

export const alarmConfig = {
  stageSec: 30, // [가설]
  maxSec: 300, // 안전장치가 이 시간 동안 울리면 gave_up
  snoozeMin: 5,
  maxSnooze: 2,
  recheckSleepyMin: 3, // 😴
  recheckWakingMin: 7, // 🚶·무응답
} as const;

export interface RecommendConfig {
  configVersion: number;
  tauDays: number;
  exposureGain: number;
  habituatedAt: number;
  recentExclude: number;
  sim520Method: Sim520Method;
  simNormalize: 'none' | 'median';
  comfortCap: number;
  harshCap: number;
  prefMinSim: number;
  contrastMaxSim: number;
  contrastMaxSimGentle: number;
  volumeStep: number;
  volumeJitter: number;
  maxVolume: number;
  reward: { tauSec: number; graceSec: number; snoozed: number; fellAsleep: number };
  bandit: {
    mode: 'thompson' | 'mean';
    priorMean: [number, number, number, number, number]; // [상수, 단계, pHabit, 520 닮음, 음높이]
    priorVar: number;
    noiseVar: number;
  };
  reasonMinN: number;
}

export const recommendConfig: RecommendConfig = {
  configVersion: 2,
  tauDays: 3,
  exposureGain: 0.5,
  habituatedAt: 0.5,
  recentExclude: 3,
  sim520Method: 'hand', // E2
  simNormalize: 'median',
  comfortCap: 0.3,
  harshCap: 0.9,
  prefMinSim: 0.5,
  contrastMaxSim: 0.5,
  contrastMaxSimGentle: 0.7,
  volumeStep: 0.25,
  volumeJitter: 0.1,
  maxVolume: 0.9,
  reward: { tauSec: 10, graceSec: 5, snoozed: 0.3, fellAsleep: 0.2 },
  bandit: { mode: 'thompson', priorMean: [0.2, 0.3, -0.5, 0.5, 0], priorVar: 0.05, noiseVar: 0.04 },
  reasonMinN: 10,
};
