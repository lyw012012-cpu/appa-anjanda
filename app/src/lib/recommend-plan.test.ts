// contracts.md 8절 "나·다·라" + 규칙 16: 보상, 사람별 학습, 3단계 고르기, Thompson, 성능.
import { recommendConfig } from '@/config';
import fixture from '@/data/sounds.fixture.json';
import { fitBandit, planAlarm, stageRewards } from '@/lib/recommend';
import { loadSoundLibrary } from '@/lib/sound-library';
import type { AlarmEvent, Features, PlayedStage, SoundLibrary, UserSettings } from '@/types/contracts';

const library = fixture as unknown as SoundLibrary;
const NOW = '2026-11-16T07:00:00+09:00';
const at = (day: number) => `2026-11-${day}T07:00:00+09:00`;
const base = { ...recommendConfig, recentExclude: 1, bandit: { ...recommendConfig.bandit, mode: 'mean' as const } };
const settings: UserSettings = { chosen: ['melody_a'], excluded: [], startVolume: 0.5, gentleMode: false };

const seg = (
  soundId: string | null,
  startedAt: string,
  playedSec: number,
  end: PlayedStage['end'],
  features: Features | null = null,
  stage: PlayedStage['stage'] = 1,
): PlayedStage => ({ stage, soundId, volume: 0.5, startedAt, playedSec, end, features });

const event = (played: PlayedStage[], over: Partial<AlarmEvent> = {}): AlarmEvent => ({
  alarmId: 'a_test0001',
  occurrenceAt: played[0].startedAt,
  endedAt: played[played.length - 1].startedAt,
  played,
  snoozeCount: 0,
  dismissed: true,
  backfilled: false,
  schemaVersion: 2,
  eventId: `a_test0001__${played[0].startedAt}`,
  plan: null,
  state: null,
  recheck: 'none',
  appVersion: 'test',
  ...over,
});

const ids = (plan: ReturnType<typeof planAlarm>) => plan.stages.map((s) => s.soundId);
const plan = (events: AlarmEvent[], over: Record<string, unknown> = {}) =>
  planAlarm({ library, events, settings, config: base, now: NOW, seed: 's1', ...over });

// 가. 습관화에서 쓴 이벤트 A: square_520을 11-14·15에 60초씩
const A = [
  event([seg('square_520', at(14), 60, 'dismissed')]),
  event([seg('square_520', at(15), 60, 'dismissed')]),
];

// 다. 이벤트 D: 알람 3번
const f1: Features = [1, 0, 0, 0, 0.4]; // melody_a
const f2: Features = [1, 0, 0, 0.6, 1.0]; // beep_3k
const f3: Features = [1, 0.5, 0, 1, 0]; // square_520
const D1 = event([seg('melody_a', at(13), 5, 'dismissed', f1)]);
const D2 = event([seg('beep_3k', at(14), 30, 'next', f2), seg('square_520', at(14), 8, 'dismissed', f3, 2)]);
const D3 = event([seg('beep_3k', at(15), 30, 'next', f2), seg('square_520', at(15), 8, 'dismissed', f3, 2)]);
const D = [D1, D2, D3];

describe('stageRewards (규칙 4)', () => {
  it('D1: 5초에 끔 0.8033', () => {
    expect(stageRewards(D1, base).map((r) => r.reward)[0]).toBeCloseTo(0.8033, 4);
  });
  it('D2: next 0, 8초에 끈 2단계 0.7247 (grace 5초보다 늦음)', () => {
    const r = stageRewards(D2, base).map((x) => x.reward);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.7247, 4);
  });
  it('grace: 2단계 시작 3초 뒤 끔 → 1단계 0.5249, 2단계는 빠짐', () => {
    const e = event([seg('beep_3k', at(14), 30, 'next', f2), seg('square_520', at(14), 3, 'dismissed', f3, 2)]);
    const r = stageRewards(e, base);
    expect(r).toHaveLength(1);
    expect(r[0].reward).toBeCloseTo(0.5249, 4);
  });
  it('recheck no_response: 끈 구간 보상 0.2', () => {
    expect(stageRewards({ ...D1, recheck: 'no_response' }, base)[0].reward).toBe(0.2);
  });
  it('dismissed false: 모든 구간 0', () => {
    expect(stageRewards({ ...D2, dismissed: false }, base).map((r) => r.reward)).toEqual([0, 0]);
  });
  it('snoozed는 reward.snoozed, safety·features null은 빠진다', () => {
    const e = event([seg('melody_a', at(13), 20, 'snoozed', f1), seg(null, at(13), 60, 'gave_up', null, 'safety')]);
    const r = stageRewards(e, base);
    expect(r).toHaveLength(1);
    expect(r[0].reward).toBe(0.3);
  });
});

describe('fitBandit (규칙 5)', () => {
  it('D: mean [0.3639, 0.3104, -0.5, 0.1972, -0.2664], n 5', () => {
    const m = fitBandit(D, base, NOW);
    ['0.3639', '0.3104', '-0.5000', '0.1972', '-0.2664'].forEach((v, i) => expect(m.mean[i]).toBeCloseTo(Number(v), 4));
    expect(m.n).toBe(5);
  });
  it('이벤트 없음: mean은 사전값, n 0', () => {
    const m = fitBandit([], base, NOW);
    base.bandit.priorMean.forEach((v, i) => expect(m.mean[i]).toBeCloseTo(v, 9));
    expect(m.n).toBe(0);
  });
  it('now 뒤 이벤트는 학습에서 뺀다', () => {
    expect(fitBandit(D, base, '2026-11-13T00:00:00+09:00').n).toBe(0);
  });
});

describe('planAlarm 3단계 고르기 (8절 나)', () => {
  it('이벤트 A: nature_a(0.3) → beep_3k(0.389) → melody_a(0.5), fallback contrast', () => {
    const p = plan(A);
    expect(ids(p)).toEqual(['nature_a', 'beep_3k', 'melody_a']);
    expect(p.stages.map((s) => s.predicted)).toEqual([
      expect.closeTo(0.3, 4),
      expect.closeTo(0.389, 3),
      expect.closeTo(0.5, 4),
    ]);
    expect(p.fallback).toEqual(['contrast']);
  });
  it('이벤트 없음, recentExclude 0: nature_a → square_520(0.85) → beep_3k(0.8)', () => {
    const p = plan([], { config: { ...base, recentExclude: 0 } });
    expect(ids(p)).toEqual(['nature_a', 'square_520', 'beep_3k']);
    expect(p.stages[1].predicted).toBeCloseTo(0.85, 4);
    expect(p.stages[2].predicted).toBeCloseTo(0.8, 4);
    expect(p.fallback).toEqual(['contrast']);
  });
  it('excluded nature_a: 1단계 melody_a', () => {
    const p = plan(A, { settings: { ...settings, excluded: ['nature_a'] } });
    expect(p.stages[0].soundId).toBe('melody_a');
    expect(ids(p)).not.toContain('nature_a');
  });
  it('harshCap 0.4: beep_3k·square_520은 어떤 단계에도 안 나온다', () => {
    const p = plan(A, { config: { ...base, harshCap: 0.4 } });
    expect(ids(p)).not.toContain('beep_3k');
    expect(ids(p)).not.toContain('square_520');
  });
  it('학습이 고르는 소리를 바꾼다: priorMean을 D의 mean으로 → 1단계 melody_a(0.2573)', () => {
    const mean = fitBandit(D, base, NOW).mean;
    const p = plan([], { config: { ...base, recentExclude: 0, bandit: { ...base.bandit, priorMean: mean } } });
    expect(p.stages[0].soundId).toBe('melody_a');
    expect(p.stages[0].predicted).toBeCloseTo(0.2573, 4);
  });
  it('이유: 학습 구간이 reasonMinN 미만이면 "아직 배우는 중이에요"', () => {
    expect(plan(A).reason).toMatch(/^아직 배우는 중이에요/);
  });
  it('이유: 충분히 학습하면 사전값에서 가장 달라진 특징 문장', () => {
    // D의 mean: 520 닮음 0.5→0.1972(-0.303), 음높이 0→-0.2664(-0.266) → 520 쪽이 더 크게 변함
    expect(plan(D, { config: { ...base, reasonMinN: 5 } }).reason).toBe('520 Hz와 다른 소리에 잘 깨셨어요');
    // 520 닮음 사전값을 D의 값으로 맞추면 음높이가 가장 달라진 특징 → 저음
    const prior = [0.2, 0.3, -0.5, 0.1972, 0] as typeof base.bandit.priorMean;
    const cfg = { ...base, reasonMinN: 5, bandit: { ...base.bandit, priorMean: prior } };
    expect(plan(D, { config: cfg }).reason).toBe('저음에 잘 깨셨어요');
  });
  it('음량: start × 1.25^(단계-1)이 maxVolume을 넘지 않고, 흔들림 ±10% 안', () => {
    const p = plan([], { config: { ...base, recentExclude: 0 } });
    [0.5, 0.625, 0.78125].forEach((v, i) => {
      expect(p.stages[i].volume).toBeGreaterThanOrEqual(Math.min(0.9, v) * 0.9 - 1e-9);
      expect(p.stages[i].volume).toBeLessThanOrEqual(0.9);
    });
  });
});

describe('planAlarm Thompson (8절 라)', () => {
  const th = { ...base, bandit: { ...base.bandit, mode: 'thompson' as const } };
  it('같은 입력·같은 seed는 완전히 같은 AlarmPlan', () => {
    expect(plan(D, { config: th })).toEqual(plan(D, { config: th }));
  });
  it('seed 100개: 규칙(excluded·harshCap·maxVolume)을 지킨다', () => {
    const cfg = { ...th, harshCap: 0.6 };
    const st = { ...settings, excluded: ['nature_a'] };
    for (let i = 0; i < 100; i++) {
      const p = plan(A, { config: cfg, settings: st, seed: `seed-${i}` });
      for (const s of p.stages) {
        expect(s.soundId).not.toBe('nature_a');
        expect(library.sounds.find((x) => x.id === s.soundId)!.harshness).toBeLessThanOrEqual(0.6);
        expect(s.volume).toBeGreaterThanOrEqual(0);
        expect(s.volume).toBeLessThanOrEqual(cfg.maxVolume);
      }
    }
  });
  it('priorVar 1e-9: mean일 때와 같은 세 소리', () => {
    const tight = { ...th, bandit: { ...th.bandit, priorVar: 1e-9 } };
    expect(ids(plan(A, { config: tight }))).toEqual(ids(plan(A)));
  });
  it('seed가 다르면 표본이 달라질 수 있다 (weights가 seed마다 다름)', () => {
    expect(plan(D, { config: th, seed: 'a' }).weights).not.toEqual(plan(D, { config: th, seed: 'b' }).weights);
  });
});

describe('실제 sounds.json (규칙 11·16)', () => {
  const real = loadSoundLibrary();
  it('이웃이 없는 소리가 있어도 planAlarm이 3단계를 만든다 (폴백 포함)', () => {
    const p = planAlarm({ library: real, events: [], settings: { ...settings, chosen: [] }, config: recommendConfig, now: NOW, seed: 'real' });
    expect(p.stages).toHaveLength(3);
    p.stages.forEach((s) => expect(real.sounds.some((x) => x.id === s.soundId)).toBe(true));
  });
  it('소리 50개 × 1024차원, 이벤트 500개에서 200ms 이내 (합성 데이터, 이 기기 기준)', () => {
    let x = 12345;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const sounds = Array.from({ length: 50 }, (_, i) => {
      const v = Array.from({ length: 1024 }, () => rnd() - 0.5);
      const norm = Math.sqrt(v.reduce((s, a) => s + a * a, 0));
      return {
        ...real.sounds[0],
        id: `s${String(i).padStart(2, '0')}`,
        embedding: v.map((a) => a / norm),
        pitch: rnd(),
        harshness: rnd() * 0.8,
        sim520: { emb: rnd(), mel: rnd(), hand: rnd() },
      };
    });
    const lib = { ...real, model: { ...real.model, embeddingDim: 1024 }, sounds };
    const events = Array.from({ length: 500 }, (_, i) =>
      event(
        [seg(sounds[i % 50].id, `2026-11-${String(1 + (i % 15)).padStart(2, '0')}T07:00:00+09:00`, 20, 'dismissed', [1, 0, rnd(), rnd(), rnd()])],
        { eventId: `e${i}` },
      ),
    );
    const t0 = performance.now();
    planAlarm({ library: lib, events, settings: { ...settings, chosen: [] }, config: recommendConfig, now: NOW, seed: 'perf' });
    const ms = performance.now() - t0;
    console.log(`planAlarm 50×1024, 500 events: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(200);
  });
});
