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
  dropExcludedFromPlan,
  eventIdOf,
  getLibrary,
  handleOutcome,
  handleRecheck,
  planForRinging,
  recordState,
  snooze,
  storesHydrated,
  takeSnooze,
  usePendingStore,
} from '@/stores/orchestrator';
import { getEvents } from '@/stores/event-store';
import { getSettings, updateSettings } from '@/stores/settings-store';
import type { PlayedStage, Stage, StateAnswer } from '@/types/contracts';

// 알람 울림 화면(C5 재생 순서, C6 판정, C12). 라우트 값은 라이브러리 알람 ID.
// 본 알람: 계획의 1→2→3단계를 stageSec씩 앱이 재생하고, 그동안 기본 알람음은 hold로 끈다. 다 지나면 hold를 풀어 안전장치.
// 안전장치가 maxSec 동안 울려도 못 끄면 gave_up(상태 질문 없음).
// 스누즈: snoozeMin 뒤 2단계부터 다시, snoozeCount가 maxSnooze를 넘으면 3단계부터. 같은 occurrence로 이어서 기록한다.
// 재확인(followUp): 1단계 소리를 작게 틀고 "일어났어요"를 기다린다. ASK_SEC 안에 안 누르면 응답 없음 → 기본 알람음.
const HOLD_SEC = 30;
const HOLD_RENEW_MS = 20_000;
const ASK_SEC = 60; // 상태 질문·재확인을 기다리는 시간 [가설](C10)

type Phase = 'loading' | 'ringing' | 'asking' | 'recheck' | 'recheck_missed' | 'done';
type PlannedStep = Step & { soundId: string; title: string };

export default function AlarmScreen() {
  const { alarmId: nativeId } = useLocalSearchParams<{ alarmId: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(0); // 단계 순번(0부터), 3이면 안전장치
  const [info, setInfo] = useState('');
  const [view, setView] = useState<PlannedStep[]>([]); // 화면에 보일 단계(steps ref와 같은 값)
  const seq = useRef<SequenceHandle | null>(null);
  const steps = useRef<PlannedStep[]>([]);
  const base = useRef(0); // 이번 울림이 시작한 단계 순번(스누즈 뒤 1 또는 2)
  const ring = useRef<{ alarmId: string; occurrenceAt: string } | null>(null);
  const recheckEventId = useRef<string | null>(null);
  const stepStartedAt = useRef(0);
  const played = useRef<PlayedStage[]>([]); // 끝난 구간(C6). 스누즈 전 구간 포함
  const snoozeCount = useRef(0);
  const finished = useRef(false);
  const phaseRef = useRef<Phase>('loading'); // 비동기 catch에서 읽는 울림 종류
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const currentIndex = () => base.current + (seq.current?.currentStep() ?? 0);
  // 끝나면 첫 화면으로. 재확인·스누즈가 다시 울릴 때 이 화면이 남아 있으면 새로 열리지 않기 때문(_layout)
  const leave = () => router.replace('/');

  // 지금 구간을 end로 닫아 played에 넣는다. i가 3 이상이면 안전장치
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

  const record = (dismissed: boolean) => {
    const { alarmId, occurrenceAt } = ring.current!;
    return handleOutcome({
      alarmId,
      occurrenceAt,
      endedAt: toIsoLocal(Date.now()),
      played: played.current,
      snoozeCount: snoozeCount.current,
      dismissed,
      backfilled: false,
    });
  };

  // 안전장치가 maxSec 동안 울렸는데 못 끔(C6 gave_up): 기록하고 알람을 끝낸다. 상태 질문은 하지 않는다
  const giveUp = async () => {
    if (finished.current) return;
    finished.current = true;
    closeStage(steps.current.length, 'gave_up');
    await record(false);
    await finishAlarm(null);
    leave();
  };

  useEffect(() => {
    let renew: ReturnType<typeof setInterval> | undefined;
    let cancelled = false; // await 사이에 화면이 닫히면 뒤에 만든 interval·재생·타이머가 남지 않게
    (async () => {
      await storesHydrated(); // 꺼진 앱이 알람으로 켜졌으면 계획·스누즈 상태를 다 읽은 뒤에
      const r = await ringingInfo(nativeId);
      if (cancelled) return;
      const plan = planForRinging(r.alarmId);
      const titleOf = (id: string) => getLibrary().sounds.find((s) => s.id === id)?.title ?? id;
      const toStep = (soundId: string, volume: number, seconds: number): PlannedStep => ({
        soundId,
        title: titleOf(soundId),
        source: soundAssets[soundId],
        volume,
        seconds,
      });
      ring.current = r;
      if (r.kind === 'snooze') {
        const s = takeSnooze(r.alarmId);
        if (s) {
          ring.current = { alarmId: r.alarmId, occurrenceAt: s.occurrenceAt }; // 처음 예약 시각 유지(C4)
          played.current = s.played;
          snoozeCount.current = s.snoozeCount;
        }
        base.current = snoozeCount.current > alarmConfig.maxSnooze ? 2 : 1;
      }
      recheckEventId.current = r.kind === 'recheck' ? (usePendingStore.getState().recheckEvent[r.alarmId] ?? null) : null;
      // 재확인은 방금 끈 울림의 1단계 소리로(대기 계획은 이미 다음 울림 것이라 쓰지 않는다)
      const first =
        getEvents().find((e) => e.eventId === recheckEventId.current)?.plan?.stages[0] ?? plan.stages[0];
      steps.current =
        r.kind === 'recheck'
          ? [toStep(first.soundId, Math.min(0.3, first.volume), ASK_SEC)]
          : plan.stages.map((s) => toStep(s.soundId, s.volume, alarmConfig.stageSec));
      setView(steps.current);
      setStep(base.current);
      stepStartedAt.current = Date.now(); // 첫 단계 콜백 전에 끄기를 눌러도 1970년이 기록되지 않게
      phaseRef.current = r.kind === 'recheck' ? 'recheck' : 'ringing';
      setPhase(phaseRef.current);

      const volume = raiseMediaVolume(); // hold 전에: 미디어 볼륨 0이면 앱 소리가 무음(I-1 확인 4)
      const held = await holdNativeRing(nativeId, HOLD_SEC);
      if (cancelled) return;
      setInfo(`${held ? '기본 알람음 hold 중' : '기본 알람음 hold 실패'} · 미디어 볼륨 ${volume}\n${plan.reason}`);
      renew = setInterval(() => {
        raiseMediaVolume(); // 잠결에 볼륨을 내렸으면 다시 올린다
        holdNativeRing(nativeId, HOLD_SEC);
      }, HOLD_RENEW_MS);
      const handle = await playSequence(steps.current.slice(base.current), (j) => {
        const i = base.current + j;
        if (j > 0 && r.kind !== 'recheck') closeStage(i - 1, 'next');
        stepStartedAt.current = Date.now();
        setStep(i);
        if (i >= steps.current.length) {
          clearInterval(renew);
          restoreMediaVolume(); // 안전장치는 알람 볼륨으로 울린다
          releaseNativeRing(nativeId);
          if (r.kind === 'recheck') {
            // 재확인에 응답 없음 → 다시 잠듦으로 기록하고 기본 알람음으로 깨운다(C5)
            if (recheckEventId.current) handleRecheck(recheckEventId.current, 'no_response');
            setPhase('recheck_missed');
          } else {
            giveUpTimer.current = setTimeout(giveUp, alarmConfig.maxSec * 1000);
          }
          setInfo('앱 소리 끝 → 기본 알람음');
        }
      });
      if (cancelled) handle.stop();
      else seq.current = handle;
    })().catch((e) => {
      // 소리 로드 실패 등: 앱 소리를 포기하고 기본 알람음(안전장치)으로. 알람은 실패해도 울려야 한다
      clearInterval(renew);
      restoreMediaVolume();
      releaseNativeRing(nativeId);
      if (cancelled) return;
      setInfo(`앱 소리 실패 → 기본 알람음: ${e}`);
      // 울림을 모르거나 재확인이면 끄기만(재확인은 gave_up 기록 대상이 아님)
      if (!ring.current || finished.current || phaseRef.current === 'recheck') return setPhase('recheck_missed');
      setStep(steps.current.length);
      stepStartedAt.current = Date.now();
      setPhase('ringing');
      giveUpTimer.current = setTimeout(giveUp, alarmConfig.maxSec * 1000);
    });
    return () => {
      cancelled = true;
      clearInterval(renew);
      clearTimeout(giveUpTimer.current);
      seq.current?.stop();
      restoreMediaVolume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeId]);

  const stopRinging = () => {
    clearTimeout(giveUpTimer.current);
    seq.current?.stop();
    restoreMediaVolume();
  };

  const dismiss = () => {
    closeStage(currentIndex(), 'dismissed');
    stopRinging();
    setPhase('asking');
  };

  const doSnooze = async () => {
    if (!ring.current) return;
    closeStage(currentIndex(), 'snoozed');
    stopRinging();
    snoozeCount.current += 1;
    finished.current = true;
    const { alarmId, occurrenceAt } = ring.current;
    await snooze(alarmId, { occurrenceAt, played: played.current, snoozeCount: snoozeCount.current });
    leave(); // 같은 화면이 열려 있으면 다시 울릴 때 새로 열리지 않는다(_layout)
  };

  const excludeCurrent = () => {
    const s = steps.current[currentIndex()];
    if (!s) return;
    updateSettings({ excluded: [...new Set([...getSettings().excluded, s.soundId])] });
    if (ring.current) dropExcludedFromPlan(ring.current.alarmId, ring.current.occurrenceAt); // 스누즈로 다시 울릴 때 안 나오게
    setInfo(`다음부터 "${s.title}"은(는) 쓰지 않아요`);
  };

  const answer = async (state: StateAnswer) => {
    if (finished.current || !ring.current) return;
    finished.current = true;
    setPhase('done');
    const { alarmId, occurrenceAt } = ring.current;
    try {
      await record(true);
      await recordState(eventIdOf(alarmId, occurrenceAt), state);
      leave(); // 첫 화면 카드에 다음 계획(소리 3개·이유)이 보인다
    } catch (e) {
      setInfo(`끝내기 실패: ${e}`);
    }
  };

  // 상태 질문을 ASK_SEC 안에 안 누르면 무응답(null)으로 처리(C10). answer는 finished ref로 한 번만 돈다
  useEffect(() => {
    if (phase !== 'asking') return;
    const t = setTimeout(() => answer(null), ASK_SEC * 1000);
    return () => clearTimeout(t);
    // 질문이 뜬 순간부터 한 번만 잰다(다른 렌더로 다시 시작하지 않게). answer는 finished ref로 한 번만 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const recheckResponded = async () => {
    stopRinging();
    if (recheckEventId.current) handleRecheck(recheckEventId.current, 'responded');
    await finishAlarm(null);
    leave();
  };

  const current = view[step];
  return (
    <View style={styles.container}>
      {phase === 'ringing' && (
        <>
          <Text style={styles.big}>⏰ {current ? `${step + 1}단계` : '안전장치'}</Text>
          {current && <Text style={styles.center}>{current.title}</Text>}
          <Button title="끄기" onPress={dismiss} />
          <Button title={`스누즈 ${alarmConfig.snoozeMin}분`} onPress={doSnooze} />
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
          <Text style={styles.big}>기본 알람음으로 깨워요</Text>
          <Button title="끄기" onPress={() => finishAlarm(null).then(leave)} />
        </>
      )}
      {phase === 'done' && <Text style={styles.center}>저장하는 중…</Text>}
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
