import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { loadSoundLibrary } from '@/lib/sound-library';

// I-5 확인용 화면: 앱 시작 때 읽어 검사한 소리 목록(제목·계열·520 닮음·음높이·거슬림).
export default function SoundsScreen() {
  const result = useMemo(() => {
    try {
      return { lib: loadSoundLibrary(), error: null };
    } catch (e) {
      return { lib: null, error: String(e) };
    }
  }, []);

  if (!result.lib) return <Text style={styles.error}>소리 목록 오류: {result.error}</Text>;
  const { sounds, model } = result.lib;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        소리 {sounds.length}개 · 영점 {model.simMedian}
      </Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.name]}>제목</Text>
        <Text style={styles.cell}>계열</Text>
        <Text style={styles.cell}>520 닮음</Text>
        <Text style={styles.cell}>음높이</Text>
        <Text style={styles.cell}>거슬림</Text>
      </View>
      {sounds.map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={[styles.cell, styles.name]}>{s.title}</Text>
          <Text style={styles.cell}>{s.group}</Text>
          <Text style={styles.cell}>{s.sim520.hand.toFixed(2)}</Text>
          <Text style={styles.cell}>{s.pitch.toFixed(2)}</Text>
          <Text style={styles.cell}>{s.harshness.toFixed(2)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  head: { borderBottomWidth: 1, borderColor: '#999', paddingBottom: 4 },
  cell: { width: 56, fontSize: 12 },
  name: { flex: 1, width: undefined },
  error: { padding: 16, color: '#b00020' },
});
