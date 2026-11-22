// contracts.md C10 연결 순서 (A). 저장소(C7)와 lib(알람·추천)를 함께 부르므로 stores 계층에 둔다(의존 방향: 화면 → stores → lib).
// 화면과 앱 시작 코드는 이 함수들만 부른다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { alarmConfig, recommendConfig } from '@/config';
import {
  cancelAlarm,
  finishAlarm,
  nextOccurrence,
  reconcile,
  scheduleOccurrence,
  scheduleRecheck,
  toIsoLocal,
} from '@/lib/alarm';
import { planAlarm } from '@/lib/recommend';
import { loadSoundLibrary } from '@/lib/sound-library';
import { useAlarmStore } from '@/stores/alarm-store';
import { appendEvent, eventsHydrated, getEvents, syncPending } from '@/stores/event-store';
import { getSettings } from '@/stores/settings-store';
import type {
  Alarm,
  AlarmEvent,
  AlarmId,
  AlarmPlan,
  Features,
  OccurrenceRecord,
  SoundLibrary,
  StagePlan,
  StateAnswer,
} from '@/types/contracts';

type PendingState = {
  plans: Record<AlarmId, AlarmPlan>; // 다음 울림의 계획(C10 pending)
  recheckEvent: Record<AlarmId, string>; // 재확인을 건 이벤트(재확인 알람이 울리면 찾는다)
  error: string | null; // 화면 오류 띠(C12)
};

export const usePendingStore = create<PendingState>()(
  persist((): PendingState => ({ plans: {}, recheckEvent: {}, error: null }), {
    name: 'appa.pending.v2',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

let library: SoundLibrary | null = null;
export function getLibrary(): SoundLibrary {
  library ??= loadSoundLibrary();
  return library;
}

export const eventIdOf = (alarmId: AlarmId, occurrenceAt: string) => `${alarmId}__${occurrenceAt}`;

const dot = (a: number[], b: number[]) => a.reduce((t, v, i) => t + v * b[i], 0);

// ponytail: planAlarm(I-7, B)이 아직 없을 때만 쓰는 임시 계획. 학습 없이 "최근에 안 쓴 것 · 1단계와 덜 닮은 것"만 본다.
// planAlarm이 구현되면 이 함수는 안 불린다. 추천 규칙(C8)은 여기서 다시 만들지 않는다.
function fallbackPlan(lib: SoundLibrary, seed: string): AlarmPlan {
  const settings = getSettings();
  const recent = new Set(
    getEvents()
      .slice(-recommendConfig.recentExclude)
      .flatMap((e) => e.played.map((p) => p.soundId)),
  );
  const pool = lib.sounds
    .filter((s) => !settings.excluded.includes(s.id) && s.harshness <= recommendConfig.harshCap)
    .sort((a, b) => a.harshness - b.harshness || a.id.localeCompare(b.id));
  const fresh = pool.filter((s) => !recent.has(s.id));
  const first =
    fresh.find((s) => settings.chosen.includes(s.id)) ?? fresh.find((s) => s.harshness <= recommendConfig.comfortCap) ?? fresh[0] ?? pool[0];
  const rest = (fresh.length > 2 ? fresh : pool).filter((s) => s.id !== first.id);
  const byContrast = [...rest].sort((a, b) => dot(a.embedding, first.embedding) - dot(b.embedding, first.embedding));
  const second = byContrast[0];
  const third = byContrast.find((s) => s.id !== second.id && s.group !== first.group && s.group !== second.group) ?? byContrast[1];
  const stage = (n: 1 | 2 | 3, s: (typeof pool)[number]): StagePlan => {
    const features: Features = [1, (n - 1) / 2, 0, s.sim520[recommendConfig.sim520Method], s.pitch];
    const volume = Math.min(
      recommendConfig.maxVolume,
      settings.startVolume * (1 + recommendConfig.volumeStep) ** (n - 1),
    );
    return { stage: n, soundId: s.id, volume, features, predicted: 0 };
  };
  return {
    stages: [stage(1, first), stage(2, second), stage(3, third)],
    weights: [0, 0, 0, 0, 0],
    reason: '추천 모듈 준비 중: 최근에 안 쓴 소리와 1단계와 다른 소리로 골랐어요',
    fallback: [],
    seed,
    configVersion: recommendConfig.configVersion,
  };
}

function makePlan(alarm: Alarm, at: string): AlarmPlan {
  const lib = getLibrary();
  const seed = eventIdOf(alarm.id, at);
  try {
    return planAlarm({
      library: lib,
      events: getEvents(),
      settings: getSettings(),
      config: recommendConfig,
      now: toIsoLocal(Date.now()),
      seed,
    });
  } catch {
    return fallbackPlan(lib, seed);
  }
}

/** 울리는 알람의 계획. 예약 때 만든 계획이 없으면(옛 테스트 알람) 지금 만든다 */
export function planForRinging(alarmId: AlarmId): AlarmPlan {
  return (
    usePendingStore.getState().plans[alarmId] ??
    makePlan({ id: alarmId, time: '00:00', enabled: true }, toIsoLocal(Date.now()))
  );
}

/** 알람 한 번 끝: 저장 → 업로드 시작 → 다음 계획 → 재예약. 끈 경우 화면이 상태 질문을 띄운다 */
export async function handleOutcome(r: OccurrenceRecord): Promise<void> {
  const plan = usePendingStore.getState().plans[r.alarmId] ?? null;
  const event: AlarmEvent = {
    ...r,
    played: r.played.map((p) => ({
      ...p,
      features: p.stage === 'safety' ? null : (plan?.stages[p.stage - 1].features ?? null),
    })),
    schemaVersion: 2,
    eventId: eventIdOf(r.alarmId, r.occurrenceAt),
    plan,
    state: null,
    recheck: 'none',
    appVersion: '1.0.0',
  };
  appendEvent(event);
  void syncPending();
  const alarm = useAlarmStore.getState().alarms.find((a) => a.id === r.alarmId);
  if (alarm?.enabled) await armAlarm(alarm);
}

/** 끈 뒤 "지금 어떠세요?" 답 → 이벤트에 state 붙임 → 재확인 예약(울림도 여기서 끝낸다) */
export async function recordState(eventId: string, answer: StateAnswer): Promise<void> {
  const e = getEvents().find((x) => x.eventId === eventId);
  const afterMin =
    answer === 'awake' ? null : answer === 'sleepy' ? alarmConfig.recheckSleepyMin : alarmConfig.recheckWakingMin;
  if (afterMin === null) await finishAlarm(null);
  else {
    await scheduleRecheck(eventId, afterMin, answer === 'sleepy');
    if (e) usePendingStore.setState((s) => ({ recheckEvent: { ...s.recheckEvent, [e.alarmId]: eventId } }));
  }
  if (e) appendEvent({ ...e, state: answer, recheck: afterMin === null ? 'none' : 'pending' });
  void syncPending();
}

/** 재확인 결과 → 이벤트에 recheck 붙임(appendEvent 덮어쓰기). 다음 계획은 다시 하지 않는다 */
export function handleRecheck(eventId: string, result: 'responded' | 'no_response'): void {
  const e = getEvents().find((x) => x.eventId === eventId);
  if (!e) return;
  appendEvent({ ...e, recheck: result });
  usePendingStore.setState((s) => {
    const { [e.alarmId]: _, ...rest } = s.recheckEvent;
    return { recheckEvent: rest };
  });
  void syncPending();
}

/** 알람 추가·켜기·시각 변경·설정 변경 시: 계획 → 예약 */
export async function armAlarm(alarm: Alarm): Promise<void> {
  if (!alarm.enabled) {
    await cancelAlarm(alarm.id);
    usePendingStore.setState((s) => {
      const { [alarm.id]: _, ...plans } = s.plans;
      return { plans };
    });
    return;
  }
  const at = nextOccurrence(alarm.time, toIsoLocal(Date.now()));
  const plan = makePlan(alarm, at);
  try {
    await scheduleOccurrence(alarm, plan, at);
    usePendingStore.setState((s) => ({ plans: { ...s.plans, [alarm.id]: plan }, error: null }));
  } catch (e) {
    usePendingStore.setState({ error: `알람 예약 실패: ${String(e)}` });
  }
}

/** 앱 시작 시: reconcile → handleOutcome 반복 → syncPending */
export async function onAppStart(): Promise<void> {
  await eventsHydrated();
  for (const r of await reconcile(toIsoLocal(Date.now()))) await handleOutcome(r);
  await syncPending();
}
