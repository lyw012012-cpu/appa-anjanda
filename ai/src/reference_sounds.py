"""기준·대조 합성 소리. 모두 44.1 kHz 모노 float32.

고정 기준(거슬림 0점·1점, 520 닮음)과 E2 대조 소리, 합성 모드 입력에 쓴다.
docs/context/pipeline-design.md 3절 ③·⑥.
"""

from collections.abc import Callable

import numpy as np
import scipy.signal as ss

SR = 44100


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def square(freq: float, sec: float = 3.0) -> np.ndarray:
    return ss.square(2 * np.pi * freq * _t(sec)).astype(np.float32)


def sine(freq: float, sec: float = 3.0) -> np.ndarray:
    return np.sin(2 * np.pi * freq * _t(sec)).astype(np.float32)


def chime(sec: float = 3.0) -> np.ndarray:
    """거슬림 0점: C5-E5-G5를 1초마다, 비조화 배음 + 감쇠 (프로토타입 proto_soft와 같은 식)."""
    t = _t(sec)
    f0 = np.array([523.25, 659.25, 783.99, 659.25])[(t // 1.0).astype(int) % 4]
    env = np.exp(-3 * (t % 1.0))
    partials = [(1, 1.0), (2.76, 0.3), (5.4, 0.1)]
    y = env * sum(a * np.sin(2 * np.pi * f0 * p * t) for p, a in partials)
    return (y / np.abs(y).max()).astype(np.float32)


def buzzer(sec: float = 3.0) -> np.ndarray:
    """거슬림 1점: 3 kHz 사각파를 70 Hz로 100% 진폭 변조."""
    t = _t(sec)
    return (ss.square(2 * np.pi * 3000 * t) * 0.5 * (1 + np.sin(2 * np.pi * 70 * t))).astype(np.float32)


def beep(freq: float = 520, on: float = 0.25, off: float = 0.25, sec: float = 3.0) -> np.ndarray:
    t = _t(sec)
    gate = (t % (on + off)) < on
    return (ss.square(2 * np.pi * freq * t) * gate).astype(np.float32)


def sweep(f0: float = 500, f1: float = 3000, sec: float = 3.0) -> np.ndarray:
    return ss.chirp(_t(sec), f0=f0, t1=sec, f1=f1, method="logarithmic").astype(np.float32)


def white_noise(sec: float = 3.0, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1, 1, int(sec * SR)).astype(np.float32)


E2_SOUNDS: dict[str, Callable[[], np.ndarray]] = {
    "square_520": lambda: square(520),
    "beep_520": lambda: beep(),
    "sweep_500_3000": lambda: sweep(),
    "sine_3100": lambda: sine(3100),
    "white_noise": lambda: white_noise(),
}
