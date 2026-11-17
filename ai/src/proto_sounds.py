"""프로토타입(I-1)용 합성 소리 2개를 만든다. 파이프라인 출력이 아니다(실제 소리 목록은 I-3).

    python -m src.proto_sounds ../app/assets/prototype
"""

import sys
from pathlib import Path

import numpy as np
import scipy.signal as ss
import soundfile as sf

SR = 44100


def soft_chime(sec: float = 4.0) -> np.ndarray:
    """부드러운 종소리: C5-E5-G5를 1초마다, 비조화 배음 + 감쇠."""
    t = np.arange(int(sec * SR)) / SR
    f0 = np.array([523.25, 659.25, 783.99, 659.25])[(t // 1.0).astype(int) % 4]
    env = np.exp(-3 * (t % 1.0))
    partials = [(1, 1.0), (2.76, 0.3), (5.4, 0.1)]
    return env * sum(a * np.sin(2 * np.pi * f0 * p * t) for p, a in partials)


def square_beep(sec: float = 4.0) -> np.ndarray:
    """대비 소리: 520 Hz 사각파 0.25초 삑 / 0.25초 쉼."""
    t = np.arange(int(sec * SR)) / SR
    gate = ((t % 0.5) < 0.25).astype(float)
    return ss.square(2 * np.pi * 520 * t) * gate


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, wave in [("proto_soft", soft_chime()), ("proto_beep", square_beep())]:
        sf.write(out / f"{name}.wav", (0.6 * wave / np.abs(wave).max()).astype(np.float32), SR, subtype="PCM_16")
        print(out / f"{name}.wav")
