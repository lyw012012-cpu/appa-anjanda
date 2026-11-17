"""오프라인 파이프라인: sounds.csv + 원본 → sounds.json · mp3 · sound-assets.ts · 보고서.

    cd ai && python -m src.build_sounds --csv data/sounds.csv --app ../app
    cd ai && python -m src.build_sounds --synthetic      # 출력은 ai/out/

설계: docs/context/pipeline-design.md. 계약: docs/context/contracts.md C1~C4.
"""

import argparse
import csv
import io
import json
import re
import sys
from datetime import datetime
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
MIN_SEC = 0.1  # 앞뒤 무음을 자른 뒤 이보다 짧으면 거부
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
    if len(y) < MIN_SEC * sr:
        raise ValueError(f"{sound_id}: 소리가 너무 짧음({len(y) / sr:.3f}초, 앞뒤 −40 dB 무음을 자른 뒤 {MIN_SEC}초 미만)")
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
    def peak(f: float) -> float:
        band = spec[(freqs >= f * 0.97) & (freqs <= f * 1.03)]
        # 짧은 소리는 ±3% 대역이 주파수 칸 하나보다 좁을 수 있어 가장 가까운 칸을 쓴다
        return float(band.max()) if band.size else float(spec[np.argmin(np.abs(freqs - f))])

    amp = np.array([peak(k * f0) for k in ks])
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


# ── ⑤ 목록 만들기·검사 (C1·C2) ──

SIM_ZERO = 0.58  # 유사도 영점. PR #7 6.2 합성 소리 36쌍의 중앙값. I-3 뒤 한 번만 갱신(설계 3절 ⑤)
GROUPS = {"bell", "melody", "beep", "nature", "voice", "other"}
ID_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
EMB_DIM = 1024


CSV_COLUMNS = ("id", "file", "title", "group", "group_rep", "license", "source_url")


def read_csv(csv_path: Path) -> list[dict]:
    try:
        with open(csv_path, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            columns = reader.fieldnames or []
    except UnicodeDecodeError as e:
        raise ValueError(f"{csv_path.name}: UTF-8로 저장해야 함(엑셀은 'CSV UTF-8'로 저장)") from e
    missing = [c for c in CSV_COLUMNS if c not in columns]
    if missing:
        raise ValueError(f"{csv_path.name}: 열 없음 {', '.join(missing)}")
    for r in rows:
        if not (r.get("license") or "").strip():
            raise ValueError(f"라이선스 빈칸: {r.get('id')}")
    return rows


def synthetic_rows() -> list[tuple[dict, np.ndarray, int]]:
    from src.reference_sounds import E2_SOUNDS, SR, chime

    sounds = {**E2_SOUNDS, "chime": chime}
    groups = {"chime": "melody", "white_noise": "other"}
    seen: set[str] = set()
    items = []
    for sid, make in sounds.items():
        group = groups.get(sid, "beep")
        row = {"id": sid, "file": f"{sid}.wav", "title": sid, "group": group,
               "group_rep": "0" if group in seen else "1", "license": "자체 제작", "source_url": "-"}
        seen.add(group)
        items.append((row, make(), SR))
    return items


def analyze(row: dict, y: np.ndarray, sr: int) -> tuple[dict, np.ndarray]:
    sid = row["id"]
    y44, y16 = two_rates(normalize(y, sr, sid), sr)
    f0 = f0_median(y16)
    emb, top3 = yamnet_embed(y16)
    r4 = lambda v: round(float(v), 4)  # noqa: E731  0~1 점수는 소수 4자리(contracts 1절)
    sound = {
        "id": sid,
        "file": f"{sid}.mp3",
        "title": row["title"],
        "group": row["group"],
        "groupRep": row["group_rep"].strip() == "1",
        "license": row["license"].strip(),
        "sourceUrl": row["source_url"].strip(),
        "durationSec": round(len(y44) / SR_HI, 3),
        "embedding": [round(float(v), 5) for v in emb],
        "sim520": {"emb": r4(sim520_emb(emb)), "mel": r4(sim520_mel(y16)), "hand": r4(sim520_hand(y16, f0))},
        "pitch": r4(pitch_from_f0(f0)),
        "harshness": r4(harshness(y44, y16)),
        "top3": top3,
    }
    return sound, y44


def validate_library(lib: dict, synthetic: bool) -> None:
    def fail(rule: str, sid: str) -> None:
        raise ValueError(f"{rule}: {sid}")

    sounds = lib["sounds"]
    if not sounds:
        fail("소리 1개 이상", "-")
    if not 0 <= lib["model"]["simMedian"] < 1:
        fail("simMedian 범위", "-")
    ids = [s["id"] for s in sounds]
    by_group: dict[str, list[dict]] = {}
    for s in sounds:
        sid = s["id"]
        if not ID_RE.match(sid):
            fail("소리 ID 형식", sid)
        if ids.count(sid) > 1:
            fail("소리 ID 중복", sid)
        if s["group"] not in GROUPS:
            fail("계열 이름", sid)
        if len(s["embedding"]) != lib["model"]["embeddingDim"]:
            fail("임베딩 길이", sid)
        if abs(np.linalg.norm(s["embedding"]) - 1) > 1e-3:
            fail("임베딩 L2 노름", sid)
        for v in (*s["sim520"].values(), s["pitch"], s["harshness"]):
            if not 0 <= v <= 1:
                fail("0~1 범위", sid)
        if s["durationSec"] <= 0:
            fail("길이", sid)
        if s["file"] != f"{sid}.mp3":
            fail("파일 이름", sid)
        if not s["license"]:
            fail("라이선스", sid)
        by_group.setdefault(s["group"], []).append(s)
    if ids != sorted(ids):
        fail("id 오름차순", ids[0])
    for g, members in by_group.items():
        if sum(m["groupRep"] for m in members) != 1:
            fail("계열 대표 1개", g)
        if not synthetic and len(members) < 3:
            fail("계열마다 3개 이상", g)


def build(items: list[tuple[dict, np.ndarray, int]], synthetic: bool) -> tuple[dict, dict[str, np.ndarray]]:
    sounds, waves = [], {}
    for row, y, sr in sorted(items, key=lambda it: it[0]["id"]):
        try:
            sound, y44 = analyze(row, y, sr)
        except Exception as e:  # 어느 소리에서 났는지 붙여 다시 던진다
            msg = str(e)
            raise ValueError(msg if msg.startswith(f"{row['id']}:") else f"{row['id']}: {msg}") from e
        sounds.append(sound)
        waves[sound["id"]] = y44
    lib = {
        "schemaVersion": 2,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "model": {"space": "yamnet", "embeddingDim": EMB_DIM, "simMedian": SIM_ZERO},
        "sounds": sounds,
    }
    validate_library(lib, synthetic)
    return lib, waves


# ── ⑦ 쓰기 (C2·C3) ──

MP3_LEVEL = 0.889  # soundfile compression_level → 모노 44.1 kHz에서 약 64 kbps 고정
MAX_TOTAL_BYTES = 10 * 1024 * 1024


def _mp3_bytes(y44: np.ndarray) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, y44, SR_HI, format="MP3", bitrate_mode="CONSTANT", compression_level=MP3_LEVEL)
    return buf.getvalue()


def write_outputs(lib: dict, waves: dict[str, np.ndarray], root: Path) -> None:
    mp3 = {sid: _mp3_bytes(y) for sid, y in waves.items()}
    total = sum(map(len, mp3.values()))
    if total > MAX_TOTAL_BYTES:
        raise ValueError(f"소리 파일 전체 10 MB 초과: {total / 1e6:.1f} MB")
    data, sounds_dir = root / "src" / "data", root / "assets" / "sounds"
    data.mkdir(parents=True, exist_ok=True)
    sounds_dir.mkdir(parents=True, exist_ok=True)
    for old in sounds_dir.glob("*.mp3"):  # 목록에서 빠진 소리의 파일은 지운다(파이프라인 출력 폴더)
        if old.stem not in mp3:
            old.unlink()
    for sid, b in mp3.items():
        (sounds_dir / f"{sid}.mp3").write_bytes(b)
    (data / "sounds.json").write_text(json.dumps(lib, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"  {s['id']}: require('../../assets/sounds/{s['id']}.mp3')," for s in lib["sounds"]]
    (data / "sound-assets.ts").write_text(
        "// 생성 파일: ai/src/build_sounds.py가 만든다. 손으로 고치지 않는다(M5).\n"
        "import type { SoundId } from '@/types/contracts';\n\n"
        "export const soundAssets: Record<SoundId, number> = {\n" + "\n".join(lines) + "\n};\n",
        encoding="utf-8",
    )


# ── ⑥ 보고 (ai/reports/) ──

CONTRAST_MAX_SIM = 0.5  # C9 contrastMaxSim 기본값. 2단계 후보 수 계산용


def e2_scores() -> dict[str, dict[str, float]]:
    from src.reference_sounds import E2_SOUNDS, SR

    out = {}
    for sid, make in E2_SOUNDS.items():
        _, y16 = two_rates(normalize(make(), SR, sid), SR)
        out[sid] = {"emb": sim520_emb(yamnet_embed(y16)[0]), "mel": sim520_mel(y16), "hand": sim520_hand(y16, f0_median(y16))}
    return out


def write_report(lib: dict, report_dir: Path, e2: dict[str, dict[str, float]]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    report_dir.mkdir(parents=True, exist_ok=True)
    sounds = lib["sounds"]
    ids = [s["id"] for s in sounds]
    emb = np.array([s["embedding"] for s in sounds])
    dots = np.clip(emb @ emb.T, 0, None)
    iu = np.triu_indices(len(ids), 1)
    pairs = dots[iu]
    zeroed = np.clip((dots - SIM_ZERO) / (1 - SIM_ZERO), 0, 1)
    candidates = {sid: int(sum(zeroed[i, j] <= CONTRAST_MAX_SIM for j in range(len(ids)) if j != i)) for i, sid in enumerate(ids)}
    pitch = np.array([s["pitch"] for s in sounds])
    hand = np.array([s["sim520"]["hand"] for s in sounds])
    r = float(np.corrcoef(pitch, hand)[0, 1]) if len(ids) > 2 and pitch.std() > 0 and hand.std() > 0 else float("nan")

    fig, ax = plt.subplots(figsize=(6, 3.5))
    ax.hist(pairs, bins=20, range=(0, 1))
    ax.axvline(SIM_ZERO, color="red", label=f"zero {SIM_ZERO}")
    ax.set_xlabel("max(0, dot) of distinct pairs")
    ax.legend()
    fig.tight_layout()
    fig.savefig(report_dir / "cos_hist.png", dpi=100)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(5, 4))
    ax.scatter(pitch, hand)
    for sid, x, y in zip(ids, pitch, hand):
        ax.annotate(sid, (x, y), fontsize=7)
    ax.set_xlabel("pitch")
    ax.set_ylabel("sim520.hand")
    fig.tight_layout()
    fig.savefig(report_dir / "pitch_vs_hand.png", dpi=100)
    plt.close(fig)

    md = ["# 파이프라인 보고서", "", f"생성 {lib['generatedAt']} · 소리 {len(ids)}개 · 영점 {SIM_ZERO}", ""]
    if not np.isnan(r) and abs(r) > 0.7:
        md += [f"> ⚠️ R10: pitch와 sim520.hand의 상관 r = {r:.2f} (|r| > 0.7). 팀에 알리고 특징 하나를 뺄지 I-13에서 판단", ""]
    md += ["## 유사도", "", f"- 서로 다른 쌍의 max(0, 내적) 중앙값: {np.median(pairs):.4f}" if len(pairs) else "- 쌍 없음",
           "- 분포: ![cos_hist](cos_hist.png)", "", "### 2단계 후보 수", "",
           f"영점 조정한 유사도가 {CONTRAST_MAX_SIM} 이하인 다른 소리의 수. 0이면 그 소리 다음에 대비 단계가 조건을 푼다.", "",
           "| 소리 | 2단계 후보 |", "|---|---|", *[f"| {k} | {v} |" for k, v in candidates.items()], "",
           "## pitch–sim520.hand (R10)", "", f"- 상관 r = {r:.2f}", "- 산점도: ![pitch_vs_hand](pitch_vs_hand.png)", "",
           "## E2: 520 Hz 닮음 방식별 순위", "", "| 순위 | emb | mel | hand |", "|---|---|---|---|"]
    ranked = {m: sorted(e2, key=lambda k: -e2[k][m]) for m in ("emb", "mel", "hand")}
    for i in range(len(e2)):
        md.append(f"| {i + 1} | " + " | ".join(f"{ranked[m][i]} ({e2[ranked[m][i]][m]:.2f})" for m in ("emb", "mel", "hand")) + " |")
    md += ["", "## 소리별 특징", "", "| 소리 | 계열 | pitch | harshness | hand | emb | mel | top3 |", "|---|---|---|---|---|---|---|---|"]
    for s in sounds:
        md.append(f"| {s['id']} | {s['group']} | {s['pitch']} | {s['harshness']} | {s['sim520']['hand']} | "
                  f"{s['sim520']['emb']} | {s['sim520']['mel']} | {', '.join(s['top3'])} |")
    (report_dir / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="sounds.csv + 원본 → sounds.json · mp3 · sound-assets.ts")
    p.add_argument("--csv", type=Path, default=AI_DIR / "data" / "sounds.csv")
    p.add_argument("--app", type=Path, default=AI_DIR.parent / "app")
    p.add_argument("--synthetic", action="store_true", help="합성 소리로 실행. 출력은 ai/out/")
    args = p.parse_args(argv)
    try:
        if args.synthetic:
            items, root = synthetic_rows(), AI_DIR / "out"
        else:
            sounds_dir = args.csv.parent / "sounds"
            items = []
            for r in read_csv(args.csv):
                try:
                    items.append((r, *load_audio(sounds_dir / r["file"])))
                except Exception as e:
                    raise ValueError(f"{r['id']}: 읽기 실패({r['file']}): {e}") from e
            root = args.app
        lib, waves = build(items, args.synthetic)
        write_outputs(lib, waves, root)
        write_report(lib, AI_DIR / "reports", e2_scores())
    except ValueError as e:
        print(f"실패 — {e}", file=sys.stderr)
        return 1
    print(f"소리 {len(lib['sounds'])}개 → {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
