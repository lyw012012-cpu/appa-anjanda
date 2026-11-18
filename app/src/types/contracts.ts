// contracts.md C4를 그대로 옮긴 공유 타입. 고치려면 계약 PR부터(contracts 9절).

export type SoundId = string; // 1절 규칙
export type AlarmId = string; // 1절 규칙
export type IsoTime = string; // 1절 규칙
export type SoundGroup = 'bell' | 'melody' | 'beep' | 'nature' | 'voice' | 'other';
export type Sim520Method = 'emb' | 'mel' | 'hand';
export type SimSpace = 'yamnet' | 'logmel' | 'hand';
export type Stage = 1 | 2 | 3;

export interface Sound {
  id: SoundId;
  file: string;
  title: string;
  group: SoundGroup;
  groupRep: boolean;
  license: string;
  sourceUrl: string;
  durationSec: number;
  embedding: number[];
  sim520: Record<Sim520Method, number>;
  pitch: number; // 0 낮음 ~ 1 높음, 100~4000 Hz 로그 눈금 고정. 모르면 0.5
  harshness: number; // 0~1, 거슬림 추정(차임 0 · 버저 1 고정 기준)
  top3: string[];
}

export interface SoundLibrary {
  schemaVersion: 2;
  generatedAt: IsoTime;
  model: { space: SimSpace; embeddingDim: number; simMedian: number };
  sounds: Sound[];
}

export interface Alarm {
  id: AlarmId;
  time: string; // 'HH:mm', 매일 반복
  enabled: boolean;
}

/** 처음 설정과 "이 소리 빼기". C7 저장소에 둔다 */
export interface UserSettings {
  chosen: SoundId[]; // 처음 설정에서 고른 소리(0개 가능)
  excluded: SoundId[]; // "이 소리 빼기"
  startVolume: number; // 0~1, "이 크기면 깰 것 같나요?"로 정함
  gentleMode: boolean; // 대비 폭 축소, 재확인은 진동만 (MVP 밖이면 항상 false)
}

/** 밴딧 입력. [상수 1, 단계 위치 (stage−1)/2, pHabit, sim520, pitch] 순서 고정 */
export type Features = [number, number, number, number, number];

/** 한 단계의 계획 */
export interface StagePlan {
  stage: Stage;
  soundId: SoundId;
  volume: number; // 0~1
  features: Features; // 고를 때의 x(c, stage)
  predicted: number; // θ̃ · x, 이유 화면·분석용
}

export type PlanFallback = 'recent' | 'contrast' | 'habituated';

/** 알람 한 번의 계획 = 3단계 순서 + 이유 */
export interface AlarmPlan {
  stages: [StagePlan, StagePlan, StagePlan];
  weights: [number, number, number, number, number]; // 1·2단계에 쓴 θ̃ (3단계는 평균 μ로 고름)
  reason: string; // 이유 한 줄(C8 규칙 11)
  fallback: PlanFallback[]; // 조건을 푼 순서대로. 없으면 []
  seed: string;
  configVersion: number;
}

/** 실제로 재생된 구간 하나. 스누즈 뒤 같은 단계가 다시 나올 수 있다 */
export interface PlayedStage {
  stage: Stage | 'safety';
  soundId: SoundId | null; // safety는 라이브러리 기본음이라 null
  volume: number;
  startedAt: IsoTime;
  playedSec: number; // 이 구간에서 실제로 울린 시간
  end: 'next' | 'dismissed' | 'snoozed' | 'gave_up'; // next: 단계 시간이 끝나 다음으로, gave_up: 안전장치까지 끝남
  features: Features | null; // StagePlan에서 복사. safety는 null
}

export type StateAnswer = 'sleepy' | 'waking' | 'awake' | null; // 😴 🚶 ☀️, 무응답 null
export type RecheckResult = 'none' | 'pending' | 'responded' | 'no_response';

/** 알람 한 번(occurrence)의 기록. C5가 만들고 C10이 상태 질문·재확인을 채운다 */
export interface OccurrenceRecord {
  alarmId: AlarmId;
  occurrenceAt: IsoTime; // 예약된 시각(스누즈로 다시 울려도 처음 값 유지)
  endedAt: IsoTime;
  played: PlayedStage[]; // 재생 순서대로
  snoozeCount: number;
  dismissed: boolean; // 끝까지 못 끄면 false
  backfilled: boolean; // 앱이 꺼져 있어 나중에 소급 판정했나
}

export interface AlarmEvent extends OccurrenceRecord {
  schemaVersion: 2;
  eventId: string; // 1절 규칙
  plan: AlarmPlan | null; // 계획 없이 울린 경우 null
  state: StateAnswer;
  recheck: RecheckResult;
  appVersion: string; // app.json version
}

export interface SoundStat {
  soundId: SoundId;
  plays: number; // 이 소리가 재생된 구간 수
  habitStrength: number; // H, design.md 4.2
  pHabit: number; // 1 − exp(−H)
  habituated: boolean; // pHabit ≥ habituatedAt
  lastPlayedAt: IsoTime | null;
}

/** 사람별 학습 결과. 저장하지 않고 매번 기록에서 계산 */
export interface BanditModel {
  mean: [number, number, number, number, number]; // μ
  cov: number[][]; // Σ, 5×5
  n: number; // 학습에 쓴 구간 수
}
