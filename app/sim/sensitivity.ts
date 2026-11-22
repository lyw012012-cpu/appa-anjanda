// I-13 민감도 분석: 반응 모델 계수(모두 [가설])를 흔들어도 "이 모델이 무작위보다 안전장치까지 덜 간다"가 유지되는지 본다.
// simulate.ts의 runOne을 그대로 쓰고 사용자 유형의 계수만 바꾼다. 효과의 증거가 아니라 "특정 계수에만 기대는 결과인가"의 확인.
import type { SoundLibrary } from '@/types/contracts';

import { ARMS, PROFILES, runOne, type Profile } from './simulate';

export interface Scenario {
  id: string;
  label: string;
  tweak: (p: Profile) => Profile;
}

export const SCENARIOS: Scenario[] = [
  { id: 'base', label: '기준(원래 계수)', tweak: (p) => p },
  { id: 'habit05', label: '익숙함 영향 ×0.5', tweak: (p) => ({ ...p, wHabit: p.wHabit * 0.5 }) },
  { id: 'habit2', label: '익숙함 영향 ×2', tweak: (p) => ({ ...p, wHabit: p.wHabit * 2 }) },
  { id: 'w520zero', label: '520 닮음 영향 없음(0)', tweak: (p) => ({ ...p, w520: 0 }) },
  { id: 'w520x2', label: '520 닮음 영향 ×2', tweak: (p) => ({ ...p, w520: p.w520 * 2 }) },
  { id: 'stage05', label: '단계 영향 ×0.5', tweak: (p) => ({ ...p, wStage: p.wStage * 0.5 }) },
  { id: 'baseUp', label: '전반적으로 잘 깸(base +1)', tweak: (p) => ({ ...p, base: p.base + 1 }) },
];

const COMPARE = ['random', 'prior', 'model'] as const;
const arm = (id: string) => ARMS.find((a) => a.id === id)!;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / Math.max(1, a.length - 1));

// t분포 양쪽 95% 임계값(자유도 → 값). 반복 20회면 자유도 19
const T95: Record<number, number> = { 9: 2.262, 19: 2.093, 29: 2.045, 49: 2.01 };

/** 짝지은 차이(같은 반복 = 같은 깨기 난수)의 평균과 95% 구간(t분포) */
function paired(a: number[], b: number[]) {
  const d = a.map((v, i) => v - b[i]);
  const half = (T95[d.length - 1] ?? 1.96) * (sd(d) / Math.sqrt(d.length)); // 반복이 적어 정규(1.96) 대신 t분포
  return { mean: mean(d), lo: mean(d) - half, hi: mean(d) + half };
}

export type Cell = {
  safety: Record<(typeof COMPARE)[number], number>; // 14일 중 안전장치까지 간 비율
  modelMinusRandom: { mean: number; lo: number; hi: number };
  modelMinusPrior: { mean: number; lo: number; hi: number };
};

export function runSensitivity(real: SoundLibrary, reps: number) {
  const out: Record<string, Record<string, Cell>> = {};
  for (const sc of SCENARIOS) {
    out[sc.id] = {};
    for (const p0 of PROFILES) {
      const p = sc.tweak(p0);
      const rate: Record<string, number[]> = {};
      for (const id of COMPARE)
        rate[id] = Array.from({ length: reps }, (_, r) => {
          const days = runOne(p, arm(id), real, r).days;
          return mean(days.map((d) => (d.safety ? 1 : 0)));
        });
      out[sc.id][p0.id] = {
        safety: { random: mean(rate.random), prior: mean(rate.prior), model: mean(rate.model) },
        modelMinusRandom: paired(rate.model, rate.random),
        modelMinusPrior: paired(rate.model, rate.prior),
      };
    }
  }
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pp = (c: { mean: number; lo: number; hi: number }) =>
  `${c.mean >= 0 ? '+' : ''}${Math.round(c.mean * 100)}%p (${Math.round(c.lo * 100)}~${Math.round(c.hi * 100)})`;

/** 결과 표(마크다운). 판정은 "구간 위 끝 < 0"일 때만 '덜 감'으로 센다 */
export function toMarkdown(res: ReturnType<typeof runSensitivity>, reps: number): string {
  const rows: string[] = [];
  let better = 0;
  let total = 0;
  for (const sc of SCENARIOS)
    for (const p of PROFILES) {
      const c = res[sc.id][p.id];
      total++;
      if (c.modelMinusRandom.hi < 0) better++;
      rows.push(
        `| ${sc.label} | ${p.label} | ${pct(c.safety.random)} | ${pct(c.safety.prior)} | ${pct(c.safety.model)} | ${pp(c.modelMinusRandom)} | ${pp(c.modelMinusPrior)} |`,
      );
    }
  return [
    '# 민감도 분석 (반응 모델 계수를 흔들어 보기)',
    '',
    `> 시뮬레이션 가정 안의 결과이고 효과의 증거가 아니다. 반응 모델 계수는 모두 [가설]이다. 14일 × ${reps}회 반복, 같은 반복은 깨기 난수를 비교군끼리 공유(짝지은 차이). 괄호는 95% 구간(t분포, 자유도 ${reps - 1}).`,
    '',
    `**"이 모델이 무작위보다 안전장치까지 덜 간다"(차이 구간의 위 끝 < 0): ${total}칸 중 ${better}칸.**`,
    '',
    '| 시나리오 | 사용자 유형 | 안전장치: 무작위 | 학습 없는 규칙 | 이 모델 | 이 모델 − 무작위 | 이 모델 − 학습 없는 규칙 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
