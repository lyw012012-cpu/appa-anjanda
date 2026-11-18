// contracts.md C8 추천 모듈 (B). 순수 함수만: 시간·무작위·저장소·네트워크 금지(M2).
// 뼈대: 모양만 있고 몸통은 I-6(computeStats)·I-7(나머지)에서 채운다. 기대 결과는 contracts 8절.
import type { RecommendConfig } from '@/config';
import type {
  AlarmEvent,
  AlarmPlan,
  BanditModel,
  Features,
  IsoTime,
  SoundId,
  SoundLibrary,
  SoundStat,
  UserSettings,
} from '@/types/contracts';

/** 소리별 습관화. 이벤트가 없는 소리도 plays 0으로 포함 */
export function computeStats(
  library: SoundLibrary,
  events: readonly AlarmEvent[],
  config: RecommendConfig,
  now: IsoTime,
): Record<SoundId, SoundStat> {
  throw new Error('computeStats: 아직 구현 안 됨 (I-6)');
}

/** 재생된 구간마다 보상. safety 구간과 features가 null인 구간은 빠진다 */
export function stageRewards(e: AlarmEvent, config: RecommendConfig): { features: Features; reward: number }[] {
  throw new Error('stageRewards: 아직 구현 안 됨 (I-7)');
}

/** 사람별 학습. occurrenceAt ≤ now인 이벤트의 stageRewards로 사후값 계산 */
export function fitBandit(events: readonly AlarmEvent[], config: RecommendConfig, now: IsoTime): BanditModel {
  throw new Error('fitBandit: 아직 구현 안 됨 (I-7)');
}

/** 알람 한 번의 3단계 계획 */
export function planAlarm(input: {
  library: SoundLibrary;
  events: readonly AlarmEvent[];
  settings: UserSettings;
  config: RecommendConfig;
  now: IsoTime;
  seed: string; // C10은 `${alarmId}__${다음 occurrenceAt}`을 넘긴다
}): AlarmPlan {
  throw new Error('planAlarm: 아직 구현 안 됨 (I-7)');
}
