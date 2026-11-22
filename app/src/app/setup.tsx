import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { soundAssets } from '@/data/sound-assets';
import { useAlarmStore } from '@/stores/alarm-store';
import { armAlarm, getLibrary } from '@/stores/orchestrator';
import { getSettings, updateSettings } from '@/stores/settings-store';

// 처음 설정(I-8, C12): 계열 대표 소리를 들어 보고 고르기(서로 다른 계열 2개 이상 권장), 시작 음량.
const VOLUMES = [0.3, 0.5, 0.7];

export default function SetupScreen() {
  const reps = getLibrary().sounds.filter((s) => s.groupRep);
  const [chosen, setChosen] = useState<string[]>(getSettings().chosen);
  const [volume, setVolume] = useState(getSettings().startVolume);
  const player = useRef<AudioPlayer | null>(null);
  useEffect(() => () => player.current?.remove(), []);

  const listen = (id: string, v: number) => {
    player.current ??= createAudioPlayer(null);
    const p = player.current;
    p.replace(soundAssets[id]);
    p.volume = v;
    p.play();
  };

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const groups = new Set(reps.filter((s) => chosen.includes(s.id)).map((s) => s.group));

  const save = async () => {
    player.current?.pause();
    updateSettings({ chosen, startVolume: volume });
    for (const a of useAlarmStore.getState().alarms) await armAlarm(a); // 설정이 바뀌면 다시 계획(C10)
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>어떤 소리가 편한가요?</Text>
      <Text style={styles.small}>들어 보고 마음에 드는 소리를 고르세요. 서로 다른 종류를 2개 이상 고르면 좋아요.</Text>
      {reps.map((s) => (
        <View key={s.id} style={styles.row}>
          <Button title="▶" onPress={() => listen(s.id, volume)} />
          <Button title={`${chosen.includes(s.id) ? '✅' : '⬜'} ${s.title} (${s.group})`} onPress={() => toggle(s.id)} />
        </View>
      ))}
      {chosen.length > 0 && groups.size < 2 && <Text style={styles.warn}>다른 종류도 하나 더 고르면 좋아요</Text>}

      <Text style={styles.title}>이 크기면 깰 것 같나요?</Text>
      <View style={styles.row}>
        {VOLUMES.map((v) => (
          <Button
            key={v}
            title={`${volume === v ? '● ' : ''}${Math.round(v * 100)}%`}
            onPress={() => {
              setVolume(v);
              const id = chosen[0] ?? reps[0]?.id;
              if (id) listen(id, v);
            }}
          />
        ))}
      </View>
      <Button title="저장" onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  small: { fontSize: 13, color: '#555' },
  warn: { color: '#b60' },
});
