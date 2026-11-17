"""파이프라인 검사. 기대값은 docs/context/pipeline-design.md 6절."""

import numpy as np
import pytest
import soundfile as sf

from src.build_sounds import active_rms_db, load_audio, normalize, two_rates
from src.reference_sounds import SR, beep, sine, square


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
