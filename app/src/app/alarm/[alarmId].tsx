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
  toIsoLocal,
} from '@/lib/alarm';
import { playSequence, type SequenceHandle, type Step } from '@/lib/sequence-player';
import { appendEvent, syncPending } from '@/stores/event-store';
import type { AlarmEvent, PlayedStage, Stage } from '@/types/contracts';

// 프로토타입(I-1) 알람 울림 화면. 앱이 소리를 단계별로 바꿔 틀고, 기본 알람음은 그동안 hold로 끈다.
// 모든 단계가 끝나면 hold를 풀어 기본 알람음(안전장치)이 울린다.
// 끄고 답하면 C4 AlarmEvent로 기기에 저장하고 Firestore에 올린다(I-4). 계획(planAlarm, I-7)이 생기면 I-9에서 STEPS를 계획으로 바꾼다.
const STEPS: (Step & { soundId: string })[] = [
  { soundId: 'proto_soft', source: require('@/assets/prototype/proto_soft.wav'), volume: 0.4, seconds: 15 },
  { soundId: 'proto_beep', source: require('@/assets/prototype/proto_beep.wav'), volume: 0.7, seconds: 15 },
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
  const ringStartedAt = useRef(0);
  const played = useRef<PlayedStage[]>([]); // 끝난 구간(C6)

  // 지금 구간을 end로 닫아 played에 넣는다. i는 STEPS 순번, STEPS.length 이상이면 안전장치
  const closeStage = (i: number, end: PlayedStage['end']) => {
    const s = STEPS[i];
    played.current.push({
      stage: s ? ((i + 1) as Stage) : 'safety',
      soundId: s ? s.soundId : null,
      volume: s ? s.volume : 1,
      startedAt: toIsoLocal(stepStartedAt.current),
      playedSec: (Date.now() - stepStartedAt.current) / 1000,
      end,
      features: null, // 계획 없음(I-9에서 StagePlan.features 복사)
    });
  };

  useEffect(() => {
    let renew: ReturnType<typeof setInterval> | undefined;
    ringStartedAt.current = Date.now();
    stepStartedAt.current = Date.now();
    (async () => {
      const volume = raiseMediaVolume(); // hold 전에: 미디어 볼륨 0이면 앱 소리가 무음(I-1 확인 4)
      const held = await holdNativeRing(alarmId, HOLD_SEC);
      setInfo(`${held ? '기본 알람음 hold 중' : '기본 알람음 hold 실패(울리는 중이 아님)'} · 미디어 볼륨 ${volume}`);
      renew = setInterval(() => {
        raiseMediaVolume(); // 잠결에 볼륨을 내렸으면 다시 올린다
        holdNativeRing(alarmId, HOLD_SEC);
      }, HOLD_RENEW_MS);
      seq.current = await playSequence(STEPS, (i) => {
        if (i > 0) closeStage(i - 1, 'next');
        stepStartedAt.current = Date.now();
        setStep(i);
        if (i >= STEPS.length) {
          clearInterval(renew);
          restoreMediaVolume(); // 안전장치는 알람 볼륨으로 울린다
          releaseNativeRing(alarmId); // 안전장치
          setInfo('앱 소리 끝 → 기본 알람음');
        }
      });
    })();
    return () => {
      clearInterval(renew);
      seq.current?.stop();
      restoreMediaVolume();
    };
  }, [alarmId]);

  const dismiss = () => {
    closeStage(seq.current?.currentStep() ?? step, 'dismissed');
    seq.current?.stop();
    restoreMediaVolume();
    setPhase('asking');
  };

  const answer = async (state: 'sleepy' | 'waking' | 'awake') => {
    setPhase('done');
    try {
      await finishAlarm(alarmId, state === 'awake' ? null : RECHECK_SEC[state]);
      const occurrenceAt = toIsoLocal(ringStartedAt.current); // ponytail: 예약 시각 대신 울리기 시작한 시각(I-9에서 예약 시각으로)
      const event: AlarmEvent = {
        schemaVersion: 2,
        eventId: `${alarmId}__${occurrenceAt}`,
        alarmId,
        occurrenceAt,
        endedAt: toIsoLocal(Date.now()),
        played: played.current,
        snoozeCount: 0,
        dismissed: true,
        backfilled: false,
        plan: null,
        state,
        recheck: state === 'awake' ? 'none' : 'pending',
        appVersion: '1.0.0',
      };
      appendEvent(event);
      const sync = await syncPending();
      setInfo(`${await debugState(alarmId)}\n저장함 · 업로드 ${sync.synced}개, 실패 ${sync.failed}개`);
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
