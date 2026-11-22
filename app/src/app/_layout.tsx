import { Stack, router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { takeRingingAlarmId } from '@/lib/alarm';
import { onAppStart } from '@/stores/orchestrator';

// 잠금 화면에서 "알람 열기"로 앱이 켜지면 JS 이벤트가 없으므로, 켜질 때·앞으로 올 때마다 울리는 알람을 확인한다.
export default function RootLayout() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const routeToRingingAlarm = async () => {
      const alarmId = await takeRingingAlarmId();
      // 이미 그 알람 화면이면 다시 열지 않는다(다시 열면 단계 재생이 1단계부터 다시 시작된다).
      if (alarmId && pathRef.current !== `/alarm/${alarmId}`) {
        router.replace({ pathname: '/alarm/[alarmId]', params: { alarmId } });
      }
    };
    onAppStart().catch(() => {}); // 기록 읽기·업로드(C10)
    routeToRingingAlarm();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && routeToRingingAlarm());
    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ title: '아빠 안잔다' }} />;
}
