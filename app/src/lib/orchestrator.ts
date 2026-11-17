// contracts.md C10 연결 순서 (A). 화면과 앱 시작 코드는 이 함수들만 부른다. 몸통은 I-9.
import type { Alarm, OccurrenceRecord, StateAnswer } from '@/types/contracts';

/** 알람 한 번 끝: 저장 → 업로드 시작 → 다음 계획 → 재예약. 끈 경우 화면이 상태 질문을 띄운다 */
export async function handleOutcome(r: OccurrenceRecord): Promise<void> {
  throw new Error('handleOutcome: 아직 구현 안 됨 (I-9)');
}

/** 끈 뒤 "지금 어떠세요?" 답 → 이벤트에 state 붙임 → 재확인 예약 */
export async function recordState(eventId: string, answer: StateAnswer): Promise<void> {
  throw new Error('recordState: 아직 구현 안 됨 (I-9)');
}

/** 재확인 결과 → 이벤트에 recheck 붙임(appendEvent 덮어쓰기). 다음 계획은 다시 하지 않는다 */
export function handleRecheck(eventId: string, result: 'responded' | 'no_response'): void {
  throw new Error('handleRecheck: 아직 구현 안 됨 (I-9)');
}

/** 알람 추가·켜기·시각 변경·설정 변경 시: 계획 → 예약 */
export async function armAlarm(alarm: Alarm): Promise<void> {
  throw new Error('armAlarm: 아직 구현 안 됨 (I-9)');
}

/** 앱 시작 시: reconcile → handleOutcome 반복 → syncPending */
export async function onAppStart(): Promise<void> {
  throw new Error('onAppStart: 아직 구현 안 됨 (I-9)');
}
