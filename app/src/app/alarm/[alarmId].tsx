import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { alarmConfig } from '@/config';
import { soundAssets } from '@/data/sound-assets';
import {
  finishAlarm,
  holdNativeRing,
  raiseMediaVolume,
  releaseNativeRing,
  restoreMediaVolume,
  ringingInfo,
  toIsoLocal,
} from '@/lib/alarm';
import { playSequence, type SequenceHandle, type Step } from '@/lib/sequence-player';
import {
  eventIdOf,
  getLibrary,
  handleOutcome,
  handleRecheck,
  planForRinging,
  recordState,
  usePendingStore,
} from '@/stores/orchestrator';
import { getSettings, updateSettings } from '@/stores/settings-store';
import type { PlayedStage, Stage, StateAnswer } from '@/types/contracts';

// 알람 울림 화면(C5 재생 순서, C12). 라우트 값은 라이브러리 알람 ID.
// 본 알람: 계획의 1→2→3단계를 stageSec씩 앱이 재생하고, 그동안 기본 알람음은 hold로 끈다. 다 지나면 hold를 풀어 안전장치.
// 재확인(followUp): 1단계 소리를 작게 틀고 "일어났어요"를 기다린다. ASK_SEC 안에 안 누르면 응답 없음 → 기본 알람음.
// ponytail: 스누즈 없음(C5 스누즈는 다음 단계). 끝까지 못 끔(gave_up)·maxSec 판정 없음(안전장치는 끌 때까지 울림).
const HOLD_SEC = 30;
const HOLD_RENEW_MS = 20_000;
const ASK_SEC = 60; // 상태 질문·재확인을 기다리는 시간 [가설](C10)

type Phase = 'loading' | 'ringing' | 'asking' | 'recheck' | 'recheck_missed' | 'done';
type PlannedStep = Step & { soundId: string; title: string };

export default function AlarmScreen() {
  const { alarmId: nativeId } = useLocalSearchParams<{ alarmId: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState('');
  const seq = useRef<SequenceHandle | null>(null);
  const steps = useRef<PlannedStep[]>([]);
  const ring = useRef<{ alarmId: string; occurrenceAt: string } | null>(null);
  const recheckEventId = useRef<string | null>(null);
  const stepStartedAt = useRef(0);
  const [view, setView] = useState<PlannedStep[]>([]); // 화면에 보일 단계(steps ref와 같은 값)
  const played = useRef<PlayedStage[]>([]); // 끝난 구간(C6)
  const answered = useRef(false);

  // 지금 구간을 end로 닫아 played에 넣는다. i는 단계 순번(0부터), 3 이상이면 안전장치
  const closeStage = (i: number, end: PlayedStage['end']) => {
    const s = steps.current[i];
    played.current.push({
      stage: s ? ((i + 1) as Stage) : 'safety',
      soundId: s ? s.soundId : null,
      volume: s ? s.volume : 1,
      startedAt: toIsoLocal(stepStartedAt.current),
      playedSec: (Date.now() - stepStartedAt.current) / 1000,
      end,
      features: null, // orchestrator가 계획에서 복사
    });
  };

  useEffect(() => {
    let renew: ReturnType<typeof setInterval> | undefined;
    let missTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const r = await ringingInfo(nativeId);
      ring.current = r;
      const plan = planForRinging(r.alarmId);
      const titleOf = (id: string) => getLibrary().sounds.find((s) => s.id === id)?.title ?? id;
      const toStep = (soundId: string, volume: number, seconds: number): PlannedStep => ({
        soundId,
        title: titleOf(soundId),
        source: soundAssets[soundId],
        volume,
        seconds,
      });
      recheckEventId.current = r.isRecheck ? (usePendingStore.getState().recheckEvent[r.alarmId] ?? null) : null;
      steps.current = r.isRecheck
        ? [toStep(plan.stages[0].soundId, Math.min(0.3, plan.stages[0].volume), ASK_SEC)]
        : plan.stages.map((s) => toStep(s.soundId, s.volume, alarmConfig.stageSec));
      setView(steps.current);
      setPhase(r.isRecheck ? 'recheck' : 'ringing');

      const volume = raiseMediaVolume(); // hold 전에: 미디어 볼륨 0이면 앱 소리가 무음(I-1 확인 4)
      const held = await holdNativeRing(nativeId, HOLD_SEC);
      setInfo(`${held ? '기본 알람음 hold 중' : '기본 알람음 hold 실패'} · 미디어 볼륨 ${volume}\n${plan.reason}`);
      renew = setInterval(() => {
        raiseMediaVolume(); // 잠결에 볼륨을 내렸으면 다시 올린다
        holdNativeRing(nativeId, HOLD_SEC);
      }, HOLD_RENEW_MS);
      seq.current = await playSequence(steps.current, (i) => {
        if (i > 0 && !r.isRecheck) closeStage(i - 1, 'next');
        stepStartedAt.current = Date.now();
        setStep(i);
        if (i >= steps.current.length) {
          clearInterval(renew);
          restoreMediaVolume(); // 안전장치는 알람 볼륨으로 울린다
          releaseNativeRing(nativeId);
          if (r.isRecheck) {
            // 재확인에 응답 없음 → 다시 잠듦으로 기록하고 기본 알람음으로 깨운다(C5)
            if (recheckEventId.current) handleRecheck(recheckEventId.current, 'no_response');
            setPhase('recheck_missed');
          }
          setInfo('앱 소리 끝 → 기본 알람음');
        }
      });
    })();
    return () => {
      clearInterval(renew);
      clearTimeout(missTimer);
      seq.current?.stop();
      restoreMediaVolume();
    };
  }, [nativeId]);

  const dismiss = () => {
    closeStage(seq.current?.currentStep() ?? step, 'dismissed');
    seq.current?.stop();
    restoreMediaVolume();
    setPhase('asking');
  };

  const excludeCurrent = () => {
    const s = steps.current[seq.current?.currentStep() ?? step];
    if (!s) return;
    updateSettings({ excluded: [...new Set([...getSettings().excluded, s.soundId])] });
    setInfo(`다음부터 "${s.title}"은(는) 쓰지 않아요`);
  };

  const answer = async (state: StateAnswer) => {
    if (answered.current || !ring.current) return;
    answered.current = true;
    setPhase('done');
    const { alarmId, occurrenceAt } = ring.current;
    try {
      await handleOutcome({
        alarmId,
        occurrenceAt,
        endedAt: toIsoLocal(Date.now()),
        played: played.current,
        snoozeCount: 0,
        dismissed: true,
        backfilled: false,
      });
      await recordState(eventIdOf(alarmId, occurrenceAt), state);
      const next = usePendingStore.getState().plans[alarmId];
      setInfo(next ? `다음 알람: ${next.stages.map((s) => s.soundId).join(' → ')}\n${next.reason}` : '저장했어요');
    } catch (e) {
      setInfo(`끝내기 실패: ${e}`);
    }
  };

  // 상태 질문을 ASK_SEC 안에 안 누르면 무응답(null)으로 처리(C10). answer는 answered ref로 한 번만 돈다
  useEffect(() => {
    if (phase !== 'asking') return;
    const t = setTimeout(() => answer(null), ASK_SEC * 1000);
    return () => clearTimeout(t);
  });

  const recheckResponded = async () => {
    seq.current?.stop();
    restoreMediaVolume();
    if (recheckEventId.current) handleRecheck(recheckEventId.current, 'responded');
    await finishAlarm(null);
    setPhase('done');
  };

  const current = view[step];
  return (
    <View style={styles.container}>
      {phase === 'ringing' && (
        <>
          <Text style={styles.big}>⏰ {current ? `${step + 1}단계` : '안전장치'}</Text>
          {current && <Text style={styles.center}>{current.title}</Text>}
          <Button title="끄기" onPress={dismiss} />
          {current && <Button title="다음부터 이 소리 빼기" onPress={excludeCurrent} />}
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
      {phase === 'recheck' && (
        <>
          <Text style={styles.big}>일어나셨나요?</Text>
          <Button title="✋ 일어났어요" onPress={recheckResponded} />
        </>
      )}
      {phase === 'recheck_missed' && (
        <>
          <Text style={styles.big}>다시 잠드신 것 같아요</Text>
          <Button title="끄기" onPress={() => finishAlarm(null).then(() => setPhase('done'))} />
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
  center: { textAlign: 'center' },
  info: { fontSize: 12, color: '#555' },
});
