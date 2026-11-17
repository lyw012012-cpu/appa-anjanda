// contracts.md C7 이벤트 저장소 (A). Zustand persist, 키 'appa.events.v2'. 몸통은 I-4.
// 업로드 여부는 저장소 안 syncedIds로만 관리하고 AlarmEvent에 넣지 않는다(C7).
import type { AlarmEvent } from '@/types/contracts';

/** 같은 eventId면 덮어쓴다(멱등). 덮어쓰면 그 ID를 syncedIds에서 빼서 다시 올린다 */
export function appendEvent(e: AlarmEvent): void {
  throw new Error('appendEvent: 아직 구현 안 됨 (I-4)');
}

/** occurrenceAt 오름차순. 반환 배열을 고치지 않는다 */
export function getEvents(): readonly AlarmEvent[] {
  throw new Error('getEvents: 아직 구현 안 됨 (I-4)');
}

/** 아직 안 올린 이벤트를 Firestore에 올린다(C11). 실패해도 던지지 않는다 */
export async function syncPending(): Promise<{ synced: number; failed: number }> {
  throw new Error('syncPending: 아직 구현 안 됨 (I-4)');
}

/** 시연용 초기화(개발 메뉴). 기기 기록만 지운다 */
export function clearEvents(): void {
  throw new Error('clearEvents: 아직 구현 안 됨 (I-4)');
}
