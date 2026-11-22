import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { recommendConfig } from '@/config';
import { toIsoLocal } from '@/lib/alarm';
import { computeStats, fitBandit } from '@/lib/recommend';
import { useEventStore } from '@/stores/event-store';
import { getLibrary } from '@/stores/orchestrator';
import type { AlarmEvent, BanditModel, SoundStat } from '@/types/contracts';

// 통계 화면(I-8 시연용, C12): 소리별 습관화(pHabit), 이 사람의 경향(fitBandit), 안전장치까지 간 비율.
// computeStats·fitBandit은 B(I-6·I-7). 아직 없으면 그 칸만 "준비 중"으로 보인다.
const FEATURE_NAMES = ['상수', '단계', '익숙함', '520 닮음', '음높이'];

const tryRun = <T,>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

export default function StatsScreen() {
  const events = useEventStore((s) => s.events);
  const lib = getLibrary();
  const [now] = useState(() => toIsoLocal(Date.now())); // 화면을 연 시각 기준
  const stats: Record<string, SoundStat> | null = tryRun(() => computeStats(lib, events, recommendConfig, now));
  const model: BanditModel | null = tryRun(() => fitBandit(events, recommendConfig, now));

  const reachedSafety = (e: AlarmEvent) => e.played.some((p) => p.stage === 'safety');
  const safetyCount = events.filter(reachedSafety).length;
  const plays = new Map<string, number>();
  for (const e of events) for (const p of e.played) if (p.soundId) plays.set(p.soundId, (plays.get(p.soundId) ?? 0) + 1);
  const played = lib.sounds.filter((s) => plays.has(s.id) || (stats?.[s.id]?.plays ?? 0) > 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>안전장치까지 간 알람</Text>
      <Text>
        {events.length}번 중 {safetyCount}번 · 끝까지 못 끔 {events.filter((e) => !e.dismissed).length}번
      </Text>

      <Text style={styles.title}>소리별 익숙함</Text>
      {!stats && <Text style={styles.small}>습관화 계산(computeStats, I-6) 준비 중: 재생 횟수만 보여요</Text>}
      {played.length === 0 && <Text style={styles.small}>아직 울린 소리가 없어요</Text>}
      {played.map((s) => {
        const st = stats?.[s.id];
        return (
          <Text key={s.id}>
            {s.title} · {st?.plays ?? plays.get(s.id)}번
            {st && ` · 익숙함 ${st.pHabit.toFixed(2)}${st.habituated ? ' (익숙해짐)' : ''}`}
          </Text>
        );
      })}

      <Text style={styles.title}>이 사람의 경향</Text>
      {!model && <Text style={styles.small}>사람별 학습(fitBandit, I-7) 준비 중</Text>}
      {model && (
        <>
          <Text style={styles.small}>학습한 구간 {model.n}개</Text>
          {model.mean.map((m, i) => (
            <Text key={FEATURE_NAMES[i]}>
              {FEATURE_NAMES[i]} {m.toFixed(3)}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 17, fontWeight: '600', marginTop: 10 },
  small: { fontSize: 12, color: '#555' },
});
