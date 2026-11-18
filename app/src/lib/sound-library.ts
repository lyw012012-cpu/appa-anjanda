// contracts.md C8 로더 (B). 순수 함수(M2). 검사 규칙은 C2 표 하나뿐이다.
import type { SoundLibrary } from '@/types/contracts';

/** sounds.json + soundAssets를 읽고 C2·C3 규칙 검사. 어기면 어느 규칙을 어긴 어느 id인지 적은 Error */
export function loadSoundLibrary(): SoundLibrary {
  throw new Error('loadSoundLibrary: 아직 구현 안 됨 (I-5). 그전에는 data/sounds.fixture.json을 쓴다');
}
