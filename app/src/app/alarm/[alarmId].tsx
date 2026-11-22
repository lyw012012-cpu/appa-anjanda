import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import {
  debugState,
  finishAlarm,
  holdNativeRing,
  raiseMediaVolume,
  releaseNativeRing,
  restoreMediaVolume,
} from '@/lib/alarm';
import { isFirebaseConfigured, uploadEvent } from '@/lib/firebase';
import { playSequence, type SequenceHandle, type Step } from '@/lib/sequence-player';

// 프로토타입(I-1) 알람 울림 화면. 앱이 소리를 단계별로 바꿔 틀고, 기본 알람음은 그동안 hold로 끈다.
// 모든 단계가 끝나면 hold를 풀어 기본 알람음(안전장치)이 울린다.
const STEPS: Step[] = [
  { source: require('@/assets/prototype/proto_soft.wav'), volume: 0.4, seconds: 15 },
  { source: require('@/assets/prototype/proto_beep.wav'), volume: 0.7, seconds: 15 },
];
const HOLD_SEC = 30;
const HOLD_RENEW_MS = 20_000;
// 재확인까지 걸리는 시간. 설계값은 3분·7분(ai-design.md 7.8)이고, 확인을 빨리 하려고 줄였다.
const RECHECK_SEC = { sleepy: 60, waking: 120 } as const;

type Phase = 'ringing' | 'asking' | 'done';

export default function AlarmScreen() {
  const { alarmId } = useLocalSearchParams<{ alarmId: string }>();
  const [phase, setPhase] = useState<Phase>('ringing');
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState('');
  const seq = useRef<SequenceHandle | null>(null);
  const stepStartedAt = useRef(0); // 단계가 시작될 때마다 onStep에서 채운다
  const dismissed = useRef<{ step: number; secInStep: number } | null>(null);

  useEffect(() => {
    let renew: ReturnType<typeof setInterval> | undefined;
    let cancelled = false; // await 사이에 화면이 닫히면 뒤에 만든 interval·재생이 남지 않게
    (async () => {
      const volume = raiseMediaVolume(); // hold 전에: 미디어 볼륨 0이면 앱 소리가 무음(I-1 확인 4)
      const held = await holdNativeRing(alarmId, HOLD_SEC);
      if (cancelled) return;
      setInfo(`${held ? '기본 알람음 hold 중' : '기본 알람음 hold 실패(울리는 중이 아님)'} · 미디어 볼륨 ${volume}`);
      renew = setInterval(() => {
        raiseMediaVolume(); // 잠결에 볼륨을 내렸으면 다시 올린다
        holdNativeRing(alarmId, HOLD_SEC);
      }, HOLD_RENEW_MS);
      const handle = await playSequence(STEPS, (i) => {
        stepStartedAt.current = Date.now();
        setStep(i);
        if (i >= STEPS.length) {
          clearInterval(renew);
          restoreMediaVolume(); // 안전장치는 알람 볼륨으로 울린다
          releaseNativeRing(alarmId); // 안전장치
          setInfo('앱 소리 끝 → 기본 알람음');
        }
      });
      if (cancelled) handle.stop();
      else seq.current = handle;
    })();
    return () => {
      cancelled = true;
      clearInterval(renew);
      seq.current?.stop();
      restoreMediaVolume();
    };
  }, [alarmId]);

  const dismiss = () => {
    const current = seq.current?.currentStep() ?? step;
    dismissed.current = { step: current, secInStep: (Date.now() - stepStartedAt.current) / 1000 };
    seq.current?.stop();
    restoreMediaVolume();
    setPhase('asking');
  };

  const answer = async (state: 'sleepy' | 'waking' | 'awake') => {
    setPhase('done');
    try {
      await finishAlarm(alarmId, state === 'awake' ? null : RECHECK_SEC[state]);
      const d = dismissed.current;
      const event = {
        alarmId,
        endedAt: new Date().toISOString(),
        dismissedStep: d?.step ?? null,
        secInStep: d?.secInStep ?? null,
        state,
        steps: STEPS.map((s) => ({ volume: s.volume, seconds: s.seconds })),
      };
      if (isFirebaseConfigured) await uploadEvent(`${alarmId}_${Date.now()}`, event);
      setInfo(`${await debugState(alarmId)}\n기록: ${JSON.stringify(event)}`);
    } catch (e) {
      setInfo(`끝내기 실패: ${e}`);
    }
  };

  return (
    <View style={styles.container}>
      {phase === 'ringing' && (
        <>
          <Text style={styles.big}>⏰ {step < STEPS.length ? `${step + 1}단계` : '안전장치'}</Text>
          <Button title="끄기" onPress={dismiss} />
        </>
      )}
      {phase === 'asking' && (
        <>
          <Text style={styles.big}>지금 어떠세요?</Text>
          <Button title="😴 아직 졸려요" onPress={() => answer('sleepy')} />
          <Button title="🚶 일어나는 중이에요" onPress={() => answer('waking')} />
          <Button title="☀️ 완전히 깼어요" onPress={() => answer('awake')} />
        </>
      )}
      {phase === 'done' && <Button title="처음으로" onPress={() => router.replace('/')} />}
      <Text style={styles.info}>{info}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  big: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  info: { fontSize: 12, color: '#555' },
});
