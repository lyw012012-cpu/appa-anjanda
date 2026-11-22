// I-13: 시뮬레이션을 돌려 결과 파일(out/results.json)을 쓴다. 그림은 plot.py가 이 파일만 읽어 그린다.
// 결론을 단정하는 검사는 두지 않는다(코드가 도는지·결정적인지만 확인). 결론은 결과 파일을 보고 적는다.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { loadSoundLibrary } from '@/lib/sound-library';

import { ARMS, DAYS, PROFILES, runAll, runOne } from './simulate';

const real = loadSoundLibrary();

describe('simulate (I-13)', () => {
  it('같은 입력이면 같은 결과 (결정적)', () => {
    const a = runOne(PROFILES[0], ARMS[2], real, 0);
    const b = runOne(PROFILES[0], ARMS[2], real, 0);
    expect(b).toEqual(a);
    expect(a.days).toHaveLength(DAYS);
  });

  it('모든 비교군이 끝까지 돌고 값이 정상 범위', () => {
    for (const arm of ARMS) {
      const { days } = runOne(PROFILES[3], arm, real, 1);
      for (const d of days) {
        expect(d.wakeStage).toBeGreaterThanOrEqual(1);
        expect(d.wakeStage).toBeLessThanOrEqual(4);
        expect(Number.isFinite(d.cos)).toBe(true);
      }
    }
  });

  it('14일 × 20회 반복을 돌려 out/results.json에 쓴다', () => {
    const result = runAll(real, 20);
    const dir = join(__dirname, 'out');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'results.json'), JSON.stringify(result, null, 1));
    expect(Object.keys(result.users)).toHaveLength(PROFILES.length);
  });
});
