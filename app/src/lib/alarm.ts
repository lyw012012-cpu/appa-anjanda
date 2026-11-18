import AlarmScheduler, { type AlarmPermissionResponse } from 'react-native-alarm-scheduler';
import type { Alarm, AlarmId, AlarmPlan, IsoTime, OccurrenceRecord } from '@/types/contracts';

// 프로토타입(I-1) 알람 래퍼. 화면은 라이브러리를 직접 부르지 않고 여기를 거친다.
// 기본 알람음(시스템 알람 소리, 알람 볼륨)이 안전장치이고, 앱은 hold로 그걸 잠시 끄고 자기 소리를 튼다.

export type Permissions = AlarmPermissionResponse;

export function getPermissions(): Promise<Permissions> {
  return AlarmScheduler.getPermissionsAsync();
}

export async function requestPermissions(): Promise<Permissions> {
  const p = await AlarmScheduler.requestPermissionsAsync();
  if (!p.canScheduleExactAlarms) await AlarmScheduler.openAlarmSettingsAsync();
  else if (p.canUseFullScreenIntent === false) await AlarmScheduler.openFullScreenIntentSettingsAsync();
  return p;
}

/** 지금부터 seconds 뒤 한 번 울리는 알람. 앱이 complete할 때까지 멈추지 않는다. */
export async function scheduleTestAlarm(seconds: number): Promise<string> {
  const at = new Date(Date.now() + seconds * 1000);
  const alarm = await AlarmScheduler.scheduleAlarmAsync({
    hour: at.getHours(),
    minute: at.getMinutes(),
    timestamp: at.getTime(),
    title: '아빠 안잔다',
    android: {
      alertActionMode: 'openAppOnly',
      fullScreenTarget: 'app', // 잠금 화면 위로 우리 알람 화면을 바로 띄운다(plugins/with-show-when-locked)
      secondaryButtonTitle: '알람 열기',
      maxRingDurationSeconds: 0,
    },
  });
  return alarm.id;
}

/** 앱이 열릴 때 지금 울리는 알람이 있으면 그 ID. 처리했다고 표시도 한다. */
export async function takeRingingAlarmId(): Promise<string | null> {
  const handoff = await AlarmScheduler.getPendingNativeAlarmHandoffAsync();
  const context = handoff ? null : await AlarmScheduler.getCurrentAlarmContextAsync();
  const id = handoff?.alarmId ?? context?.id ?? null;
  if (id) await AlarmScheduler.clearPendingNativeAlarmHandoffAsync();
  return id;
}

/** 기본 알람음을 seconds 동안 끈다. 다시 부르면 연장. 앱이 죽으면 기본 알람음이 저절로 돌아온다. */
export async function holdNativeRing(alarmId: string, seconds: number): Promise<boolean> {
  return (await AlarmScheduler.holdRingAsync(alarmId, { seconds, volume: 0 })).held;
}

export function releaseNativeRing(alarmId: string): Promise<void> {
  return AlarmScheduler.releaseRingHoldAsync(alarmId);
}

/** 알람을 끝낸다. recheckSec이 있으면 그만큼 뒤에 재확인 알람(followUp)을 건다. */
export async function finishAlarm(alarmId: string, recheckSec: number | null): Promise<void> {
  const context = await AlarmScheduler.getCurrentAlarmContextAsync();
  const occurrenceId = context?.occurrenceId ?? alarmId;
  await AlarmScheduler.resolveAlarmOccurrenceAsync(occurrenceId, {
    outcome: 'completed',
    next: recheckSec ? { delaySeconds: recheckSec, relationship: 'followUp' } : undefined,
    idempotencyKey: `finish:${occurrenceId}`,
  });
  // 재확인을 걸었으면 complete가 그것까지 지울 수 있어 부르지 않는다. 울림이 남으면 화면의 상태 표시로 확인(I-1 확인 항목).
  if (!recheckSec) await AlarmScheduler.completeNativeAlarmAsync(alarmId);
}

export async function debugState(alarmId: string): Promise<string> {
  const s = await AlarmScheduler.getNativeAlarmDebugStateAsync(alarmId);
  return `울리는 중 ${s.isRinging} · 예약 남음 ${s.isScheduled} · 전체화면 ${s.canUseFullScreenIntent} · 상태 ${s.currentContext?.state ?? '-'}`;
}

// ── contracts.md C5 알람 모듈 (A). 위 프로토타입 함수를 바탕으로 I-4·I-9에서 채운다 ──

/** 다음 울릴 시각. 순수 함수. now가 정확히 그 시각이면 내일 */
export function nextOccurrence(time: string, now: IsoTime): IsoTime {
  throw new Error('nextOccurrence: 아직 구현 안 됨 (I-9)');
}

/** 이 알람의 기존 예약을 지우고 at에 plan으로 새로 예약 */
export async function scheduleOccurrence(alarm: Alarm, plan: AlarmPlan, at: IsoTime): Promise<void> {
  throw new Error('scheduleOccurrence: 아직 구현 안 됨 (I-9)');
}

export async function cancelAlarm(alarmId: AlarmId): Promise<void> {
  throw new Error('cancelAlarm: 아직 구현 안 됨 (I-9)');
}

/** 알람 한 번이 끝날 때마다 한 번 호출(끔 / 끝까지 못 끔). 반환값은 구독 해제 함수 */
export function onOutcome(listener: (r: OccurrenceRecord) => void): () => void {
  throw new Error('onOutcome: 아직 구현 안 됨 (I-4)');
}

/** 끈 뒤 afterMin분 뒤 재확인. soft면 부드러운 소리, gentleMode면 진동만 */
export async function scheduleRecheck(eventId: string, afterMin: number, soft: boolean): Promise<void> {
  throw new Error('scheduleRecheck: 아직 구현 안 됨 (I-9)');
}

/** 재확인 결과. 응답 없음이면 그 시점에 다시 알람을 울린 뒤 호출 */
export function onRecheck(listener: (eventId: string, result: 'responded' | 'no_response') => void): () => void {
  throw new Error('onRecheck: 아직 구현 안 됨 (I-9)');
}

/** 앱 시작 시 호출. 앱이 꺼져 있는 사이 끝난 알람을 소급 판정 */
export async function reconcile(now: IsoTime): Promise<OccurrenceRecord[]> {
  throw new Error('reconcile: 아직 구현 안 됨 (I-4)');
}

export class AlarmError extends Error {
  constructor(
    public code: 'permission_denied' | 'sound_missing' | 'schedule_failed',
    message?: string,
  ) {
    super(message ?? code);
  }
}
