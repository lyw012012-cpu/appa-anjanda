"""소리 수집(I-3) 검사. 네트워크 없이 돈다."""

import csv

import numpy as np
import pytest
import soundfile as sf

from src.build_sounds import read_csv
from src.collect_sounds import (
    CSV_COLUMNS,
    ENTRIES,
    SYNTH,
    Entry,
    arpeggio,
    clip,
    collect,
    normalize_license,
    pixabay_source,
    triple_beep,
    validate_entries,
    write_csv,
)
from src.reference_sounds import SR


def test_manifest_follows_c1():
    validate_entries(ENTRIES)
    assert 15 <= len(ENTRIES) <= 30
    # I-3 할 일은 4~6계열이지만, 2026-11-18 팀원 결정으로 자연음 없이 3계열(벨·멜로디·삑)로 간다.
    # 자연음을 더하면 4로 되돌린다. C1 규칙(계열마다 3개 이상·대표 1개)은 validate_entries가 본다
    assert 3 <= len({e.group for e in ENTRIES}) <= 6


def test_pixabay_source_from_file_name():
    assert pixabay_source("universfield-ringtone-065-496263.mp3") == ("Pixabay #496263 (URL 미확인)", "universfield")
    assert pixabay_source("dragon-studio-new-notification-3-398649.mp3")[1] == "dragon-studio"
    with pytest.raises(ValueError, match="Pixabay 파일 이름"):
        validate_entries((Entry("a", "x", "bell", local="no_number.mp3", rep=True),))


def test_local_files_get_pixabay_license(tmp_path):
    lib = tmp_path / "library"
    lib.mkdir()
    names = [f"universfield-note-{i}-10{i}.mp3" for i in range(3)]
    for n in names:
        sf.write(lib / n, np.sin(np.arange(SR) / SR * 2 * np.pi * 440).astype(np.float32), SR, format="MP3")
    es = tuple(Entry(f"s{i}", "x", "bell", local=n, rep=(i == 0)) for i, n in enumerate(names))
    rows = collect(es, tmp_path, offline=True)
    assert {r["license"] for r in rows} == {"Pixabay Content License"}
    assert rows[0]["source_url"] == "Pixabay #100 (URL 미확인)" and rows[0]["artist"] == "universfield"


def test_missing_local_file(tmp_path):
    es = tuple(Entry(f"s{i}", "x", "bell", local=f"a-b-{i}.mp3", rep=(i == 0)) for i in range(3))
    with pytest.raises(ValueError, match="파일 없음"):
        collect(es, tmp_path, offline=True)


@pytest.mark.parametrize(
    "bad, rule",
    [
        ((Entry("Bad-id", "x", "bell", rep=True),), "id 형식"),
        ((Entry("a", "x", "drums", rep=True),), "group 값"),
        ((Entry("a", "가" * 21, "bell", rep=True),), "title"),
        ((Entry("a", "x", "bell", "a.ogg", rep=True), Entry("b", "x", "bell", "b.ogg")), "3개 이상"),
    ],
)
def test_manifest_rejects(bad, rule):
    with pytest.raises(ValueError, match=rule):
        validate_entries(bad)


@pytest.mark.parametrize(
    "entry",
    [
        Entry("siren_fire", "소방차", "beep", "Fire.ogg"),
        Entry("tone", "재난 경보음", "beep", "Tone.ogg"),
        Entry("tone", "알림음", "beep", "Alarm Alert sound in United States 2025.opus"),
        Entry("tone", "알림음", "beep", "Civil-defense-siren-waver.ogg"),
    ],
)
def test_manifest_rejects_alert_and_siren(entry):
    with pytest.raises(ValueError, match="경보음·사이렌 금지"):
        validate_entries((entry,))


def test_one_rep_per_group():
    es = tuple(Entry(f"s{i}", "x", "bell", f"{i}.ogg", rep=True) for i in range(3))
    with pytest.raises(ValueError, match="대표"):
        validate_entries(es)


@pytest.mark.parametrize("name, ok", [("CC0", "CC0"), ("Public domain", "Public domain"),
                                      ("CC BY 4.0", "CC-BY-4.0"), ("CC BY-SA 4.0", None),
                                      ("CC BY-NC 4.0", None)])
def test_license_whitelist(name, ok):
    assert normalize_license(name) == ok


def test_synth_sounds_are_audible_and_short():
    for sid, make in SYNTH.items():
        y = make()
        assert y.dtype == np.float32 and 0 < np.abs(y).max() <= 1.0, sid
        assert len(y) / SR <= 30, sid


def test_triple_beep_pattern():
    y = triple_beep()
    on = np.abs(y[: int(1.2 * SR)]) > 0
    # 0.1초 삑 3번(켜진 비율 0.3초/1.2초 = 25%)
    assert abs(on.mean() - 0.25) < 0.01


def test_arpeggio_has_rests():
    y = arpeggio()
    frame = int(0.05 * SR)
    rms = np.sqrt([np.mean(y[i : i + frame] ** 2) for i in range(0, len(y) - frame, frame)])
    assert rms.min() < rms.max() * 0.1


def test_clip_limits_to_30s():
    y = np.ones(int(45 * SR), dtype=np.float32)
    assert len(clip(y, SR, 0.0)) == 30 * SR
    assert len(clip(y, SR, 20.0)) == 25 * SR


def test_synthetic_only_collect_writes_readable_csv(tmp_path):
    es = tuple(Entry(sid, sid, "melody", rep=(i == 0)) for i, sid in enumerate(SYNTH))
    rows = collect(es, tmp_path, offline=True)
    path = tmp_path / "sounds.csv"
    write_csv([{k: r[k] for k in CSV_COLUMNS} for r in rows], path)

    parsed = read_csv(path)  # 파이프라인의 C1 읽기 검사를 그대로 통과해야 함
    assert [r["id"] for r in parsed] == sorted(SYNTH)
    assert all(r["license"] == "자체 제작" and r["source_url"] == "-" for r in parsed)
    for r in parsed:
        y, sr = sf.read(tmp_path / "sounds" / r["file"])
        assert sr == SR and len(y) > 0
    with open(path, encoding="utf-8") as f:
        assert next(csv.reader(f)) == list(CSV_COLUMNS)


def test_offline_refuses_commons(tmp_path):
    es = tuple(Entry(f"s{i}", "x", "bell", f"{i}.ogg", rep=(i == 0)) for i in range(3))
    with pytest.raises(ValueError, match="오프라인"):
        collect(es, tmp_path, offline=True)
