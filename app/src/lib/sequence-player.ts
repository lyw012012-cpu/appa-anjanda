import { createAudioPlayer, setAudioModeAsync, type AudioSource } from 'expo-audio';

// 알람 한 번 안에서 소리를 단계별로 바꿔 튼다 (ai-design.md 7.7). 프로토타입이라 단계는 호출하는 쪽이 정한다.

export type Step = { source: AudioSource; volume: number; seconds: number };

export type SequenceHandle = {
  /** 지금 몇 번째 단계인가(0부터). 모든 단계가 끝났으면 steps.length */
  currentStep: () => number;
  stop: () => void;
};

export async function playSequence(
  steps: Step[],
  onStep: (index: number) => void,
): Promise<SequenceHandle> {
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
  const player = createAudioPlayer(null);
  player.loop = true;
  let index = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const next = () => {
    if (stopped) return;
    index += 1;
    onStep(index);
    if (index >= steps.length) {
      player.pause();
      return;
    }
    const step = steps[index];
    player.replace(step.source);
    player.volume = step.volume;
    player.play();
    timer = setTimeout(next, step.seconds * 1000);
  };
  next();

  return {
    currentStep: () => index,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      player.pause();
      player.remove();
    },
  };
}
