"""I-3 소리 목록 수집: 목록 → 원본 내려받기·합성 → ai/data/sounds.csv + 출처 표.

    cd ai && python -m src.collect_sounds            # 받은 파일은 다시 받지 않는다
    cd ai && python -m src.build_sounds --csv data/sounds.csv --app ../app

- 외부 소리는 Wikimedia Commons에서만 가져온다. 라이선스는 실행할 때마다 Commons API로 다시 읽고,
  ALLOWED_LICENSES 밖이면(예: CC BY-SA — 앱에 넣으면 같은 조건 공유 의무) 그 id를 적고 멈춘다.
- 모자란 계열은 합성음(자체 제작)으로 채운다.
- 원본(ai/data/)은 git 제외(contracts C1). 커밋하는 것은 이 목록과 ai/reports/sound_credits.md뿐이다.
- group은 제목으로 붙인 초안이다. 사람이 듣고 확인한다(C1).
"""

import argparse
import csv
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from src.reference_sounds import SR, beep, chime

AI_DIR = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "appa-anjanda-sound-collector/0.1 (offline research prototype)"}
ID_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")  # contracts 1절
GROUPS = ("bell", "melody", "beep", "nature", "voice", "other")
CSV_COLUMNS = ("id", "file", "title", "group", "group_rep", "license", "source_url")
MAX_SEC = 30.0  # C3: 30초 이하. 긴 녹음은 start부터 30초만 쓴다
MIN_PER_GROUP = 3

# 앱에 넣어 배포해도 출처 표시만으로 되는 것. BY-SA·NC·ND는 받지 않는다
ALLOWED_LICENSES = {
    "CC0": "CC0",
    "Public domain": "Public domain",
    "CC BY 2.0": "CC-BY-2.0",
    "CC BY 3.0": "CC-BY-3.0",
    "CC BY 4.0": "CC-BY-4.0",
}


@dataclass(frozen=True)
class Entry:
    id: str
    title: str  # 화면에 보일 한국어 이름, 20자 이내
    group: str
    commons: str | None = None  # Commons 파일 이름("File:" 없이). None이면 합성
    start: float = 0.0  # 원본에서 쓸 시작 초
    rep: bool = False  # 계열 대표(처음 설정 화면)


# ── 합성음 (자체 제작) ──


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def _pluck(freq: float, sec: float, decay: float) -> np.ndarray:
    t = _t(sec)
    y = np.exp(-decay * t) * (np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 4 * freq * t))
    return y.astype(np.float32)


def arpeggio(sec: float = 10.0) -> np.ndarray:
    """마림바 느낌 상행 아르페지오: C5 D5 E5 G5 A5 C6을 0.25초마다, 음 사이 감쇠."""
    notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 0.0, 0.0]
    step = int(0.25 * SR)
    y = np.zeros(int(sec * SR), dtype=np.float32)
    for i in range(len(y) // step):
        f = notes[i % len(notes)]
        if f:
            n = _pluck(f, 0.6, 8.0)[: len(y) - i * step]
            y[i * step : i * step + len(n)] += n
    return (y / np.abs(y).max()).astype(np.float32)


def triple_beep(freq: float = 1000.0, sec: float = 10.0) -> np.ndarray:
    """디지털 시계식 '삐삐삐 — 쉼': 0.1초 삑 3번 뒤 0.6초 쉼. 순음."""
    t = _t(sec)
    phase = t % 1.2
    gate = (phase < 0.6) & ((phase % 0.2) < 0.1)
    return (np.sin(2 * np.pi * freq * t) * gate).astype(np.float32)


SYNTH = {
    "chime_ceg": lambda: chime(10.0),
    "arpeggio_marimba": arpeggio,
    "beep_square_520": lambda: beep(520, sec=10.0),
    "beep_triple_1k": triple_beep,
}

# ── 목록 (group은 제목 기준 초안. 듣고 고친다) ──

ENTRIES: tuple[Entry, ...] = (
    # 벨
    Entry("bell_ring", "종 울림", "bell", "Bell-ring.flac", rep=True),
    Entry("doorbell_dingdong", "딩동 초인종", "bell", "Doorbell-classic-dingdong.ogg"),
    Entry("doorbell_old", "옛날 초인종", "bell", "Doorbell-old-tring.ogg"),
    Entry("clock_ring_mech", "태엽 시계 벨", "bell", "Mechanical Clock Ring (Directory.Audio).mp3"),
    Entry("church_bells", "교회 종소리", "bell", "Church bells - Leverkusen, 2007.oga"),
    Entry("wind_chime", "풍경 소리", "bell", "Windchime.ogg"),
    # 멜로디
    Entry("chime_ceg", "도미솔 차임", "melody", rep=True),
    Entry("arpeggio_marimba", "마림바 아르페지오", "melody"),
    Entry("music_box_lullaby", "오르골 자장가", "melody", "Lullaby wound up clock.ogg"),
    Entry("marimba_folk", "마림바 연주", "melody", "Chiapanecas marimba.ogg"),
    Entry("xylophone_bali", "발리 실로폰", "melody", "Bali xylophone.ogg"),
    # 삑
    Entry("beep_triple_1k", "삐삐삐 전자음", "beep", rep=True),
    Entry("beep_square_520", "520Hz 삑삑", "beep"),
    Entry("alarm_clock_digital", "디지털 알람시계", "beep", "Alarm Clock (Directory.Audio).mp3"),
    Entry("buzzer_short", "버저", "beep", "Buzzer.wav"),
    # 자연음
    Entry("rooster_medium", "수탉 울음", "nature", "Medium rooster crowing.ogg", rep=True),
    Entry("rooster_small", "작은 수탉 울음", "nature", "Small rooster crowing.ogg"),
    Entry("blackbird", "검은지빠귀 노래", "nature", "Turdus merula 2.ogg"),
    Entry("cuckoo", "뻐꾸기", "nature", "Cuculus canorus v01.ogg"),
    Entry("water_trickle", "졸졸 물소리", "nature", "Water flowing pouring trickling.ogg"),
)

# 재난 경보음·사이렌은 넣지 않는다: 본인·이웃이 실제 재난으로 착각할 수 있고(미국은 경보음 오용을 규제),
# 이 앱은 익숙해질수록 낯선 소리를 고르므로 오히려 자주 뽑힐 수 있다
BANNED_WORDS = ("siren", "alert", "civil-defense", "civil defense", "emergency", "air raid", "tornado",
                "사이렌", "경보", "재난", "민방위")


def validate_entries(entries: tuple[Entry, ...]) -> None:
    """C1 규칙. 어기면 어느 규칙·어느 id인지 적고 멈춘다."""
    ids = [e.id for e in entries]
    for e in entries:
        if not ID_RE.match(e.id):
            raise ValueError(f"id 형식: {e.id}")
        if e.group not in GROUPS:
            raise ValueError(f"group 값: {e.id} ({e.group})")
        if not e.title or len(e.title) > 20:
            raise ValueError(f"title 20자 이내: {e.id}")
        if e.commons is None and e.id not in SYNTH:
            raise ValueError(f"합성 함수 없음: {e.id}")
        text = f"{e.id} {e.title} {e.commons or ''}".lower().replace("_", " ")
        hit = next((w for w in BANNED_WORDS if w in text), None)
        if hit:
            raise ValueError(f"경보음·사이렌 금지: {e.id} ('{hit}')")
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f"id 중복: {', '.join(sorted(dup))}")
    for g in {e.group for e in entries}:
        members = [e for e in entries if e.group == g]
        if len(members) < MIN_PER_GROUP:
            raise ValueError(f"계열 {g}: {len(members)}개 (3개 이상)")
        if sum(e.rep for e in members) != 1:
            raise ValueError(f"계열 {g}: 대표가 정확히 1개여야 함")


# ── Commons ──


def normalize_license(short_name: str) -> str | None:
    return ALLOWED_LICENSES.get(short_name.strip())


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def commons_info(names: list[str]) -> dict[str, dict]:
    """Commons 파일 이름 → {url, page, license, artist}. 50개씩 묻는다."""
    out: dict[str, dict] = {}
    for i in range(0, len(names), 50):
        chunk = names[i : i + 50]
        query = urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": 2,
            "titles": "|".join(f"File:{n}" for n in chunk),
            "prop": "imageinfo", "iiprop": "url|extmetadata",
            "iiextmetadatafilter": "LicenseShortName|Artist",
        })
        with urllib.request.urlopen(urllib.request.Request(f"{API}?{query}", headers=UA), timeout=30) as r:
            q = json.load(r)["query"]
        # Commons는 제목의 밑줄·대소문자를 고쳐 돌려준다 → 원래 이름으로 되돌림
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q["pages"]:
            name = back.get(p["title"], p["title"]).removeprefix("File:")
            if p.get("missing") or "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            out[name] = {
                "url": ii["url"],
                "page": ii["descriptionurl"],
                "license": meta.get("LicenseShortName", {}).get("value", ""),
                "artist": _strip_html(meta.get("Artist", {}).get("value", "")) or "알 수 없음",
            }
    return out


def _download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            break
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 4:
                raise
            wait = int(err.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
            print(f"    요청 제한(429), {wait}초 뒤 다시")
            time.sleep(wait)
    tmp.replace(dest)
    time.sleep(3)  # Commons에 부담 주지 않게


# ── 쓰기 ──


def clip(y: np.ndarray, sr: int, start: float) -> np.ndarray:
    a = int(start * sr)
    return y[a : a + int(MAX_SEC * sr)]


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["id"]))


def write_credits(rows: list[dict], path: Path) -> None:
    lines = [
        "# 알람 소리 출처",
        "",
        "`python -m src.collect_sounds`가 만든다. 앱 안 출처 표시(CC BY)에도 이 표를 쓴다.",
        "",
        "| id | 이름 | 계열 | 라이선스 | 만든 사람 | 출처 |",
        "|---|---|---|---|---|---|",
    ]
    for r in sorted(rows, key=lambda r: r["id"]):
        src = "-" if r["source_url"] == "-" else f"[Commons]({r['source_url']})"
        lines.append(f"| `{r['id']}` | {r['title']} | {r['group']} | {r['license']} | {r['artist']} | {src} |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def collect(entries: tuple[Entry, ...], data_dir: Path, offline: bool = False) -> list[dict]:
    validate_entries(entries)
    sounds_dir, raw_dir = data_dir / "sounds", data_dir / "raw"
    sounds_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)
    remote = [e for e in entries if e.commons]
    info = {} if offline else commons_info([e.commons for e in remote])

    rows = []
    for e in entries:
        dest = sounds_dir / f"{e.id}.wav"
        if e.commons is None:
            sf.write(dest, SYNTH[e.id](), SR, subtype="PCM_16")
            lic, url, artist = "자체 제작", "-", "팀"
        else:
            if offline:
                raise ValueError(f"{e.id}: 오프라인 모드에서는 Commons 소리를 쓸 수 없음")
            meta = info.get(e.commons)
            if meta is None:
                raise ValueError(f"{e.id}: Commons에 없음 ({e.commons})")
            lic = normalize_license(meta["license"])
            if lic is None:
                raise ValueError(f"{e.id}: 허용하지 않는 라이선스 '{meta['license']}' ({e.commons})")
            raw = raw_dir / f"{e.id}{Path(e.commons).suffix.lower()}"
            if not raw.exists():
                print(f"  받는 중 {e.id} ← {e.commons}")
                _download(meta["url"], raw)
            y, sr = sf.read(raw, dtype="float32", always_2d=True)
            sf.write(dest, clip(y.mean(axis=1), sr, e.start), sr, subtype="PCM_16")
            url, artist = meta["page"], meta["artist"]
        rows.append({"id": e.id, "file": dest.name, "title": e.title, "group": e.group,
                     "group_rep": "1" if e.rep else "0", "license": lic, "source_url": url, "artist": artist})
    return rows


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="소리 목록 → ai/data/sounds/ + sounds.csv + 출처 표")
    p.add_argument("--data", type=Path, default=AI_DIR / "data")
    p.add_argument("--credits", type=Path, default=AI_DIR / "reports" / "sound_credits.md")
    args = p.parse_args(argv)
    try:
        rows = collect(ENTRIES, args.data)
    except (ValueError, OSError) as e:
        print(f"실패 — {e}", file=sys.stderr)
        return 1
    write_csv([{k: r[k] for k in CSV_COLUMNS} for r in rows], args.data / "sounds.csv")
    write_credits(rows, args.credits)
    groups = {g: sum(r["group"] == g for r in rows) for g in GROUPS}
    print(f"소리 {len(rows)}개 → {args.data / 'sounds.csv'}  계열 {groups}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
