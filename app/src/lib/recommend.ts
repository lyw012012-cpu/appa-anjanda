// contracts.md C8 추천 모듈 (B). 순수 함수만: 시간·무작위·저장소·네트워크 금지(M2).
// 뼈대: 모양만 있고 몸통은 I-6(computeStats)·I-7(나머지)에서 채운다. 기대 결과는 contracts 8절.
import { alarmConfig, type RecommendConfig } from '@/config';
import type {
  AlarmEvent,
  AlarmPlan,
  BanditModel,
  Features,
  IsoTime,
  Sound,
  SoundId,
  SoundLibrary,
  SoundStat,
  UserSettings,
} from '@/types/contracts';

const DAY_MS = 86_400_000;

/** C8 규칙 1: 두 소리의 비슷함 0~1. 같은 소리는 1. m은 library.model.simMedian */
export function similarity(a: Sound, b: Sound, m: number, config: RecommendConfig): number {
  if (a.id === b.id) return 1;
  let dot = 0;
  for (let i = 0; i < a.embedding.length; i++) dot += a.embedding[i] * b.embedding[i];
  const cos = Math.max(0, dot);
  if (config.simNormalize === 'none') return Math.min(1, cos);
  return Math.min(1, Math.max(0, (cos - m) / (1 - m)));
}

/** 소리별 습관화. 이벤트가 없는 소리도 plays 0으로 포함 */
export function computeStats(
  library: SoundLibrary,
  events: readonly AlarmEvent[],
  config: RecommendConfig,
  now: IsoTime,
): Record<SoundId, SoundStat> {
  const nowMs = Date.parse(now);
  const byId = new Map(library.sounds.map((s) => [s.id, s]));

  // 소리마다 (노출 × 시간 감쇠)를 먼저 합친다. H(c)가 후보 c마다 구간을 다시 훑지 않게(Q2).
  const weight = new Map<SoundId, number>();
  const plays = new Map<SoundId, number>();
  const last = new Map<SoundId, { ms: number; iso: IsoTime }>();
  for (const e of events) {
    for (const p of e.played) {
      if (p.soundId === null || !byId.has(p.soundId)) continue; // safety 구간, 목록에서 빠진 소리는 무시
      const ms = Date.parse(p.startedAt);
      if (ms > nowMs) continue; // now보다 뒤는 무시
      const decay = Math.exp(-(nowMs - ms) / DAY_MS / config.tauDays);
      const exposure = config.exposureGain * (p.playedSec / alarmConfig.stageSec);
      weight.set(p.soundId, (weight.get(p.soundId) ?? 0) + exposure * decay);
      plays.set(p.soundId, (plays.get(p.soundId) ?? 0) + 1);
      if (ms > (last.get(p.soundId)?.ms ?? -Infinity)) last.set(p.soundId, { ms, iso: p.startedAt });
    }
  }

  const m = library.model.simMedian;
  const stats: Record<SoundId, SoundStat> = {};
  for (const c of library.sounds) {
    let h = 0;
    for (const [id, w] of weight) h += w * similarity(c, byId.get(id)!, m, config);
    const pHabit = 1 - Math.exp(-h);
    stats[c.id] = {
      soundId: c.id,
      plays: plays.get(c.id) ?? 0,
      habitStrength: h,
      pHabit,
      habituated: pHabit >= config.habituatedAt,
      lastPlayedAt: last.get(c.id)?.iso ?? null,
    };
  }
  return stats;
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
