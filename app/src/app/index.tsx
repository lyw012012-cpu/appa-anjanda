import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Button, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  IS_WEB,
  getPermissions,
  missingPermission,
  openNotificationSettings,
  requestPermissions,
  type Permissions,
} from '@/lib/alarm';
import { useAlarmStore } from '@/stores/alarm-store';
import { clearEvents, syncPending, useEventStore } from '@/stores/event-store';
import { armAlarm, getLibrary, usePendingStore } from '@/stores/orchestrator';
import type { Alarm } from '@/types/contracts';

// 첫 화면(I-8): 권한, 알람 목록(다음 소리 3개와 이유), 알람 추가, 기록 수.
const TIME_RULE = /^([01]\d|2[0-3]):[0-5]\d$/;
const newAlarmId = () => `a_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`; // 1절 알람 ID
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// 실제 알람이 울리는 안드로이드 빌드(main 기준 preview b0973a27) APK 파일. 빌드 페이지는 로그인해야 보여서 파일 주소를 쓴다
const APK_PAGE = 'https://expo.dev/artifacts/eas/HeV0LcsT0cwvDWYiuT1L0x6oPzZIgZU-GWSFSw9ASCE.apk';

export default function HomeScreen() {
  const [perm, setPerm] = useState<Permissions | null>(null);
  const [time, setTime] = useState('07:00');
  const [log, setLog] = useState('');
  const alarms = useAlarmStore((s) => s.alarms);
  const plans = usePendingStore((s) => s.plans);
  const error = usePendingStore((s) => s.error);
  const events = useEventStore((s) => s.events);

  // 첫 실행 때 빠진 권한을 바로 요청하고, 설정 화면에서 돌아올 때마다 다시 읽는다.
  // ponytail: 매 실행마다 요청함(거부하면 매번 뜸). 안내 화면에서 한 번만 묻는 건 다음 단계
  useEffect(() => {
    getPermissions()
      .then(async (p) => setPerm(missingPermission(p) ? await requestPermissions() : p))
      .catch((e) => setLog(`권한 확인 실패: ${e}`));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && getPermissions().then(setPerm));
    return () => sub.remove();
  }, []);

  const add = async (t: string) => {
    if (!TIME_RULE.test(t)) return setLog('시각은 HH:mm (예: 07:00)');
    const alarm: Alarm = { id: newAlarmId(), time: t, enabled: true };
    useAlarmStore.getState().addAlarm(alarm);
    await armAlarm(alarm);
    setLog(`${t} 알람 추가`);
  };

  const toggle = async (a: Alarm) => {
    useAlarmStore.getState().toggleAlarm(a.id);
    await armAlarm({ ...a, enabled: !a.enabled });
  };

  const remove = async (a: Alarm) => {
    useAlarmStore.getState().removeAlarm(a.id);
    await armAlarm({ ...a, enabled: false }); // 예약·계획 지우기
  };

  const titleOf = (id: string) => getLibrary().sounds.find((s) => s.id === id)?.title ?? id;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>아빠 안잔다</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {IS_WEB ? (
        <View style={styles.card}>
          <Text>
            웹 체험판입니다. 브라우저는 알람을 예약할 수 없어서, 알람을 추가한 뒤 &quot;지금 울려 보기&quot;로 3단계 울림·상태
            질문·스누즈·재확인을 체험합니다(체험에서는 스누즈·재확인을 기다리지 않고 바로 울림). 정해진 시각에 울리는 알람은
            안드로이드 앱에서 동작합니다.
          </Text>
          <Button title="안드로이드 앱 설치(APK)" onPress={() => Linking.openURL(APK_PAGE)} />
        </View>
      ) : (
        <Text style={styles.small}>
          권한: 정확한 알람 {String(perm?.canScheduleExactAlarms)} · 전체 화면 {String(perm?.canUseFullScreenIntent)} · 알림{' '}
          {String(perm?.canPostNotifications)}
        </Text>
      )}
      <View style={styles.row}>
        {!IS_WEB && <Button title="권한 요청" onPress={async () => setPerm(await requestPermissions())} />}
        {!IS_WEB && <Button title="알림 설정" onPress={openNotificationSettings} />}
        <Button title="처음 설정" onPress={() => router.push('/setup')} />
        <Button title="소리 목록" onPress={() => router.push('/sounds')} />
        <Button title="통계" onPress={() => router.push('/stats')} />
      </View>

      <Text style={styles.section}>알람</Text>
      {alarms.map((a) => {
        const plan = plans[a.id];
        return (
          <View key={a.id} style={styles.card}>
            <Text style={styles.time}>
              {a.time} {a.enabled ? '' : '(꺼짐)'}
            </Text>
            {plan && a.enabled && (
              <>
                {plan.stages.map((s) => (
                  <Text key={s.stage} style={styles.small}>
                    {s.stage}단계 {titleOf(s.soundId)} · 음량 {s.volume.toFixed(2)}
                  </Text>
                ))}
                <Text style={styles.reason}>{plan.reason}</Text>
              </>
            )}
            <View style={styles.row}>
              <Button title={a.enabled ? '끄기' : '켜기'} onPress={() => toggle(a)} />
              <Button title="삭제" onPress={() => remove(a)} />
              {plan && a.enabled && (
                <Button
                  title="지금 울려 보기"
                  onPress={() => router.push({ pathname: '/alarm/[alarmId]', params: { alarmId: a.id, demo: '1' } })}
                />
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.row}>
        <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="07:00" />
        <Button title="추가" onPress={() => add(time)} />
        {!IS_WEB && <Button title="2분 뒤 시연 알람" onPress={() => add(hhmm(new Date(Date.now() + 2 * 60_000)))} />}
      </View>

      <Text style={styles.section}>기록 (기기 저장 {events.length}개)</Text>
      {events.slice(-3).map((e) => (
        <Text key={e.eventId} style={styles.small}>
          {e.occurrenceAt.slice(5, 16)} · {e.played.map((p) => `${p.stage}:${p.end}`).join(' ')} · 답 {e.state ?? '-'} · 재확인{' '}
          {e.recheck}
        </Text>
      ))}
      <View style={styles.row}>
        <Button title="기록 올리기" onPress={async () => setLog(`업로드 ${JSON.stringify(await syncPending())}`)} />
        <Button title="기록 지우기(시연용)" onPress={clearEvents} />
      </View>
      <Text style={styles.small}>{log}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, gap: 4 },
  time: { fontSize: 24, fontWeight: '600' },
  reason: { fontSize: 13, color: '#208AEF' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, minWidth: 70 },
  small: { fontSize: 12, color: '#555' },
  error: { color: '#c00' },
});
