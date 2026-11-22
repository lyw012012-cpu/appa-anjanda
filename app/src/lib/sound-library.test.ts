// contracts.md C2·C3: 소리 목록 로더 검사. 가짜 소리 4개(fixture)를 하나씩 망가뜨려 규칙마다 확인한다.
import fixture from '@/data/sounds.fixture.json';
import { loadSoundLibrary, parseSoundLibrary } from '@/lib/sound-library';

const clone = () => JSON.parse(JSON.stringify(fixture));
const ids = (lib: { sounds: { id: string }[] }) => lib.sounds.map((s) => s.id);

describe('parseSoundLibrary (C2·C3)', () => {
  it('fixture는 통과', () => {
    const lib = clone();
    expect(parseSoundLibrary(lib, ids(lib)).sounds.length).toBe(lib.sounds.length);
  });

  it('진짜 sounds.json(파이프라인 산출물)은 통과', () => {
    expect(loadSoundLibrary().sounds.length).toBeGreaterThanOrEqual(1);
  });

  const cases: [string, (l: any) => void, RegExp][] = [
    ['schemaVersion', (l) => (l.schemaVersion = 1), /schemaVersion/],
    ['simMedian 1', (l) => (l.model.simMedian = 1), /simMedian/],
    ['embedding 길이', (l) => l.sounds[1].embedding.push(0), /sounds\[melody_a\]\.embedding.*길이/],
    ['L2 노름', (l) => (l.sounds[0].embedding = [1, 1, 0, 0]), /sounds\[beep_3k\]\.embedding.*노름/],
    ['pitch 범위', (l) => (l.sounds[2].pitch = 1.2), /sounds\[nature_a\]\.pitch/],
    ['sim520 범위', (l) => (l.sounds[0].sim520.hand = -0.1), /sounds\[beep_3k\]\.sim520\.hand/],
    ['id 중복', (l) => (l.sounds[1].id = l.sounds[0].id), /중복/],
    ['id 정렬', (l) => l.sounds.reverse(), /정렬/],
    ['id 형식', (l) => (l.sounds[0].id = 'Bad-id'), /sounds\[Bad-id\]\.id/],
    ['file 이름', (l) => (l.sounds[0].file = 'other.mp3'), /sounds\[beep_3k\]\.file/],
    ['group', (l) => (l.sounds[0].group = 'rock'), /sounds\[beep_3k\]\.group/],
  ];
  it.each(cases)('위반: %s', (_name, mutate, message) => {
    const lib = clone();
    mutate(lib);
    expect(() => parseSoundLibrary(lib, ids(lib).concat(['Bad-id']))).toThrow(message);
  });

  it('자산 목록에 없는 id', () => {
    const lib = clone();
    expect(() => parseSoundLibrary(lib, ids(lib).slice(1))).toThrow(/sounds\[beep_3k\]\.id.*soundAssets/);
  });
});
