import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getPermissions,
  missingPermission,
  openNotificationSettings,
  requestPermissions,
  scheduleTestAlarm,
  type Permissions,
} from '@/lib/alarm';
import { ensureUid, isFirebaseConfigured } from '@/lib/firebase';
import { clearEvents, syncPending, useEventStore } from '@/stores/event-store';

// 프로토타입(I-1) 첫 화면: 권한 확인, "N분 뒤 알람", Firebase 연결 확인.
export default function HomeScreen() {
  const [perm, setPerm] = useState<Permissions | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const events = useEventStore((s) => s.events);
  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l]);

  // 첫 실행 때 빠진 권한을 바로 요청하고, 설정 화면에서 돌아올 때마다 다시 읽는다.
  // ponytail: 매 실행마다 요청함(거부하면 매번 뜸). 정식 앱은 안내 화면(I-8)에서 한 번만
  useEffect(() => {
    getPermissions()
      .then(async (p) => setPerm(missingPermission(p) ? await requestPermissions() : p))
      .catch((e) => add(`권한 확인 실패: ${e}`));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && getPermissions().then(setPerm));
    return () => sub.remove();
  }, []);

  const schedule = async (sec: number) => {
    try {
      const id = await scheduleTestAlarm(sec);
      add(`${sec}초 뒤 알람 예약 (${id}). 앱을 완전히 끄고 기다려 보세요`);
    } catch (e) {
      add(`예약 실패: ${e}`);
    }
  };

  const checkFirebase = async () => {
    if (!isFirebaseConfigured) return add('Firebase 미설정: app/.env를 채우세요');
    try {
      add(`익명 로그인 uid ${await ensureUid()}`);
    } catch (e) {
      add(`Firebase 실패: ${e}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>알람 프로토타입</Text>
      <Text>
        정확한 알람 {String(perm?.canScheduleExactAlarms)} · 전체 화면 {String(perm?.canUseFullScreenIntent)} · 알림{' '}
        {String(perm?.canPostNotifications)}
      </Text>
      <View style={styles.row}>
        <Button title="권한 요청" onPress={async () => setPerm(await requestPermissions())} />
        <Button title="알림 설정" onPress={openNotificationSettings} />
        <Button title="Firebase 확인" onPress={checkFirebase} />
        <Button title="소리 목록" onPress={() => router.push('/sounds')} />
      </View>
      <View style={styles.row}>
        <Button title="1분 뒤 알람" onPress={() => schedule(60)} />
        <Button title="2분 뒤 알람" onPress={() => schedule(120)} />
      </View>
      <Text>
        기기에 저장된 알람 기록 {events.length}개
        {events.length > 0 && ` · 마지막 ${events[events.length - 1].occurrenceAt} 답 ${events[events.length - 1].state}`}
      </Text>
      <View style={styles.row}>
        <Button title="기록 올리기" onPress={async () => add(`업로드 ${JSON.stringify(await syncPending())}`)} />
        <Button title="기록 지우기(시연용)" onPress={clearEvents} />
      </View>
      {log.map((line, i) => (
        <Text key={i} style={styles.log}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  log: { fontSize: 12, color: '#555' },
});
