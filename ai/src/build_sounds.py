"""오프라인 파이프라인: sounds.csv + 원본 → sounds.json · mp3 · sound-assets.ts · 보고서.

    cd ai && python -m src.build_sounds --csv data/sounds.csv --app ../app
    cd ai && python -m src.build_sounds --synthetic      # 출력은 ai/out/

설계: docs/context/pipeline-design.md. 계약: docs/context/contracts.md C1~C4.
"""

import csv
import functools
import os
from pathlib import Path

import librosa
import numpy as np
import scipy.signal as ss
import soundfile as sf

SR_HI = 44100  # 앱 파일, 날카로움
SR_LO = 16000  # YAMNet, 음높이, 거칠기, 520 닮음
TARGET_RMS_DB = -20.0
PEAK_DB = -1.0
MAX_SEC = 30.0
FADE_SEC = 0.05
GATE_DB = 40.0  # 최대 프레임보다 이만큼 넘게 작은 프레임은 "소리 없음"


# ── ① 읽기·맞추기 ──


def load_audio(path: Path) -> tuple[np.ndarray, int]:
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    return y.mean(axis=1), sr


def _frame_rms(y: np.ndarray, sr: int) -> np.ndarray:
    n = max(1, int(0.02 * sr))
    return librosa.feature.rms(y=y, frame_length=n * 2, hop_length=n, center=False)[0]


def active_rms_db(y: np.ndarray, sr: int) -> float:
    rms = _frame_rms(y, sr)
    active = rms[rms >= rms.max() * 10 ** (-GATE_DB / 20)]
    return float(20 * np.log10(np.sqrt(np.mean(active**2))))


def normalize(y: np.ndarray, sr: int, sound_id: str) -> np.ndarray:
    y = np.asarray(y, dtype=np.float32)
    if not np.any(y):
        raise ValueError(f"{sound_id}: 소리가 없음")
    # 앞뒤 무음만 자른다(표본 단위). 삑-쉼 사이 쉼은 그대로 둔다
    loud = np.flatnonzero(np.abs(y) >= np.abs(y).max() * 10 ** (-GATE_DB / 20))
    y = y[loud[0] : loud[-1] + 1]
    if len(y) > MAX_SEC * sr:
        y = y[: int(MAX_SEC * sr)].copy()
        fade = int(FADE_SEC * sr)
        y[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    y = y * 10 ** ((TARGET_RMS_DB - active_rms_db(y, sr)) / 20)
    peak_db = 20 * np.log10(np.abs(y).max())
    if peak_db > PEAK_DB:
        y = y * 10 ** ((PEAK_DB - peak_db) / 20)
    return y.astype(np.float32)


def two_rates(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    hi = y if sr == SR_HI else librosa.resample(y, orig_sr=sr, target_sr=SR_HI)
    lo = librosa.resample(y, orig_sr=sr, target_sr=SR_LO)
    return hi.astype(np.float32), lo.astype(np.float32)


# ── ③ 음향 특징 (고정 기준) ──

PITCH_LO, PITCH_HI = 100.0, 4000.0  # 음높이 눈금
SHARP_LO, SHARP_HI = 100.0, 8000.0  # 날카로움 눈금
VOICED_MIN = 0.3  # 소리 나는 프레임 중 기본음이 잡힌 비율이 이보다 작으면 "기본음 없음"
NEAR_SIGMA = 0.273  # 400·650 Hz에서 가까움 0.5
HARMONIC_MIN = 0.01  # 배음 에너지가 기본음의 1% 미만이면 "배음 없음"


def _log_scale(f: float, lo: float, hi: float) -> float:
    return float(np.clip((np.log2(f) - np.log2(lo)) / (np.log2(hi) - np.log2(lo)), 0, 1))


def _active_frames(y: np.ndarray, sr: int, hop: int) -> np.ndarray:
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    return rms >= rms.max() * 10 ** (-GATE_DB / 20)


def f0_median(y16: np.ndarray) -> float | None:
    f0, voiced, _ = librosa.pyin(y16, fmin=65, fmax=4200, sr=SR_LO)
    active = _active_frames(y16, SR_LO, 512)[: len(voiced)]
    hit = voiced[: len(active)] & active
    if hit.sum() < VOICED_MIN * max(1, active.sum()):
        return None
    return float(np.median(f0[hit]))


def pitch_from_f0(f0: float | None) -> float:
    return 0.5 if f0 is None else _log_scale(f0, PITCH_LO, PITCH_HI)


def sharpness(y44: np.ndarray) -> float:
    cent = librosa.feature.spectral_centroid(y=y44, sr=SR_HI)[0]
    active = _active_frames(y44, SR_HI, 512)[: len(cent)]
    return _log_scale(float(np.median(cent[active])), SHARP_LO, SHARP_HI)


def roughness(y16: np.ndarray) -> float:
    env = ss.resample_poly(np.abs(ss.hilbert(y16)), 1, 8)  # 2 kHz
    band = ss.sosfiltfilt(ss.butter(4, [15, 300], btype="bandpass", fs=2000, output="sos"), env)
    return float(np.clip(np.sqrt(2) * np.sqrt(np.mean(band**2)) / env.mean(), 0, 1))


def _harshness_raw(y44: np.ndarray, y16: np.ndarray) -> float:
    return 0.5 * sharpness(y44) + 0.5 * roughness(y16)


# 기준 소리의 원점수. 다시 계산:
# python -c "import src.build_sounds as b; from src.reference_sounds import *; [print(round(b._harshness_raw(*b.two_rates(b.normalize(f(), SR, 'x'), SR)), 6)) for f in (chime, buzzer)]"
RAW0 = 0.379066  # 차임 = 0점
RAW1 = 1.0  # 버저 = 1점 (날카로움·거칠기 모두 눈금 끝)


def harshness(y44: np.ndarray, y16: np.ndarray) -> float:
    return float(np.clip((_harshness_raw(y44, y16) - RAW0) / (RAW1 - RAW0), 0, 1))


def sim520_hand(y16: np.ndarray, f0: float | None) -> float:
    if f0 is None:
        return 0.0
    near = np.exp(-(np.log2(f0 / 520) ** 2) / (2 * NEAR_SIGMA**2))
    spec = np.abs(np.fft.rfft(y16 * np.hanning(len(y16))))
    freqs = np.fft.rfftfreq(len(y16), 1 / SR_LO)
    ks = [k for k in range(1, 10) if k * f0 * 1.03 < SR_LO / 2]
    amp = np.array([spec[(freqs >= k * f0 * 0.97) & (freqs <= k * f0 * 1.03)].max() for k in ks])
    ref = np.array([1 / k if k % 2 else 0.0 for k in ks])
    a, r = amp[1:], ref[1:]
    if np.sum(a**2) < HARMONIC_MIN * amp[0] ** 2 or not np.any(r):
        c = 0.0
    else:
        c = float(a @ r / (np.linalg.norm(a) * np.linalg.norm(r)))
    return float(near * (0.5 + 0.5 * c))


# ── ②④ YAMNet, 520 닮음 비교값 ──

AI_DIR = Path(__file__).resolve().parents[1]
YAMNET_URL = "https://tfhub.dev/google/yamnet/1"


@functools.cache
def _yamnet():
    os.environ.setdefault("TFHUB_CACHE_DIR", str(AI_DIR / "models"))
    import tensorflow_hub as hub  # 느린 import라 처음 쓸 때만

    model = hub.load(YAMNET_URL)
    with open(model.class_map_path().numpy().decode()) as f:
        names = [row["display_name"] for row in csv.DictReader(f)]
    return model, names


def yamnet_embed(y16: np.ndarray) -> tuple[np.ndarray, list[str]]:
    model, names = _yamnet()
    scores, emb, _ = model(y16.astype(np.float32))
    v = emb.numpy().mean(axis=0)
    top = np.argsort(scores.numpy().mean(axis=0))[::-1][:3]
    return v / np.linalg.norm(v), [names[i] for i in top]


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(max(0.0, a @ b / (np.linalg.norm(a) * np.linalg.norm(b))))


@functools.cache
def _ref520_y16() -> np.ndarray:
    from src.reference_sounds import SR, square

    return two_rates(normalize(square(520), SR, "ref_520"), SR)[1]


@functools.cache
def _ref520_emb() -> np.ndarray:
    return yamnet_embed(_ref520_y16())[0]


def sim520_emb(emb: np.ndarray) -> float:
    return _cos(emb, _ref520_emb())


def mel_profile(y16: np.ndarray) -> np.ndarray:
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y16, sr=SR_LO, n_mels=64)).mean(axis=1)
    return mel - mel.mean()


def sim520_mel(y16: np.ndarray) -> float:
    return _cos(mel_profile(y16), mel_profile(_ref520_y16()))
