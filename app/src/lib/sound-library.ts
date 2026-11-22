// contracts.md C8 로더 (B). 순수 함수(M2). 검사 규칙은 C2 표 하나뿐이다.
import { soundAssets } from '@/data/sound-assets';
import soundsJson from '@/data/sounds.json';
import type { SoundLibrary } from '@/types/contracts';

const GROUPS = ['bell', 'melody', 'beep', 'nature', 'voice', 'other'];
const SPACES = ['yamnet', 'logmel', 'hand'];
const ID_RULE = /^[a-z][a-z0-9_]{0,31}$/; // 1절 소리 ID
const ISO_RULE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/; // 1절 시각(초까지, 오프셋 포함)
const NORM_TOL = 1e-3;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;

/** C2·C3 규칙 검사. 어기면 어느 규칙을 어긴 어느 id인지 적은 Error. 첫 위반에서 멈춘다 */
export function parseSoundLibrary(raw: unknown, assetIds: Iterable<string>): SoundLibrary {
  const fail = (where: string, rule: string): never => {
    throw new Error(`sounds.json ${where}: ${rule}`);
  };
  if (!isObj(raw)) return fail('(루트)', '객체가 아님');
  if (raw.schemaVersion !== 2) fail('schemaVersion', `2여야 함 (값 ${String(raw.schemaVersion)})`);
  if (typeof raw.generatedAt !== 'string' || !ISO_RULE.test(raw.generatedAt))
    fail('generatedAt', '초까지, 오프셋 포함 ISO 8601이어야 함');

  const model = raw.model;
  if (!isObj(model)) return fail('model', '객체가 아님');
  if (!SPACES.includes(model.space as string)) fail('model.space', `${SPACES.join('·')} 중 하나여야 함`);
  const dim = model.embeddingDim;
  if (!isNum(dim) || !Number.isInteger(dim) || dim < 1) return fail('model.embeddingDim', '1 이상 정수여야 함');
  if (!isNum(model.simMedian) || model.simMedian < 0 || model.simMedian >= 1)
    fail('model.simMedian', `0 이상 1 미만이어야 함 (값 ${String(model.simMedian)})`);

  const sounds = raw.sounds;
  if (!Array.isArray(sounds) || sounds.length < 1) return fail('sounds', '1개 이상이어야 함');
  const assets = new Set(assetIds);
  let prevId = '';
  for (const s of sounds) {
    if (!isObj(s) || typeof s.id !== 'string') return fail('sounds[]', 'id가 없는 항목');
    const id = s.id;
    const at = (field: string) => `sounds[${id}].${field}`;
    if (!ID_RULE.test(id)) fail(`sounds[${id}].id`, '소문자·숫자·밑줄, 소문자로 시작, 32자 이하여야 함');
    if (id === prevId) fail(`sounds[${id}].id`, '중복');
    if (id < prevId) fail(`sounds[${id}].id`, `오름차순 정렬이 아님 (앞 id ${prevId})`);
    prevId = id;

    if (typeof s.file !== 'string' || !s.file.startsWith(`${id}.`)) fail(at('file'), `"${id}.<확장자>"여야 함`);
    if (!assets.has(id)) fail(at('id'), 'soundAssets(sound-assets.ts)에 없음');
    for (const f of ['title', 'license', 'sourceUrl'] as const)
      if (typeof s[f] !== 'string') fail(at(f), '문자열이 아님');
    if (!GROUPS.includes(s.group as string)) fail(at('group'), `${GROUPS.join('·')} 중 하나여야 함`);
    if (typeof s.groupRep !== 'boolean') fail(at('groupRep'), 'boolean이 아님');
    if (!isNum(s.durationSec) || s.durationSec <= 0) fail(at('durationSec'), '0보다 커야 함');
    if (!Array.isArray(s.top3) || s.top3.some((t) => typeof t !== 'string')) fail(at('top3'), '문자열 배열이 아님');
    if (!isUnit(s.pitch)) fail(at('pitch'), `0~1이어야 함 (값 ${String(s.pitch)})`);
    if (!isUnit(s.harshness)) fail(at('harshness'), `0~1이어야 함 (값 ${String(s.harshness)})`);

    const sim = s.sim520;
    if (!isObj(sim)) return fail(at('sim520'), '객체가 아님');
    for (const m of ['emb', 'mel', 'hand'])
      if (!isUnit(sim[m])) fail(at(`sim520.${m}`), `0~1이어야 함 (값 ${String(sim[m])})`);

    const e = s.embedding;
    if (!Array.isArray(e) || e.length !== dim) return fail(at('embedding'), `길이가 embeddingDim(${dim})과 다름`);
    if (e.some((x) => !isNum(x))) fail(at('embedding'), '숫자가 아닌 값이 있음');
    const norm = Math.sqrt((e as number[]).reduce((a, x) => a + x * x, 0));
    if (Math.abs(norm - 1) > NORM_TOL) fail(at('embedding'), `L2 노름이 1 ± 1e-3이 아님 (값 ${norm.toFixed(4)})`);
  }
  return raw as unknown as SoundLibrary;
}

/** sounds.json + soundAssets를 읽어 검사. 앱 시작 시 한 번 부른다 */
export function loadSoundLibrary(): SoundLibrary {
  return parseSoundLibrary(soundsJson, Object.keys(soundAssets));
}
