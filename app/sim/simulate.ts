// I-13 시뮬레이션: 가상 사용자 5종에게 14일 동안 알람을 울린다. 추천은 앱의 planAlarm·fitBandit·computeStats를 그대로 부른다.
// "학습이 이렇게 움직인다"를 보이는 용도이고 효과의 증거가 아니다. 반응 모델의 값은 전부 [가설].
import { alarmConfig, recommendConfig, type RecommendConfig } from '@/config';
import { computeStats, fitBandit, fnv1a, mulberry32, planAlarm } from '@/lib/recommend';
import type {
  AlarmEvent,
  AlarmPlan,
  Features,
  IsoTime,
  PlayedStage,
  Sound,
  SoundLibrary,
  UserSettings,
} from '@/types/contracts';

export const DAYS = 14;
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** 가상 사용자. 깨는 확률 = σ(base + wStage·단계위치 + wHabit·pHabit + w520·sim520 + wPitch·pitch). 모두 [가설] */
export interface Profile {
  id: string;
  label: string;
  base: number;
  wStage: number;
  wHabit: number;
  w520: number;
  wPitch: number;
  snoozeP: number; // 깰 때마다 스누즈를 누를 확률(최대 maxSnooze번)
  resleepR: number; // 다시 잠들 확률 = resleepR × (1 − 깰 확률). 힘들게 깰수록 다시 자기 쉽다
  excludeHarsh: boolean; // 거슬림 0.4 초과 소리로 깨면 60% 확률로 "이 소리 빼기"
}
export const PROFILES: Profile[] = [
  { id: 'u1', label: '① 잠이 깊음', base: -3, wStage: 3, wHabit: -3, w520: 1, wPitch: 0, snoozeP: 0.1, resleepR: 0.4, excludeHarsh: false },
  { id: 'u2', label: '② 잠이 얕음', base: 1, wStage: 2, wHabit: -3, w520: 1, wPitch: 0, snoozeP: 0.1, resleepR: 0.1, excludeHarsh: false },
  { id: 'u3', label: '③ 늘 스누즈', base: -0.5, wStage: 2, wHabit: -3, w520: 1, wPitch: 0, snoozeP: 0.7, resleepR: 0.2, excludeHarsh: false },
  { id: 'u6', label: '⑥ 고음이 안 들림', base: -0.5, wStage: 2, wHabit: -3, w520: 0, wPitch: -3, snoozeP: 0.1, resleepR: 0.2, excludeHarsh: false },
  { id: 'u7', label: '⑦ 예민함', base: 0, wStage: 2, wHabit: -3, w520: 1, wPitch: 0, snoozeP: 0.1, resleepR: 0.15, excludeHarsh: true },
];

// ---- 비교군 ----
type Planner = (a: { library: SoundLibrary; events: AlarmEvent[]; settings: UserSettings; now: IsoTime; seed: string }) => AlarmPlan;
interface Arm {
  id: string;
  label: string;
  library: (real: SoundLibrary) => SoundLibrary;
  plan: (cfg: RecommendConfig) => Planner;
}

const modelPlanner = (config: RecommendConfig): Planner => (a) => planAlarm({ ...a, config });

/** 무작위: 같은 3단계 틀, 소리만 무작위. excluded와 harshCap은 지킨다 */
const randomPlanner = (config: RecommendConfig): Planner => (a) => {
  const stats = computeStats(a.library, a.events, config, a.now);
  const rand = mulberry32(fnv1a(`random|${a.seed}`));
  const pool = a.library.sounds.filter((s) => !a.settings.excluded.includes(s.id) && s.harshness <= config.harshCap);
  const pick: Sound[] = [];
  while (pick.length < 3 && pool.length > pick.length) {
    const c = pool[Math.floor(rand() * pool.length)];
    if (!pick.includes(c)) pick.push(c);
  }
  while (pick.length < 3) pick.push(pick[0]);
  const stages = pick.map((c, i) => {
    const f: Features = [1, i / 2, stats[c.id].pHabit, c.sim520[config.sim520Method], c.pitch];
    return { stage: (i + 1) as 1 | 2 | 3, soundId: c.id, volume: a.settings.startVolume, features: f, predicted: 0 };
  }) as AlarmPlan['stages'];
  return { stages, weights: [0, 0, 0, 0, 0], reason: '무작위', fallback: [], seed: a.seed, configVersion: config.configVersion };
};

/** 특징 하나(hand)를 뺀 것과 같다: 모든 소리의 520 닮음을 0으로 두고 사전 가중치도 0 */
const noHandLibrary = (real: SoundLibrary): SoundLibrary => ({
  ...real,
  sounds: real.sounds.map((s) => ({ ...s, sim520: { emb: 0, mel: 0, hand: 0 } })),
});

/** 대비를 음량·음높이·거칠기 축으로 재는 근사: 임베딩을 [pitch, harshness, 0.3]로 바꾸고 simMedian을 다시 구한다 */
const axesLibrary = (real: SoundLibrary): SoundLibrary => {
  const sounds = real.sounds.map((s) => {
    const v = [s.pitch, s.harshness, 0.3];
    const n = Math.hypot(...v);
    return { ...s, embedding: v.map((x) => x / n) };
  });
  const sims: number[] = [];
  for (let i = 0; i < sounds.length; i++)
    for (let j = i + 1; j < sounds.length; j++) sims.push(Math.max(0, dot(sounds[i].embedding, sounds[j].embedding)));
  sims.sort((a, b) => a - b);
  return { ...real, model: { ...real.model, embeddingDim: 3, simMedian: sims[Math.floor(sims.length / 2)] }, sounds };
};

const same = (real: SoundLibrary) => real;
const thompson = recommendConfig;
const noPrior: RecommendConfig = { ...recommendConfig, bandit: { ...recommendConfig.bandit, priorVar: 1e-9 } };
const noHandCfg: RecommendConfig = {
  ...recommendConfig,
  bandit: { ...recommendConfig.bandit, priorMean: [0.2, 0.3, -0.5, 0, 0] },
};

export const ARMS: Arm[] = [
  { id: 'random', label: '무작위 돌리기', library: same, plan: randomPlanner },
  { id: 'prior', label: '학습 없는 규칙', library: same, plan: () => modelPlanner(noPrior) },
  { id: 'model', label: '이 모델', library: same, plan: () => modelPlanner(thompson) },
  { id: 'nohand', label: '이 모델 (hand 특징 없음)', library: noHandLibrary, plan: () => modelPlanner(noHandCfg) },
  { id: 'axes', label: '이 모델 (대비를 음높이·거칠기 축으로, 근사)', library: axesLibrary, plan: () => modelPlanner(thompson) },
];

// ---- 한 사람 × 한 비교군 × 한 반복 ----
const iso = (ms: number): IsoTime => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19) + '+09:00';
const DAY0 = Date.parse('2026-11-01T07:00:00+09:00');

export interface DayResult {
  wakeStage: number; // 깬 단계 1~3, 안전장치까지 갔으면 4
  safety: boolean;
  resleep: boolean;
  uniqueSounds: number; // 지금까지 쓴 서로 다른 소리 수
  cos: number; // 학습한 가중치(단계·pHabit·520·음높이)와 정답 방향의 코사인
  pitchW: number; // 학습한 음높이 가중치
  stageSounds: string[];
}

export function runOne(profile: Profile, arm: Arm, real: SoundLibrary, rep: number): { days: DayResult[]; fresh: number } {
  const lib = arm.library(real);
  const planner = arm.plan(recommendConfig);
  const events: AlarmEvent[] = [];
  const settings: UserSettings = { chosen: [], excluded: [], startVolume: 0.5, gentleMode: false };
  const used = new Set<string>();
  const truth = [profile.wStage, profile.wHabit, profile.w520, profile.wPitch];
  const days: DayResult[] = [];

  for (let d = 0; d < DAYS; d++) {
    const t0 = DAY0 + d * 86_400_000;
    const occurrenceAt = iso(t0);
    const plan = planner({ library: lib, events, settings, now: occurrenceAt, seed: `${profile.id}-${rep}__${occurrenceAt}` });
    // 정답 반응은 진짜 목록(real)의 특징과 진짜 습관화로 계산한다 (비교군이 보는 특징과 별개)
    const truthStats = computeStats(real, events, recommendConfig, occurrenceAt);
    const rng = (key: string) => mulberry32(fnv1a(`${profile.id}|${rep}|${d}|${key}`)); // 공통 난수

    const played: PlayedStage[] = [];
    let i = 0;
    let t = 0;
    let snoozes = 0;
    let attempt = 0;
    let wakeStage = 4;
    let recheck: AlarmEvent['recheck'] = 'responded';
    let wokenSound: Sound | null = null;
    for (; i < 3; ) {
      const sp = plan.stages[i];
      const s = real.sounds.find((x) => x.id === sp.soundId)!;
      const x = [i / 2, truthStats[s.id].pHabit, s.sim520.hand, s.pitch];
      const p = sigmoid(profile.base + dot([profile.wStage, profile.wHabit, profile.w520, profile.wPitch], x));
      const u = rng(`wake${attempt}`)();
      const stageStart = iso(t0 + t * 1000);
      if (u >= p) {
        played.push({ stage: sp.stage, soundId: sp.soundId, volume: sp.volume, startedAt: stageStart, playedSec: alarmConfig.stageSec, end: 'next', features: sp.features });
        t += alarmConfig.stageSec;
        i++;
        attempt++;
        continue;
      }
      const sec = alarmConfig.stageSec * (u / p); // 깨는 순간은 단계 안에서 균등
      const snooze = snoozes < alarmConfig.maxSnooze && rng(`snooze${attempt}`)() < profile.snoozeP;
      played.push({ stage: sp.stage, soundId: sp.soundId, volume: sp.volume, startedAt: stageStart, playedSec: sec, end: snooze ? 'snoozed' : 'dismissed', features: sp.features });
      attempt++;
      if (snooze) {
        snoozes++;
        t += sec + alarmConfig.snoozeMin * 60; // 스누즈 뒤 같은 단계가 다시 울린다
        continue;
      }
      wakeStage = i + 1;
      wokenSound = s;
      recheck = rng('resleep')() < profile.resleepR * (1 - p) ? 'no_response' : 'responded';
      break;
    }
    if (wakeStage === 4) {
      played.push({ stage: 'safety', soundId: null, volume: 1, startedAt: iso(t0 + t * 1000), playedSec: 60, end: 'dismissed', features: null });
      recheck = rng('resleep')() < profile.resleepR ? 'no_response' : 'responded';
    }
    events.push({
      alarmId: 'a_sim00001',
      occurrenceAt,
      endedAt: iso(t0 + (t + 60) * 1000),
      played,
      snoozeCount: snoozes,
      dismissed: true,
      backfilled: false,
      schemaVersion: 2,
      eventId: `a_sim00001__${occurrenceAt}`,
      plan,
      state: null,
      recheck,
      appVersion: 'sim',
    });
    if (profile.excludeHarsh && wokenSound && wokenSound.harshness > 0.4 && rng('exclude')() < 0.6 && !settings.excluded.includes(wokenSound.id))
      settings.excluded = [...settings.excluded, wokenSound.id];

    plan.stages.forEach((s) => used.add(s.soundId));
    const m = fitBandit(events, recommendConfig, iso(t0 + 3_600_000));
    const learned = m.mean.slice(1);
    const cos = dot(learned, truth) / (Math.hypot(...learned) * Math.hypot(...truth) || 1);
    days.push({ wakeStage, safety: wakeStage === 4, resleep: recheck === 'no_response', uniqueSounds: used.size, cos, pitchW: m.mean[4], stageSounds: plan.stages.map((s) => s.soundId) });
  }
  // 14일 뒤 남은 낯선 소리: 습관화되지 않은 소리 수 (빼기한 소리 제외)
  const endStats = computeStats(real, events, recommendConfig, iso(DAY0 + DAYS * 86_400_000));
  const fresh = real.sounds.filter((s) => !settings.excluded.includes(s.id) && !endStats[s.id].habituated).length;
  return { days, fresh };
}

// ---- 반복 평균 ----
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));

export function runAll(real: SoundLibrary, reps: number) {
  const users: Record<string, unknown> = {};
  for (const profile of PROFILES) {
    const arms: Record<string, unknown> = {};
    for (const arm of ARMS) {
      const runs = Array.from({ length: reps }, (_, r) => runOne(profile, arm, real, r));
      const per = (f: (d: DayResult) => number) => Array.from({ length: DAYS }, (_, d) => mean(runs.map((r) => f(r.days[d]))));
      const overall = (f: (d: DayResult) => number, from = 0) => runs.map((r) => mean(r.days.slice(from).map(f)));
      arms[arm.id] = {
        label: arm.label,
        days: {
          wakeStage: per((d) => d.wakeStage),
          safetyRate: per((d) => (d.safety ? 1 : 0)),
          resleepRate: per((d) => (d.resleep ? 1 : 0)),
          uniqueSounds: per((d) => d.uniqueSounds),
          cos: per((d) => d.cos),
          pitchW: per((d) => d.pitchW),
        },
        summary: {
          wakeStage: { mean: mean(overall((d) => d.wakeStage)), sd: sd(overall((d) => d.wakeStage)) },
          wakeStageLast7: { mean: mean(overall((d) => d.wakeStage, 7)), sd: sd(overall((d) => d.wakeStage, 7)) },
          safetyRate: { mean: mean(overall((d) => (d.safety ? 1 : 0))), sd: sd(overall((d) => (d.safety ? 1 : 0))) },
          safetyRateLast7: { mean: mean(overall((d) => (d.safety ? 1 : 0), 7)), sd: sd(overall((d) => (d.safety ? 1 : 0), 7)) },
          resleepRate: mean(overall((d) => (d.resleep ? 1 : 0))),
          uniqueSounds: mean(runs.map((r) => r.days[DAYS - 1].uniqueSounds)),
          freshSoundsLeft: mean(runs.map((r) => r.fresh)),
          finalCos: mean(runs.map((r) => r.days[DAYS - 1].cos)),
          finalPitchW: mean(runs.map((r) => r.days[DAYS - 1].pitchW)),
        },
      };
    }
    users[profile.id] = { label: profile.label, truth: profile, arms };
  }
  return {
    meta: {
      days: DAYS,
      reps,
      note: '시뮬레이션 가정 안에서 학습이 어떻게 움직이는지 보이는 것. 효과의 증거가 아니다. 반응 모델의 모든 값은 [가설].',
      configVersion: recommendConfig.configVersion,
      assumptions: {
        response: 'P(깸) = σ(base + wStage·단계위치 + wHabit·pHabit + w520·sim520 + wPitch·pitch), 단계마다 30초, 깨는 순간은 단계 안에서 균등',
        habituation: '정답 반응의 pHabit은 앱과 같은 computeStats(진짜 소리 목록)로 계산(습관화 식이 맞다고 가정)',
        snooze: '깰 때마다 snoozeP 확률로 스누즈(최대 2번), 5분 뒤 같은 단계가 다시 울림',
        resleep: '다시 잠들 확률 = resleepR × (1 − 깰 확률). 안전장치로 깬 경우 resleepR',
        exclude: '⑦은 거슬림 0.4 초과 소리로 깨면 60% 확률로 이 소리 빼기',
        settings: '모든 사용자 chosen 비움(소리를 안 고른 사람), startVolume 0.5, 하루 한 번 07:00',
        nohand: '모든 소리의 sim520을 0으로 두고 520 사전 가중치도 0 (특징 하나를 뺀 것과 같음)',
        axes: '대비 거리를 임베딩 대신 [pitch, harshness, 0.3] 정규화 벡터로 잰 근사, simMedian은 그 쌍 중앙값',
        commonRandom: '같은 사용자·같은 반복에서 깨기 판정 난수는 비교군 간 공통',
      },
    },
    users,
  };
}
