// I-13 민감도 분석을 돌려 out/sensitivity.md에 쓴다. 결론을 단정하는 검사는 두지 않는다(돌고 값이 범위 안인지만).
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { loadSoundLibrary } from '@/lib/sound-library';

import { PROFILES } from './simulate';
import { runSensitivity, SCENARIOS, toMarkdown } from './sensitivity';

const REPS = 20;

describe('sensitivity (I-13)', () => {
  it('시나리오마다 끝까지 돌고 out/sensitivity.md에 쓴다', () => {
    const res = runSensitivity(loadSoundLibrary(), REPS);
    for (const sc of SCENARIOS)
      for (const p of PROFILES) {
        const c = res[sc.id][p.id];
        for (const v of Object.values(c.safety)) expect(v >= 0 && v <= 1).toBe(true);
      }
    const dir = join(__dirname, 'out');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sensitivity.md'), toMarkdown(res, REPS));
  }, 600_000);
});
