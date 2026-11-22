// contracts.md C7 이벤트 저장소 (A). Zustand persist, 키 'appa.events.v2'.
// 업로드 여부는 저장소 안 syncedIds로만 관리하고 AlarmEvent에 넣지 않는다(C7).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isFirebaseConfigured, uploadEvent } from '@/lib/firebase';
import type { AlarmEvent } from '@/types/contracts';

type EventState = { events: AlarmEvent[]; syncedIds: string[] };

export const useEventStore = create<EventState>()(
  persist((): EventState => ({ events: [], syncedIds: [] }), {
    name: 'appa.events.v2',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** 기기 기록을 다 읽을 때까지 기다린다. 앱 시작(onAppStart)에서 getEvents 전에 부른다 */
export function eventsHydrated(): Promise<void> {
  if (useEventStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = useEventStore.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

/** 같은 eventId면 덮어쓴다(멱등). 덮어쓰면 그 ID를 syncedIds에서 빼서 다시 올린다 */
export function appendEvent(e: AlarmEvent): void {
  useEventStore.setState((s) => ({
    events: [...s.events.filter((x) => x.eventId !== e.eventId), e].sort(
      (a, b) => Date.parse(a.occurrenceAt) - Date.parse(b.occurrenceAt),
    ),
    syncedIds: s.syncedIds.filter((id) => id !== e.eventId),
  }));
}

/** occurrenceAt 오름차순. 반환 배열을 고치지 않는다 */
export function getEvents(): readonly AlarmEvent[] {
  return useEventStore.getState().events;
}

/** 아직 안 올린 이벤트를 Firestore에 올린다(C11). 실패해도 던지지 않는다 */
let running: Promise<{ synced: number; failed: number }> | null = null;
let again = false;

/** 겹쳐 불러도 업로드는 하나만 돈다. 도는 중에 부르면 끝난 뒤 한 번 더 돌아 그 사이 바뀐 기록도 올린다 */
export function syncPending(): Promise<{ synced: number; failed: number }> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let r = { synced: 0, failed: 0 };
    do {
      again = false;
      r = await uploadOnce();
    } while (again);
    return r;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function uploadOnce(): Promise<{ synced: number; failed: number }> {
  if (!isFirebaseConfigured) return { synced: 0, failed: 0 }; // .env 없음: 기기 기록만(C11)
  const { events, syncedIds } = useEventStore.getState();
  const todo = events.filter((e) => !syncedIds.includes(e.eventId));
  let synced = 0;
  for (const e of todo) {
    try {
      await uploadEvent(e.eventId, e as unknown as Record<string, unknown>);
      // 올리는 사이 같은 eventId가 덮어써졌으면 새 내용이 아직 안 올라갔으니 표시하지 않는다
      if (getEvents().find((x) => x.eventId === e.eventId) === e)
        useEventStore.setState((s) => (s.syncedIds.includes(e.eventId) ? s : { syncedIds: [...s.syncedIds, e.eventId] }));
      synced++;
    } catch {
      // 다음 실행 때 다시
    }
  }
  return { synced, failed: todo.length - synced };
}

/** 시연용 초기화(개발 메뉴). 기기 기록만 지운다 */
export function clearEvents(): void {
  useEventStore.setState({ events: [], syncedIds: [] });
}
