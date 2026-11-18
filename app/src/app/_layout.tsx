import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { takeRingingAlarmId } from '@/lib/alarm';

// 잠금 화면에서 "알람 열기"로 앱이 켜지면 JS 이벤트가 없으므로, 켜질 때·앞으로 올 때마다 울리는 알람을 확인한다.
async function routeToRingingAlarm() {
  const alarmId = await takeRingingAlarmId();
  if (alarmId) router.replace({ pathname: '/alarm/[alarmId]', params: { alarmId } });
}

export default function RootLayout() {
  useEffect(() => {
    routeToRingingAlarm();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && routeToRingingAlarm());
    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ title: '아빠 안잔다' }} />;
}
