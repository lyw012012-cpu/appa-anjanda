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
    sim520_emb,
    sim520_mel,
    sharpness,
    sim520_hand,
    two_rates,
    yamnet_embed,
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


# ── ②④ YAMNet ──


@pytest.mark.yamnet
def test_embed_shape_norm():
    emb, top3 = yamnet_embed(prep(square(520))[1])
    assert emb.shape == (1024,) and abs(np.linalg.norm(emb) - 1) <= 1e-3 and len(top3) == 3


@pytest.mark.yamnet
def test_embed_short_sound():
    emb, _ = yamnet_embed(prep(beep(sec=0.3))[1])
    assert emb.shape == (1024,) and abs(np.linalg.norm(emb) - 1) <= 1e-3


@pytest.mark.yamnet
def test_sim520_self():
    _, y16 = prep(square(520))
    assert sim520_emb(yamnet_embed(y16)[0]) >= 0.99 and sim520_mel(y16) >= 0.99


# ── ⑤⑦ 목록 읽기·검사·쓰기 ──

import json  # noqa: E402

import src.build_sounds as bs  # noqa: E402

HEADER = "id,file,title,group,group_rep,license,source_url\n"


@pytest.fixture
def fake_yamnet(monkeypatch):
    """YAMNet 대신 소리마다 정해지는 가짜 임베딩(1024칸, 노름 1)."""

    def fake(y16):
        v = np.zeros(1024)
        v[:64] = np.abs(bs.mel_profile(y16))
        v[-1] = 1.0
        return v / np.linalg.norm(v), ["a", "b", "c"]

    bs._ref520_emb.cache_clear()
    monkeypatch.setattr(bs, "yamnet_embed", fake)
    yield
    bs._ref520_emb.cache_clear()


def snd(sid: str, group: str = "beep", rep: bool = True) -> dict:
    e = [0.0] * 1024
    e[0] = 1.0
    return {
        "id": sid, "file": f"{sid}.mp3", "title": sid, "group": group, "groupRep": rep,
        "license": "CC0", "sourceUrl": "-", "durationSec": 3.0, "embedding": e,
        "sim520": {"emb": 0.5, "mel": 0.5, "hand": 0.5}, "pitch": 0.5, "harshness": 0.5, "top3": [],
    }


def lib_of(*sounds: dict) -> dict:
    return {
        "schemaVersion": 2, "generatedAt": "2026-11-18T07:00:00+09:00",
        "model": {"space": "yamnet", "embeddingDim": 1024, "simMedian": bs.SIM_ZERO}, "sounds": list(sounds),
    }


def row(sid: str, group: str = "beep", rep: str = "1") -> dict:
    return {"id": sid, "file": f"{sid}.wav", "title": sid, "group": group,
            "group_rep": rep, "license": "CC0", "source_url": "-"}


def test_read_csv_bom(tmp_path):
    p = tmp_path / "sounds.csv"
    p.write_text(HEADER + "bell_01,bell.wav,종소리,bell,1,CC0,-\n", encoding="utf-8-sig")
    rows = bs.read_csv(p)
    assert rows[0]["id"] == "bell_01" and rows[0]["title"] == "종소리"


def test_read_csv_license_blank(tmp_path):
    p = tmp_path / "sounds.csv"
    p.write_text(HEADER + "bell_01,bell.wav,종소리,bell,1,,-\n", encoding="utf-8")
    with pytest.raises(ValueError, match="bell_01"):
        bs.read_csv(p)


def test_validate_ok():
    bs.validate_library(lib_of(snd("a")), synthetic=True)


def test_validate_hyphen_id():
    with pytest.raises(ValueError, match="소리 ID 형식: bell-01"):
        bs.validate_library(lib_of(snd("bell-01")), synthetic=True)


def test_validate_bad_norm():
    s = snd("a")
    s["embedding"][0] = 1.01
    with pytest.raises(ValueError, match="a"):
        bs.validate_library(lib_of(s), synthetic=True)


def test_validate_duplicate_id():
    with pytest.raises(ValueError, match="중복"):
        bs.validate_library(lib_of(snd("a"), snd("a", rep=False)), synthetic=True)


def test_validate_group_size_real_only():
    lib = lib_of(snd("a"))
    bs.validate_library(lib, synthetic=True)
    with pytest.raises(ValueError, match="계열"):
        bs.validate_library(lib, synthetic=False)


def test_build_sorted(fake_yamnet):
    items = [(row("c", rep="1"), sine(440), SR), (row("a", rep="0"), sine(660), SR), (row("b", rep="0"), sine(880), SR)]
    lib, waves = bs.build(items, synthetic=True)
    assert [s["id"] for s in lib["sounds"]] == ["a", "b", "c"] and set(waves) == {"a", "b", "c"}


def test_fixed_reference(fake_yamnet):
    base = [(row("a"), square(520), SR), (row("b", rep="0"), sine(700), SR), (row("c", "melody", "1"), chime(), SR)]
    lib3, _ = bs.build(base, synthetic=True)
    lib4, _ = bs.build(base + [(row("d", rep="0"), square(3000), SR)], synthetic=True)
    keys = ("pitch", "harshness", "sim520")
    before = {s["id"]: {k: s[k] for k in keys} for s in lib3["sounds"]}
    after = {s["id"]: {k: s[k] for k in keys} for s in lib4["sounds"] if s["id"] != "d"}
    assert before == after and lib3["model"]["simMedian"] == lib4["model"]["simMedian"] == bs.SIM_ZERO


def test_invalid_writes_nothing(tmp_path, fake_yamnet):
    (tmp_path / "sounds").mkdir()
    sf.write(tmp_path / "sounds" / "bad.wav", sine(440), SR)
    (tmp_path / "sounds.csv").write_text(HEADER + "bell-01,bad.wav,나쁨,beep,1,CC0,-\n", encoding="utf-8")
    app = tmp_path / "app"
    assert bs.main(["--csv", str(tmp_path / "sounds.csv"), "--app", str(app)]) != 0
    assert not app.exists() or not any(app.rglob("*"))


def test_synthetic_goes_to_out(tmp_path, fake_yamnet, monkeypatch):
    monkeypatch.setattr(bs, "AI_DIR", tmp_path)
    app = tmp_path / "app"
    assert bs.main(["--synthetic", "--app", str(app)]) == 0
    assert not app.exists()
    lib = json.loads((tmp_path / "out" / "src" / "data" / "sounds.json").read_text(encoding="utf-8"))
    assert [s["id"] for s in lib["sounds"]] == sorted(s["id"] for s in lib["sounds"])
    ts = (tmp_path / "out" / "src" / "data" / "sound-assets.ts").read_text(encoding="utf-8")
    assert "square_520: require('../../assets/sounds/square_520.mp3')" in ts


def test_mp3_size(tmp_path):
    s = snd("s")
    bs.write_outputs(lib_of(s), {"s": sine(440, sec=30)}, tmp_path)
    size = (tmp_path / "assets" / "sounds" / "s.mp3").stat().st_size
    assert abs(size - 240_000) <= 24_000
