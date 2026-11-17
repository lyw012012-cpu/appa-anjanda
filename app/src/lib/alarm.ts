import AlarmScheduler, { type AlarmPermissionResponse } from 'react-native-alarm-scheduler';

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
