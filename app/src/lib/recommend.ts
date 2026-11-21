// contracts.md C8 추천 모듈 (B). 순수 함수만: 시간·무작위·저장소·네트워크 금지(M2).
// I-6(computeStats)·I-7(stageRewards·fitBandit·planAlarm). 기대 결과는 contracts 8절.
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
  StagePlan,
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

type Vec5 = [number, number, number, number, number];
type Reward = { features: Features; reward: number };

/** 끈 구간의 보상. 빨리 끌수록 크다 (C8 규칙 4) */
const dismissReward = (playedSec: number, config: RecommendConfig) =>
  0.5 + 0.5 * Math.exp(-playedSec / config.reward.tauSec);

/** 재생된 구간마다 보상. safety 구간과 features가 null인 구간은 빠진다 (C8 규칙 4) */
export function stageRewards(e: AlarmEvent, config: RecommendConfig): Reward[] {
  const { graceSec, snoozed, fellAsleep } = config.reward;
  const out: Reward[] = [];
  const skip = new Set<number>(); // grace로 학습에서 빠지는 구간
  e.played.forEach((p, i) => {
    if (skip.has(i) || p.features === null) return;
    if (!e.dismissed) {
      out.push({ features: p.features, reward: 0 }); // 끝까지 못 끔: 전부 0
      return;
    }
    const q = e.played[i + 1];
    // next 구간 직후 graceSec 안에 끈 것은 이 구간의 공이다
    const graceDismiss = p.end === 'next' && q?.end === 'dismissed' && q.playedSec <= graceSec;
    if (graceDismiss) skip.add(i + 1);
    let reward = 0;
    if (graceDismiss || p.end === 'dismissed') {
      reward = e.recheck === 'no_response' ? fellAsleep : dismissReward(p.playedSec, config);
    } else if (p.end === 'snoozed') reward = snoozed;
    out.push({ features: p.features, reward });
  });
  return out;
}

/** 대칭 양정치 행렬의 역행렬 (가우스-조던, 부분 피벗) */
function invert(a: number[][]): number[][] {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 2 * n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row.slice(n));
}

/** 사람별 학습. occurrenceAt ≤ now인 이벤트의 stageRewards로 사후값 계산 (C8 규칙 5) */
export function fitBandit(events: readonly AlarmEvent[], config: RecommendConfig, now: IsoTime): BanditModel {
  const { priorMean, priorVar, noiseVar } = config.bandit;
  const nowMs = Date.parse(now);
  const A = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => (i === j ? 1 / priorVar : 0)));
  const b = priorMean.map((v) => v / priorVar);
  let n = 0;
  for (const e of events) {
    if (Date.parse(e.occurrenceAt) > nowMs) continue;
    for (const { features: x, reward } of stageRewards(e, config)) {
      n++;
      for (let i = 0; i < 5; i++) {
        b[i] += (x[i] * reward) / noiseVar;
        for (let j = 0; j < 5; j++) A[i][j] += (x[i] * x[j]) / noiseVar;
      }
    }
  }
  const cov = invert(A);
  const mean = cov.map((row) => row.reduce((s, v, j) => s + v * b[j], 0)) as Vec5;
  return { mean, cov, n };
}

// ---- 난수: 같은 seed면 같은 수열 (C8 규칙 6·15). Math.random 금지(M2) ----
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Box-Muller. 난수 2개로 표준정규 2개 */
function normals(rand: () => number, count: number): number[] {
  const z: number[] = [];
  while (z.length < count) {
    const r = Math.sqrt(-2 * Math.log(1 - rand())); // 1 - rand() ∈ (0, 1]
    const t = 2 * Math.PI * rand();
    z.push(r * Math.cos(t), r * Math.sin(t));
  }
  return z.slice(0, count);
}
/** a = L Lᵀ 인 아래삼각 L */
function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(0, s)) : L[j][j] === 0 ? 0 : s / L[j][j];
    }
  }
  return L;
}

const dotv = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** 이 사람의 mean에서 사전값과 가장 많이 달라진 특징(상수·단계 제외)을 문장으로 (C8 규칙 13) */
function reasonText(model: BanditModel, config: RecommendConfig): string {
  if (model.n < config.reasonMinN) return '아직 배우는 중이에요: 처음 고른 소리와 520 Hz 닮음으로 골랐어요';
  const prior = config.bandit.priorMean;
  let best = 2;
  for (const i of [3, 4]) if (Math.abs(model.mean[i] - prior[i]) > Math.abs(model.mean[best] - prior[best])) best = i;
  const up = model.mean[best] - prior[best] > 0;
  if (best === 4) return up ? '고음에 잘 깨셨어요' : '저음에 잘 깨셨어요';
  if (best === 3) return up ? '520 Hz를 닮은 소리에 잘 깨셨어요' : '520 Hz와 다른 소리에 잘 깨셨어요';
  return up ? '익숙한 소리에 잘 깨셨어요' : '낯선 소리에 잘 깨셨어요';
}

/** 알람 한 번의 3단계 계획 (C8 규칙 6~15) */
export function planAlarm(input: {
  library: SoundLibrary;
  events: readonly AlarmEvent[];
  settings: UserSettings;
  config: RecommendConfig;
  now: IsoTime;
  seed: string; // C10은 `${alarmId}__${다음 occurrenceAt}`을 넘긴다
}): AlarmPlan {
  const { library, events, settings, config, now, seed } = input;
  const m = library.model.simMedian;
  const stats = computeStats(library, events, config, now);
  const model = fitBandit(events, config, now);

  // 난수: z 5개를 먼저, 음량 흔들림 u 3개를 뒤에 (mean 모드에서도 같은 수열을 소비)
  const rand = mulberry32(fnv1a(seed));
  const z = normals(rand, 5);
  const jitter = [rand(), rand(), rand()].map((r) => 2 * r - 1);
  const L = cholesky(model.cov);
  const theta = (config.bandit.mode === 'mean' ? model.mean : model.mean.map((v, i) => v + dotv(L[i], z))) as Vec5;

  // 최근에 울린 소리 recentExclude개 (가장 늦게 울린 순, 같으면 id 순)
  const recent = new Set(
    library.sounds
      .filter((s) => stats[s.id].lastPlayedAt !== null)
      .sort(
        (a, b) =>
          Date.parse(stats[b.id].lastPlayedAt!) - Date.parse(stats[a.id].lastPlayedAt!) || (a.id < b.id ? -1 : 1),
      )
      .slice(0, config.recentExclude)
      .map((s) => s.id),
  );
  const excluded = new Set(settings.excluded);
  const base = library.sounds.filter((s) => !excluded.has(s.id)); // 풀지 않는 조건 (규칙 7)
  const chosen = library.sounds.filter((s) => settings.chosen.includes(s.id));
  const contrastMax = settings.gentleMode ? config.contrastMaxSimGentle : config.contrastMaxSim;
  const x = (c: Sound, stage: 1 | 2 | 3): Features => [
    1,
    (stage - 1) / 2,
    stats[c.id].pHabit,
    c.sim520[config.sim520Method],
    c.pitch,
  ];
  const sim = (a: Sound, b: Sound) => similarity(a, b, m, config);
  const fallback: AlarmPlan['fallback'] = [];
  const release = (k: AlarmPlan['fallback'][number]) => {
    if (!fallback.includes(k)) fallback.push(k);
  };

  /** 후보에서 점수가 가장 큰 소리. 같으면 앞선 id (목록이 id 오름차순이라 > 만 쓴다) */
  const best = (pool: Sound[], stage: 1 | 2 | 3, w: readonly number[]): Sound | null => {
    let top: Sound | null = null;
    let topScore = -Infinity;
    for (const c of pool) {
      const sc = dotv(w, x(c, stage));
      if (sc > topScore) {
        top = c;
        topScore = sc;
      }
    }
    return top;
  };

  // 1단계: 풀 수 있는 조건은 recent뿐. 그래도 비면 선호·편안함 상한까지 내리고 harshCap만 지킨다
  const comfy = (c: Sound) => c.harshness <= config.comfortCap;
  const liked = (c: Sound) =>
    chosen.length === 0 ||
    chosen.some((s) => s.id === c.id) ||
    Math.max(...chosen.map((s) => sim(c, s))) >= config.prefMinSim;
  let s1 = best(
    base.filter((c) => !recent.has(c.id) && comfy(c) && liked(c)),
    1,
    theta,
  );
  if (!s1) {
    release('recent');
    s1 = best(
      base.filter((c) => comfy(c) && liked(c)),
      1,
      theta,
    );
  }
  if (!s1) {
    const safe = base.length > 0 ? base : library.sounds; // 전부 뺐다면 목록 전체에서 가장 부드러운 것
    s1 = safe.reduce((a, c) => (c.harshness < a.harshness ? c : a));
  }
  const first: Sound = s1;

  // 2단계: recent → contrast 순으로 푼다
  const harshOk = (c: Sound) => c.harshness <= config.harshCap;
  const pool2 = (relaxRecent: boolean, relaxContrast: boolean) =>
    base.filter(
      (c) =>
        c.id !== first.id &&
        harshOk(c) &&
        (relaxRecent || !recent.has(c.id)) &&
        (relaxContrast || sim(c, first) <= contrastMax),
    );
  let s2 = best(pool2(false, false), 2, theta);
  if (!s2) {
    release('recent');
    s2 = best(pool2(true, false), 2, theta);
  }
  if (!s2) {
    release('contrast');
    s2 = best(pool2(true, true), 2, theta);
  }

  // 3단계: 최근 제외 없음. contrast → habituated 순으로 푼다. 점수는 표본이 아니라 mean
  const used = s2 ? [first, s2] : [first];
  const pool3 = (relaxContrast: boolean, relaxHabit: boolean) =>
    base.filter(
      (c) =>
        !used.some((u) => u.id === c.id) &&
        harshOk(c) &&
        (relaxHabit || stats[c.id].pHabit < config.habituatedAt) &&
        (relaxContrast || used.every((u) => sim(c, u) <= contrastMax)),
    );
  let s3 = best(pool3(false, false), 3, model.mean);
  if (!s3) {
    release('contrast');
    s3 = best(pool3(true, false), 3, model.mean);
  }
  if (!s3) {
    release('habituated');
    s3 = best(pool3(true, true), 3, model.mean);
  }

  // 다 풀어도 비면 1단계 소리를 다시 쓴다 (규칙 11)
  const picked: [Sound, Sound, Sound] = [first, s2 ?? first, s3 ?? first];
  const stage = (i: 0 | 1 | 2): StagePlan => {
    const n = (i + 1) as 1 | 2 | 3;
    const f = x(picked[i], n);
    const vol = Math.min(config.maxVolume, settings.startVolume * (1 + config.volumeStep) ** (n - 1));
    return {
      stage: n,
      soundId: picked[i].id,
      volume: Math.min(config.maxVolume, Math.max(0, vol * (1 + config.volumeJitter * jitter[i]))),
      features: f,
      predicted: dotv(n === 3 ? model.mean : theta, f),
    };
  };
  return {
    stages: [stage(0), stage(1), stage(2)],
    weights: theta,
    reason: reasonText(model, config),
    fallback,
    seed,
    configVersion: config.configVersion,
  };
}
