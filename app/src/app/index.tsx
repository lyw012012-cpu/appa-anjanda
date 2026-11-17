import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getPermissions, requestPermissions, scheduleTestAlarm, type Permissions } from '@/lib/alarm';
import { ensureUid, isFirebaseConfigured } from '@/lib/firebase';

// 프로토타입(I-1) 첫 화면: 권한 확인, "N분 뒤 알람", Firebase 연결 확인.
export default function HomeScreen() {
  const [perm, setPerm] = useState<Permissions | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l]);

  useEffect(() => {
    getPermissions().then(setPerm).catch((e) => add(`권한 확인 실패: ${e}`));
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
        <Button title="Firebase 확인" onPress={checkFirebase} />      </View>
      <View style={styles.row}>
        <Button title="1분 뒤 알람" onPress={() => schedule(60)} />
        <Button title="2분 뒤 알람" onPress={() => schedule(120)} />
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
