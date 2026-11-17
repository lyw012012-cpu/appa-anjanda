"""파이프라인 검사. 기대값은 docs/context/pipeline-design.md 6절."""

import numpy as np
import pytest
import soundfile as sf

from src.build_sounds import (
    RAW0,
    RAW1,
    active_rms_db,
    f0_median,
    harshness,
    load_audio,
    normalize,
    pitch_from_f0,
    roughness,
    sharpness,
    sim520_hand,
    two_rates,
)
from src.reference_sounds import SR, beep, buzzer, chime, sine, square, white_noise


# ── ① 읽기·맞추기 ──


def test_loudness_ignores_gaps():
    a = normalize(beep(off=0.25), SR, "a")
    b = normalize(beep(off=1.0), SR, "b")
    assert abs(active_rms_db(a, SR) - active_rms_db(b, SR)) <= 0.5
    assert abs(active_rms_db(a, SR) - (-20)) <= 0.5


def test_peak_limited():
    y = normalize(square(520) * 0.01, SR, "x")
    assert 20 * np.log10(np.abs(y).max()) <= -1.0 + 1e-6


def test_trim_and_cut():
    y = np.concatenate([np.zeros(SR), sine(440, sec=40), np.zeros(SR)])
    out = normalize(y, SR, "x")
    assert len(out) <= 30 * SR
    assert np.abs(out[:100]).max() > 0


def test_normalize_silent_raises():
    with pytest.raises(ValueError, match="silent_x"):
        normalize(np.zeros(SR), SR, "silent_x")


def test_load_stereo_48k(tmp_path):
    t = np.arange(48000) / 48000
    sf.write(tmp_path / "s.wav", np.stack([np.sin(2 * np.pi * 440 * t)] * 2, 1), 48000, subtype="PCM_24")
    y, sr = load_audio(tmp_path / "s.wav")
    assert y.ndim == 1 and sr == 48000


def test_two_rates():
    hi, lo = two_rates(sine(440, sec=1.0), SR)
    assert len(hi) == SR and len(lo) == 16000


# ── ③ 음향 특징 ──


def prep(y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return two_rates(normalize(y, SR, "t"), SR)


def test_square_520():
    _, y16 = prep(square(520))
    f0 = f0_median(y16)
    assert abs(pitch_from_f0(f0) - 0.447) <= 0.01
    assert sim520_hand(y16, f0) >= 0.95


def test_sine_520():
    _, y16 = prep(sine(520))
    f0 = f0_median(y16)
    assert 0.4 <= sim520_hand(y16, f0) <= 0.6
    assert roughness(y16) <= 0.05


def test_square_3k():
    _, y16 = prep(square(3000))
    assert sim520_hand(y16, f0_median(y16)) <= 0.05


def test_white_noise():
    _, y16 = prep(white_noise())
    f0 = f0_median(y16)
    assert f0 is None and pitch_from_f0(f0) == 0.5 and sim520_hand(y16, f0) == 0


def test_harshness_anchors():
    assert abs(harshness(*prep(chime())) - 0) <= 1e-4
    assert abs(harshness(*prep(buzzer())) - 1) <= 1e-4
    assert RAW1 > RAW0


def test_sharpness_uses_full_band():
    y44, _ = prep(sine(10000))
    assert sharpness(y44) == 1.0
