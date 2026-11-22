import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Linking, PermissionsAndroid } from 'react-native';
import AlarmScheduler, { type AlarmPermissionResponse } from 'react-native-alarm-scheduler';
import { soundAssets } from '@/data/sound-assets';
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

/** 오프셋 포함 ISO 8601, 초까지(contracts 1절). 예: 2026-11-22T07:00:00+09:00 */
export function toIsoLocal(ms: number): IsoTime {
  const d = new Date(ms);
  const p = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`
  );
}

// 잠금 화면 위로 우리 알람 화면을 바로 띄운다(plugins/with-show-when-locked). 앱이 complete할 때까지 멈추지 않는다.
const ANDROID_OPTIONS = {
  alertActionMode: 'openAppOnly',
  fullScreenTarget: 'app',
  secondaryButtonTitle: '알람 열기',
  maxRingDurationSeconds: 0,
} as const;

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
export function raiseMediaVolume(): 'raised' | 'enough' | 'unavailable' {
  if (!MediaVolume) return 'unavailable';
  const prev = MediaVolume.raiseTo(MEDIA_VOLUME_FLOOR);
  if (prev < 0) return 'enough';
  if (savedMediaVolume === null) savedMediaVolume = prev;
  return 'raised';
}

/** 올렸던 미디어 볼륨을 원래대로. ponytail: 울리는 중에 앱이 죽으면 올린 채로 남는다 */
export function restoreMediaVolume(): void {
  if (savedMediaVolume !== null) MediaVolume?.restore(savedMediaVolume);
  savedMediaVolume = null;
}

/** 지금 울리는 알람을 끝낸다. recheckSec이 있으면 그만큼 뒤에 재확인 알람(followUp)을 건다. */
export async function finishAlarm(recheckSec: number | null): Promise<void> {
  const context = await AlarmScheduler.getCurrentAlarmContextAsync();
  if (!context) return;
  const alarmId = context.id;
  const occurrenceId = context.occurrenceId ?? alarmId;
  await AlarmScheduler.resolveAlarmOccurrenceAsync(occurrenceId, {
    outcome: 'completed',
    // metadata(우리 alarmId·occurrenceAt)를 재확인 알람에도 넘긴다
    next: recheckSec ? { delaySeconds: recheckSec, relationship: 'followUp', metadata: context.metadata } : undefined,
    idempotencyKey: `finish:${occurrenceId}`,
  });
  // 재확인을 걸었으면 complete가 그것까지 지울 수 있어 부르지 않는다. 울림이 남으면 화면의 상태 표시로 확인(I-1 확인 항목).
  if (!recheckSec) await AlarmScheduler.completeNativeAlarmAsync(alarmId);
}

/** 스누즈: 지금 울림을 멈추고 delaySec 뒤 다시 울린다(라이브러리 deferred). 몇 단계부터 틀지는 화면이 정한다(C5) */
export async function snoozeAlarm(delaySec: number): Promise<void> {
  const context = await AlarmScheduler.getCurrentAlarmContextAsync();
  if (!context) return;
  const occurrenceId = context.occurrenceId ?? context.id;
  await AlarmScheduler.resolveAlarmOccurrenceAsync(occurrenceId, {
    outcome: 'deferred',
    next: { delaySeconds: delaySec, relationship: 'deferred', metadata: context.metadata },
    idempotencyKey: `snooze:${occurrenceId}`,
  });
}

export async function debugState(alarmId: string): Promise<string> {
  const s = await AlarmScheduler.getNativeAlarmDebugStateAsync(alarmId);
  return `울리는 중 ${s.isRinging} · 예약 남음 ${s.isScheduled} · 전체화면 ${s.canUseFullScreenIntent} · 상태 ${s.currentContext?.state ?? '-'}`;
}

// ── contracts.md C5 알람 모듈 (A) ──
// 울리면 잠금 화면 위 알람 화면(app/alarm/[alarmId])이 계획대로 단계를 재생하고, 끝나면 화면이 orchestrator(C10)를 직접 부른다.
// 그래서 onOutcome·onRecheck 구독은 쓰지 않는다.

/** 다음 울릴 시각. 순수 함수(기기 시간대 기준). now가 정확히 그 시각이면 내일 */
export function nextOccurrence(time: string, now: IsoTime): IsoTime {
  const [h, m] = time.split(':').map(Number);
  const t = new Date(Date.parse(now));
  const at = new Date(t);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= t.getTime()) at.setDate(at.getDate() + 1);
  return toIsoLocal(at.getTime());
}

/** 이 알람의 기존 예약을 지우고 at에 plan으로 새로 예약. 계획 자체는 orchestrator가 보관한다(C10 pending) */
export async function scheduleOccurrence(alarm: Alarm, plan: AlarmPlan, at: IsoTime): Promise<void> {
  const missing = plan.stages.find((s) => !(s.soundId in soundAssets));
  if (missing) throw new AlarmError('sound_missing', missing.soundId);
  try {
    // 울림마다 라이브러리 ID를 새로 쓴다(같은 ID면 지금 울리는 알람·재확인까지 지워진다). 우리 ID는 metadata.alarmId
    const ringing = (await AlarmScheduler.getCurrentAlarmContextAsync())?.id;
    for (const a of await AlarmScheduler.getScheduledAlarmsAsync())
      if (a.metadata?.alarmId === alarm.id && a.id !== ringing && a.relationship !== 'followUp')
        await AlarmScheduler.cancelAlarmAsync(a.id);
    const ms = Date.parse(at);
    const d = new Date(ms);
    await AlarmScheduler.scheduleAlarmAsync({
      id: `${alarm.id}_${ms}`,
      hour: d.getHours(),
      minute: d.getMinutes(),
      timestamp: ms,
      title: '아빠 안잔다',
      android: { ...ANDROID_OPTIONS, metadata: { alarmId: alarm.id, occurrenceAt: at } },
    });
  } catch (e) {
    throw new AlarmError('schedule_failed', String(e));
  }
}

export async function cancelAlarm(alarmId: AlarmId): Promise<void> {
  for (const a of await AlarmScheduler.getScheduledAlarmsAsync())
    if (a.metadata?.alarmId === alarmId) await AlarmScheduler.cancelAlarmAsync(a.id);
}

/** 울리는 알람(라이브러리 ID)의 우리 알람 ID·예약 시각, 재확인(followUp)인지. 우리 예약이 아니면(옛 테스트 알람) alarmId는 라이브러리 ID */
export async function ringingInfo(
  nativeId: string,
): Promise<{ alarmId: AlarmId; occurrenceAt: IsoTime; kind: 'primary' | 'snooze' | 'recheck' }> {
  const c = await AlarmScheduler.getCurrentAlarmContextAsync();
  const m = c?.id === nativeId ? c.metadata : undefined;
  return {
    alarmId: typeof m?.alarmId === 'string' ? m.alarmId : nativeId,
    occurrenceAt: typeof m?.occurrenceAt === 'string' ? m.occurrenceAt : toIsoLocal(Date.now()),
    kind: c?.relationship === 'followUp' ? 'recheck' : c?.relationship === 'deferred' ? 'snooze' : 'primary',
  };
}

/** 끈 뒤 afterMin분 뒤 재확인(라이브러리 followUp 알람). 이 알람의 울림도 여기서 끝낸다. soft·gentleMode는 재확인 화면이 정한다 */
export async function scheduleRecheck(eventId: string, afterMin: number, soft: boolean): Promise<void> {
  void eventId; // 지금 울리는 알람에 건다(재확인 대상 이벤트는 orchestrator가 기억)
  void soft;
  await finishAlarm(afterMin * 60);
}

/** 앱 시작 시 호출. ponytail: 소급 판정 없음(앱이 꺼져 있으면 기본 알람음이 울리고 기록은 안 남는다). 필요하면 getAlarmOccurrencesAsync로 */
export async function reconcile(now: IsoTime): Promise<OccurrenceRecord[]> {
  void now;
  return [];
}

export class AlarmError extends Error {
  constructor(
    public code: 'permission_denied' | 'sound_missing' | 'schedule_failed',
    message?: string,
  ) {
    super(message ?? code);
  }
}
