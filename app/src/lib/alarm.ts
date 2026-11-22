import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Linking, PermissionsAndroid } from 'react-native';
import AlarmScheduler, { type AlarmPermissionResponse } from 'react-native-alarm-scheduler';
import type { Alarm, AlarmId, AlarmPlan, IsoTime, OccurrenceRecord } from '@/types/contracts';

// 프로토타입(I-1) 알람 래퍼. 화면은 라이브러리를 직접 부르지 않고 여기를 거친다.
// 기본 알람음(시스템 알람 소리, 알람 볼륨)이 안전장치이고, 앱은 hold로 그걸 잠시 끄고 자기 소리를 튼다.

export type Permissions = AlarmPermissionResponse;

export function getPermissions(): Promise<Permissions> {
  return AlarmScheduler.getPermissionsAsync();
}

/** 권한이 하나라도 없으면 true. 하나라도 꺼지면 잠금 화면에서 알람 화면이 안 뜬다(I-1 확인 2, 2026-11-20) */
export function missingPermission(p: Permissions): boolean {
  return !p.canScheduleExactAlarms || p.canUseFullScreenIntent === false || p.canPostNotifications === false;
}

/** 빠진 권한을 하나씩 요청한다: 알림(시스템 허용 창) → 정확한 알람 → 전체 화면. 설정 화면은 한 번에 하나만 연다 */
export async function requestPermissions(): Promise<Permissions> {
  let p = await AlarmScheduler.getPermissionsAsync();
  if (p.canPostNotifications === false) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    // 전에 거부해 허용 창이 안 뜨면 앱 알림 설정에서 직접 켜야 한다
    if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return openNotificationSettings().then(getPermissions);
    p = await AlarmScheduler.getPermissionsAsync();
  }
  if (!p.canScheduleExactAlarms) await AlarmScheduler.openAlarmSettingsAsync();
  else if (p.canUseFullScreenIntent === false) await AlarmScheduler.openFullScreenIntentSettingsAsync();
  return p;
}

/** 앱 알림 설정 화면. 알림 종류(카테고리)를 모두 켜는 곳. 앱이 대신 켤 수는 없다 */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: Constants.expoConfig?.android?.package ?? '' },
    ]);
  } catch {
    await Linking.openSettings(); // 제조사가 위 화면을 막으면 앱 정보 화면
  }
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
  // 끝난 알람도 context가 남아 있다. 울리는 중(alerting)이거나 앱이 끈 중(held)일 때만 울리는 알람으로 본다.
  const ringing = context?.state === 'alerting' || context?.state === 'held';
  const id = handoff?.alarmId ?? (ringing ? context?.id : null) ?? null;
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

// 앱 소리는 미디어 볼륨으로 나와서, 미디어 볼륨 0이면 hold 동안 무음이었다(I-1 확인 4). 울리는 동안만 바닥값까지 올린다.
// 모듈은 modules/media-volume(네이티브). 이 모듈이 없는 옛 빌드·Expo Go에서는 아무것도 안 한다.
const MediaVolume = requireOptionalNativeModule<{ raiseTo(minFraction: number): number; restore(index: number): void }>(
  'MediaVolume',
);
const MEDIA_VOLUME_FLOOR = 0.5; // 최대의 절반. 단계 음량(0.4·0.7)은 이 위에서 곱해진다
let savedMediaVolume: number | null = null;

/** 미디어 볼륨이 바닥값보다 낮으면 올린다. 여러 번 불러도 처음 값만 기억한다(잠결에 볼륨을 내리면 다시 올림) */
export function raiseMediaVolume(): 'raised' | 'enough' | 'failed' | 'unavailable' {
  if (!MediaVolume) return 'unavailable';
  const prev = MediaVolume.raiseTo(MEDIA_VOLUME_FLOOR);
  if (prev === -2) return 'failed';
  if (prev < 0) return 'enough';
  if (savedMediaVolume === null) savedMediaVolume = prev;
  return 'raised';
}

/** 올렸던 미디어 볼륨을 원래대로. ponytail: 울리는 중에 앱이 죽으면 올린 채로 남는다 */
export function restoreMediaVolume(): void {
  if (savedMediaVolume !== null) MediaVolume?.restore(savedMediaVolume);
  savedMediaVolume = null;
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
