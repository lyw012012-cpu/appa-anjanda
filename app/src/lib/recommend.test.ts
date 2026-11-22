// contracts.md 8절 "가. 습관화": 가짜 소리 4개에 대한 기대 결과가 곧 C8 계약 테스트다.
import { recommendConfig } from '@/config';
import fixture from '@/data/sounds.fixture.json';
import { computeStats } from '@/lib/recommend';
import type { AlarmEvent, PlayedStage, SoundLibrary } from '@/types/contracts';

const library = fixture as unknown as SoundLibrary;
const config = { ...recommendConfig, recentExclude: 1 };
const NOW = '2026-11-16T07:00:00+09:00';

const seg = (soundId: string | null, startedAt: string, playedSec: number): PlayedStage => ({
  stage: soundId === null ? 'safety' : 1,
  soundId,
  volume: 0.5,
  startedAt,
  playedSec,
  end: 'dismissed',
  features: null, // 습관화 테스트는 학습(features)을 쓰지 않는다
});

const event = (...played: PlayedStage[]): AlarmEvent => ({
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
});

const at = (day: number) => `2026-11-${day}T07:00:00+09:00`;
const p = (stats: ReturnType<typeof computeStats>, id: string) => stats[id].pHabit;

describe('computeStats (contracts 8절 가)', () => {
  // A: square_520을 11-14·15에 구간마다 60초(노출 2)
  const A = [event(seg('square_520', at(14), 60)), event(seg('square_520', at(15), 60))];

  it('A: 노출 + 일반화(한 번도 안 울린 beep_3k도 익숙해짐)', () => {
    const s = computeStats(library, A, config, NOW);
    expect(p(s, 'square_520')).toBeCloseTo(0.7077, 4);
    expect(p(s, 'beep_3k')).toBeCloseTo(0.5219, 4);
    expect(s.beep_3k.habituated).toBe(true);
    expect(s.beep_3k.plays).toBe(0);
    expect(p(s, 'melody_a')).toBe(0);
    expect(p(s, 'nature_a')).toBe(0);
  });

  it('A, 2주 뒤: 회복', () => {
    const s = computeStats(library, A, config, '2026-11-30T07:00:00+09:00');
    expect(p(s, 'square_520')).toBeCloseTo(0.0115, 4);
    expect(s.square_520.habituated).toBe(false);
  });

  it('B: 구간마다 30초(노출 1)로는 익숙해짐이 아님', () => {
    const B = [event(seg('square_520', at(14), 30)), event(seg('square_520', at(15), 30))];
    const s = computeStats(library, B, config, NOW);
    expect(p(s, 'square_520')).toBeCloseTo(0.4593, 4);
    expect(s.square_520.habituated).toBe(false);
    expect(p(s, 'beep_3k')).toBeCloseTo(0.3086, 4);
  });

  it('C: 3일 반복 노출이면 익숙해짐', () => {
    const C = [13, 14, 15].map((d) => event(seg('square_520', at(d), 30)));
    const s = computeStats(library, C, config, NOW);
    expect(p(s, 'square_520')).toBeCloseTo(0.5502, 4);
    expect(s.square_520.habituated).toBe(true);
    expect(p(s, 'beep_3k')).toBeCloseTo(0.3808, 4);
  });

  it('이벤트가 없어도 모든 소리가 plays 0으로 들어 있다', () => {
    const s = computeStats(library, [], config, NOW);
    expect(Object.keys(s).sort()).toEqual(['beep_3k', 'melody_a', 'nature_a', 'square_520']);
    expect(s.square_520).toMatchObject({ plays: 0, habitStrength: 0, pHabit: 0, habituated: false, lastPlayedAt: null });
  });

  it('now보다 뒤 구간은 무시한다', () => {
    const future = [event(seg('square_520', '2026-11-17T07:00:00+09:00', 60))];
    const s = computeStats(library, [...A, ...future], config, NOW);
    expect(p(s, 'square_520')).toBeCloseTo(0.7077, 4); // A만 있을 때와 같다
    expect(s.square_520.plays).toBe(2);
  });

  it('plays와 lastPlayedAt은 가장 최근 구간을 가리킨다', () => {
    const s = computeStats(library, A, config, NOW);
    expect(s.square_520.plays).toBe(2);
    expect(s.square_520.lastPlayedAt).toBe(at(15));
  });

  it('safety 구간(soundId null)과 목록에 없는 소리는 무시한다', () => {
    const s = computeStats(library, [event(seg(null, at(15), 60), seg('deleted_sound', at(15), 60))], config, NOW);
    expect(Object.values(s).every((x) => x.plays === 0 && x.pHabit === 0)).toBe(true);
  });

  it("simNormalize 'none'이면 영점을 빼지 않는다 (simMedian 0.58에서 beep_3k가 더 익숙해진다)", () => {
    const lib = { ...library, model: { ...library.model, simMedian: 0.58 } };
    const med = computeStats(lib, A, config, NOW);
    const none = computeStats(lib, A, { ...config, simNormalize: 'none' }, NOW);
    expect(p(none, 'beep_3k')).toBeGreaterThan(p(med, 'beep_3k'));
    expect(p(none, 'beep_3k')).toBeCloseTo(0.5219, 4); // cos 0.6 그대로
  });
});
