"""알람 소리에서 특징(MFCC, 스펙트럼, 음량 포락선)을 뽑는 모듈.

예시:
    python -m src.features path/to/alarm.wav
"""

import sys

import librosa
import numpy as np


def extract_features(path: str, sr: int = 22050) -> dict[str, np.ndarray]:
    y, sr = librosa.load(path, sr=sr, mono=True)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
    rms = librosa.feature.rms(y=y)[0]
    return {
        "mfcc_mean": mfcc.mean(axis=1),
        "mel_db": librosa.power_to_db(mel, ref=np.max),
        "rms_envelope": rms,
    }


if __name__ == "__main__":
    feats = extract_features(sys.argv[1])
    for name, value in feats.items():
        print(name, value.shape)
