"""오프라인 파이프라인: sounds.csv + 원본 → sounds.json · mp3 · sound-assets.ts · 보고서.

    cd ai && python -m src.build_sounds --csv data/sounds.csv --app ../app
    cd ai && python -m src.build_sounds --synthetic      # 출력은 ai/out/

설계: docs/context/pipeline-design.md. 계약: docs/context/contracts.md C1~C4.
"""

from pathlib import Path

import librosa
import numpy as np
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
