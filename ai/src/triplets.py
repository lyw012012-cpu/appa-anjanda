"""E1 세 쌍 비교(I-12): 사람이 느끼는 "비슷함"과 가장 잘 맞는 거리 공간 고르기.

    cd ai && python -m src.triplets make     # data/triplets.csv (30문항)
    cd ai && python -m src.triplets sheet    # out/e1_listen.html (팀원에게 보내는 듣기 페이지)
    cd ai && python -m src.triplets score    # data/triplet_answers*.csv → reports/e1.md

문항: 기준 소리 X와 후보 A·B 중 X와 더 비슷하게 들리는 쪽을 고른다.
공간마다 "X와 코사인이 더 큰 쪽"을 예측으로 보고, 사람 답과 맞은 비율(일치율)을 비교한다.
판단 규칙(design.md 6절 E1): 다른 공간이 YAMNet보다 10%p 이상 높지 않으면 YAMNet 유지.
형식: contracts.md C1 "세 쌍 비교".
"""

import argparse
import base64
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

from src.build_sounds import (
    AI_DIR,
    _mp3_bytes,
    f0_median,
    harshness,
    load_audio,
    mel_profile,
    normalize,
    pitch_from_f0,
    read_csv,
    sim520_hand,
    two_rates,
    yamnet_embed,
)

N_WITHIN = 15  # 같은 계열 안 문항
N_CROSS = 15  # A·B가 다른 계열인 문항
SEED = 12
SPACES = ("yamnet", "logmel", "hand")
# 판단 후보. hand는 계약(C2)에 정의가 없고 ai-design 12절은 삭제를 제안해, 이겨도 앱·파이프라인에 구현이 없다 → 기록용(PR #34 리뷰)
DECIDE_SPACES = ("logmel",)
SWITCH_MARGIN = 0.10  # 다른 공간이 이만큼 이상 높아야 바꾼다(E1 판단 규칙)
TIE_EPS = 1e-6  # 두 코사인 차이가 이보다 작으면 공간이 판단 못 함(0.5점)
BOOTSTRAP = 2000
RATER_RE = re.compile(r"^r[1-9]$")
TRIPLET_COLUMNS = ("qid", "anchor", "a", "b")
ANSWER_COLUMNS = ("rater", "qid", "choice")


# ── 문항 만들기 ──


def _split_counts(sizes: dict[str, int], total: int) -> dict[str, int]:
    """계열 크기에 비례해 total을 나눈다(최대 나머지 방식)."""
    whole = sum(sizes.values())
    raw = {g: total * n / whole for g, n in sizes.items()}
    counts = {g: int(v) for g, v in raw.items()}
    for g in sorted(raw, key=lambda g: (-(raw[g] - counts[g]), g))[: total - sum(counts.values())]:
        counts[g] += 1
    return counts


def make_triplets(rows: list[dict], n_within: int = N_WITHIN, n_cross: int = N_CROSS, seed: int = SEED) -> list[dict]:
    """같은 계열 안 문항과 A·B가 다른 계열인 문항을 섞어 만든다. 소리가 고르게 쓰이도록 덜 쓴 소리부터 고른다."""
    rng = np.random.default_rng(seed)
    groups: dict[str, list[str]] = {}
    for r in sorted(rows, key=lambda r: r["id"]):
        groups.setdefault(r["group"], []).append(r["id"])
    all_ids = [sid for members in groups.values() for sid in members]
    group_of = {sid: g for g, members in groups.items() for sid in members}
    used = {sid: 0 for sid in all_ids}
    seen: set[tuple[str, frozenset]] = set()

    def least_used(pool: list[str], k: int, exclude: set[str]) -> list[str]:
        cand = [s for s in pool if s not in exclude]
        if len(cand) < k:
            raise ValueError(f"문항을 만들 소리가 모자람(필요 {k}, 남은 {len(cand)})")
        tie = rng.permutation(len(cand))
        order = sorted(range(len(cand)), key=lambda i: (used[cand[i]], tie[i]))
        return [cand[i] for i in order[:k]]

    def add(anchor: str, a: str, b: str, out: list[dict]) -> bool:
        key = (anchor, frozenset((a, b)))
        if key in seen:
            return False
        seen.add(key)
        for s in (anchor, a, b):
            used[s] += 1
        if rng.random() < 0.5:
            a, b = b, a
        out.append({"anchor": anchor, "a": a, "b": b})
        return True

    within: list[dict] = []
    big = {g: len(m) for g, m in groups.items() if len(m) >= 3}
    if n_within and not big:
        raise ValueError("같은 계열 문항을 만들 계열이 없음(계열마다 3개 이상 필요)")
    for g, n in _split_counts(big, n_within).items():
        tries = 0
        while sum(1 for t in within if group_of[t["anchor"]] == g) < n:
            tries += 1
            if tries > 1000:
                raise ValueError(f"{g}: 서로 다른 같은 계열 문항을 {n}개 만들 수 없음")
            anchor, a, b = least_used(groups[g], 3, set())
            add(anchor, a, b, within)

    cross: list[dict] = []
    names = sorted(groups)
    if n_cross and len(names) < 2:
        raise ValueError("다른 계열 문항을 만들려면 계열이 2개 이상 필요")
    pairs = [(g1, g2) for i, g1 in enumerate(names) for g2 in names[i + 1 :]]
    tries = 0
    while len(cross) < n_cross:
        tries += 1
        if tries > 1000:
            raise ValueError(f"서로 다른 다른 계열 문항을 {n_cross}개 만들 수 없음")
        g1, g2 = pairs[len(cross) % len(pairs)]
        (a,) = least_used(groups[g1], 1, set())
        (b,) = least_used(groups[g2], 1, set())
        (anchor,) = least_used(all_ids, 1, {a, b})
        add(anchor, a, b, cross)

    items = within + cross
    items = [items[i] for i in rng.permutation(len(items))]
    width = max(2, len(str(len(items))))
    return [{"qid": f"q{i + 1:0{width}d}", **t} for i, t in enumerate(items)]


def kind_of(t: dict, group_of: dict[str, str]) -> str:
    return "같은 계열" if group_of[t["a"]] == group_of[t["b"]] == group_of[t["anchor"]] else "다른 계열"


# ── 파일 읽기·쓰기 (C1) ──


def _read(path: Path, columns: tuple[str, ...]) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in reader]
        missing = [c for c in columns if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"{path.name}: 열 없음 {', '.join(missing)}")
    return rows


def _write(path: Path, columns: tuple[str, ...], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def validate_triplets(triplets: list[dict], ids: set[str]) -> None:
    qids = [t["qid"] for t in triplets]
    if len(set(qids)) != len(qids):
        raise ValueError("qid 중복")
    for t in triplets:
        trio = (t["anchor"], t["a"], t["b"])
        for s in trio:
            if s not in ids:
                raise ValueError(f"{t['qid']}: sounds.csv에 없는 소리 {s}")
        if len(set(trio)) != 3:
            raise ValueError(f"{t['qid']}: 기준·A·B는 서로 달라야 함")


def validate_answers(answers: list[dict], triplets: list[dict]) -> None:
    qids = {t["qid"] for t in triplets}
    seen: set[tuple[str, str]] = set()
    for r in answers:
        where = f"{r.get('rater')}/{r.get('qid')}"
        if not RATER_RE.match(r["rater"]):
            raise ValueError(f"{where}: rater는 r1·r2·r3 형식")
        if r["qid"] not in qids:
            raise ValueError(f"{where}: triplets.csv에 없는 문항")
        if r["choice"] not in ("a", "b"):
            raise ValueError(f"{where}: choice는 a 또는 b")
        if (r["rater"], r["qid"]) in seen:
            raise ValueError(f"{where}: 같은 사람이 같은 문항에 두 번 답함")
        seen.add((r["rater"], r["qid"]))


def answer_files(data_dir: Path) -> list[Path]:
    """triplet_answers.csv(합친 파일)가 있으면 그것만, 없으면 사람별 파일(triplet_answers_r1.csv …)을 모두."""
    merged = data_dir / "triplet_answers.csv"
    return [merged] if merged.exists() else sorted(data_dir.glob("triplet_answers_r*.csv"))


# ── 거리 공간 ──


def _unit(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def hand_vector(y44: np.ndarray, y16: np.ndarray) -> np.ndarray:
    """손 특징 공간 [제안]: 고정 기준 특징(음높이·거슬림·520 닮음)에서 0.5를 빼 L2 정규화."""
    f0 = f0_median(y16)
    feats = np.array([pitch_from_f0(f0), harshness(y44, y16), sim520_hand(y16, f0)])
    return _unit(feats - 0.5)


def space_vectors(rows: list[dict], sounds_dir: Path, ids: set[str]) -> dict[str, dict[str, np.ndarray]]:
    """문항에 나오는 소리만 파이프라인과 같은 방식(음량 맞춘 파형)으로 공간별 단위 벡터를 만든다."""
    out: dict[str, dict[str, np.ndarray]] = {s: {} for s in SPACES}
    for r in rows:
        sid = r["id"]
        if sid not in ids:
            continue
        y, sr = load_audio(sounds_dir / r["file"])
        y44, y16 = two_rates(normalize(y, sr, sid), sr)
        out["yamnet"][sid] = yamnet_embed(y16)[0]
        out["logmel"][sid] = _unit(mel_profile(y16))
        out["hand"][sid] = hand_vector(y44, y16)
    return out


def predict(vecs: dict[str, np.ndarray], t: dict) -> str | None:
    """X와 코사인이 더 큰 쪽. 거의 같으면 None(판단 못 함)."""
    x = vecs[t["anchor"]]
    sa, sb = float(x @ vecs[t["a"]]), float(x @ vecs[t["b"]])
    if abs(sa - sb) < TIE_EPS:
        return None
    return "a" if sa > sb else "b"


def _hit(pred: str | None, choice: str) -> float:
    return 0.5 if pred is None else float(pred == choice)


# ── 일치율 ──


def agreement_by_question(preds: dict[str, str | None], answers: list[dict]) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    for r in answers:
        out.setdefault(r["qid"], []).append(_hit(preds[r["qid"]], r["choice"]))
    return out


def human_by_question(answers: list[dict]) -> dict[str, list[float]]:
    """사람끼리 일치율: 각 답을 나머지 사람의 다수결과 비교(나머지가 반반이면 0.5). 답이 1개인 문항은 뺀다."""
    by_q: dict[str, list[str]] = {}
    for r in answers:
        by_q.setdefault(r["qid"], []).append(r["choice"])
    out: dict[str, list[float]] = {}
    for qid, choices in by_q.items():
        if len(choices) < 2:
            continue
        for i, c in enumerate(choices):
            rest = choices[:i] + choices[i + 1 :]
            na = rest.count("a")
            nb = len(rest) - na
            out.setdefault(qid, []).append(0.5 if na == nb else float(c == ("a" if na > nb else "b")))
    return out


def _mean(by_q: dict[str, list[float]], qids: list[str]) -> float:
    vals = [v for q in qids for v in by_q.get(q, [])]
    return float(np.mean(vals)) if vals else float("nan")


def bootstrap_diff(
    other: dict[str, list[float]], base: dict[str, list[float]], qids: list[str], n: int = BOOTSTRAP, seed: int = SEED
) -> tuple[float, float]:
    """문항을 다시 뽑아(복원 추출) other − base 일치율 차이의 95% 구간."""
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n):
        pick = [qids[i] for i in rng.integers(0, len(qids), len(qids))]
        diffs.append(_mean(other, pick) - _mean(base, pick))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return float(lo), float(hi)


def decide(acc: dict[str, float], ci: dict[str, tuple[float, float]]) -> tuple[str, str]:
    """E1 판단 규칙. (고른 공간, 이유).

    DECIDE_SPACES 중 하나가 YAMNet보다 10%p 이상 높고, 그 차이의 95% 구간 아래 끝도 0보다 클 때만 바꾼다.
    점 추정치만 보면 3명 × 30문항에서는 우연한 10%p 차이로 공간이 바뀔 수 있다(PR #34 리뷰).
    """
    best = max(DECIDE_SPACES, key=lambda s: acc[s])
    gap = acc[best] - acc["yamnet"]
    lo = ci[best][0]
    if gap < SWITCH_MARGIN - 1e-9:
        return "yamnet", f"{best}과 차이 {gap * 100:+.1f}%p로 기준(10%p) 미만 → YAMNet 유지"
    if lo <= 0:
        return "yamnet", f"{best}이 {gap * 100:+.1f}%p 높지만 95% 구간 아래 끝이 {lo * 100:+.1f}%p로 0 이하 → 우연일 수 있어 YAMNet 유지"
    return best, f"{best}이 YAMNet보다 {gap * 100:.1f}%p 높고 95% 구간 아래 끝도 {lo * 100:+.1f}%p로 0보다 큼"


def score(
    triplets: list[dict],
    answers: list[dict],
    vectors: dict[str, dict[str, np.ndarray]],
    group_of: dict[str, str],
    decide_all: bool = False,
) -> dict:
    """decide_all=False면 같은 계열 문항만으로 판단한다.

    계열(`group`)이 YAMNet 결과를 보고 붙인 초안이면, A·B를 계열로 가른 다른 계열 문항은
    YAMNet이 나눈 기준으로 YAMNet을 채점하는 셈이라 YAMNet에 유리하다. 계열을 사람이 듣고 확인한 뒤에만 전체로 판단한다.
    """
    qids = [t["qid"] for t in triplets if any(r["qid"] == t["qid"] for r in answers)]
    kinds = {t["qid"]: kind_of(t, group_of) for t in triplets}
    decide_qids = qids if decide_all else [q for q in qids if kinds[q] == "같은 계열"]
    if not decide_qids:
        raise ValueError("판단에 쓸 같은 계열 문항의 답이 없음")
    by_space = {s: agreement_by_question({t["qid"]: predict(vectors[s], t) for t in triplets}, answers) for s in SPACES}
    human = human_by_question(answers)
    acc = {s: _mean(by_space[s], qids) for s in SPACES}
    decide_acc = {s: _mean(by_space[s], decide_qids) for s in SPACES}
    diff_ci = {s: bootstrap_diff(by_space[s], by_space["yamnet"], decide_qids) for s in SPACES if s != "yamnet"}
    chosen, reason = decide(decide_acc, diff_ci)
    return {
        "raters": sorted({r["rater"] for r in answers}),
        "nAnswers": len(answers),
        "nQuestions": len(qids),
        "decideOn": "전체" if decide_all else "같은 계열",
        "nDecide": len(decide_qids),
        "accuracy": acc,
        "decideAccuracy": decide_acc,
        "byKind": {
            k: {s: _mean(by_space[s], [q for q in qids if kinds[q] == k]) for s in SPACES}
            | {"human": _mean(human, [q for q in qids if kinds[q] == k]), "n": sum(kinds[q] == k for q in qids)}
            for k in ("같은 계열", "다른 계열")
        },
        "human": _mean(human, qids),
        "diffCI": diff_ci,
        "chosen": chosen,
        "reason": reason,
    }


def write_report(result: dict, path: Path) -> None:
    pct = lambda v: "—" if v != v else f"{v * 100:.1f}%"  # noqa: E731  nan이면 —
    acc = result["accuracy"]
    dacc = result["decideAccuracy"]
    on = result["decideOn"]
    lines = [
        "# E1 세 쌍 비교 결과 (I-12)",
        "",
        f"생성 {datetime.now().astimezone().isoformat(timespec='seconds')} · "
        f"응답자 {len(result['raters'])}명({', '.join(result['raters'])}) · 문항 {result['nQuestions']}개 · 답 {result['nAnswers']}개",
        "",
        "> 이 파일은 `python -m src.triplets score`가 다시 쓴다. 결론·해석은 `e1_conclusion.md`에 따로 적는다.",
        "",
        "## 공간별 일치율",
        "",
        "사람 답과 공간의 예측(기준과 코사인이 더 큰 쪽)이 맞은 비율. 공간이 판단 못 하면(두 코사인이 같으면) 0.5점.",
        "",
        f"| 공간 | 전체 | 같은 계열 | 다른 계열 (참고) | YAMNet 대비, {on} 문항 (95% 구간) |",
        "|---|---|---|---|---|",
    ]
    bk = result["byKind"]
    for s in SPACES:
        ci = result["diffCI"].get(s)
        diff = "기준" if ci is None else f"{(dacc[s] - dacc['yamnet']) * 100:+.1f}%p ({ci[0] * 100:+.1f} ~ {ci[1] * 100:+.1f})"
        name = s if s == "yamnet" or s in DECIDE_SPACES else f"{s} (기록용, 판단 제외)"
        lines.append(f"| {name} | {pct(acc[s])} | {pct(bk['같은 계열'][s])} | {pct(bk['다른 계열'][s])} | {diff} |")
    lines += [
        f"| 사람끼리 | {pct(result['human'])} | {pct(bk['같은 계열']['human'])} | {pct(bk['다른 계열']['human'])} | 각 답을 나머지 사람의 다수결과 비교. 공간이 넘기 어려운 천장 |",
        "",
        f"문항 수: 같은 계열 {bk['같은 계열']['n']}개, 다른 계열 {bk['다른 계열']['n']}개.",
        "",
        "**다른 계열 문항은 YAMNet에 유리할 수 있다.** 계열(`group`)이 YAMNet 결과를 보고 붙인 초안이라, "
        "A·B를 계열로 가른 문항은 YAMNet이 나눈 기준으로 YAMNet을 채점하는 셈이다. 그래서 계열을 사람이 듣고 "
        "확인하기 전에는 같은 계열 문항만으로 판단한다(확인한 뒤에는 `score --all`).",
        "",
        "## 판단",
        "",
        f"판단에 쓴 문항: **{on} {result['nDecide']}개**.",
        "",
        f"**`model.space` = `{result['chosen']}`** — {result['reason']}.",
        "",
        f"규칙: {', '.join(DECIDE_SPACES)}이 YAMNet보다 10%p 이상 높고(design.md 6절 E1) 그 차이의 95% 구간 아래 끝도 0보다 클 때만 바꾼다. "
        f"응답자 {len(result['raters'])}명 × {result['nDecide']}문항이라 구간이 넓다.",
        "",
        "한계: 95% 구간은 문항만 다시 뽑아 계산해 응답자 사이 차이가 빠져 있다. 실제 불확실성은 이보다 크다. "
        "`hand`는 계약에 정의가 없어 기록용으로만 보여 준다.",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


# ── 듣기 페이지 ──

SHEET_HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>소리 세 쌍 비교</title>
<style>
:root { --bg:#fafaf9; --card:#fff; --text:#1c1917; --muted:#57534e; --line:#d6d3d1; --accent:#2563eb; --accent-text:#fff; --chosen:#dbeafe; }
@media (prefers-color-scheme: dark) { :root { --bg:#1c1917; --card:#292524; --text:#f5f5f4; --muted:#a8a29e; --line:#44403c; --accent:#60a5fa; --accent-text:#0c0a09; --chosen:#1e3a5f; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui, -apple-system, "Malgun Gothic", sans-serif; }
main { max-width:560px; margin:0 auto; padding:24px 16px 48px; }
h1 { font-size:1.4rem; margin:0 0 8px; }
p { margin:0 0 12px; color:var(--muted); }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; margin-top:16px; }
.row { display:flex; gap:8px; flex-wrap:wrap; }
button, select { font:inherit; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--text); padding:10px 14px; cursor:pointer; min-height:44px; }
button.primary { background:var(--accent); color:var(--accent-text); border-color:var(--accent); }
button:disabled { opacity:.4; cursor:not-allowed; }
button.play { flex:1 1 30%; }
button.play.done { border-color:var(--accent); }
button.choice { flex:1 1 45%; }
button.choice.picked { background:var(--chosen); border-color:var(--accent); }
.progress { font-variant-numeric:tabular-nums; color:var(--muted); }
.bar { height:6px; background:var(--line); border-radius:3px; overflow:hidden; margin:8px 0 16px; }
.bar > div { height:100%; background:var(--accent); width:0; }
.hidden { display:none; }
</style>
</head>
<body>
<main>
  <h1>소리 세 쌍 비교</h1>
  <p>기준 소리 <b>X</b>를 듣고, <b>A</b>와 <b>B</b> 중 X와 <b>더 비슷하게 들리는</b> 쪽을 고르세요. 정답은 없습니다. 음높이·음색·리듬 등 전체 느낌으로 고르면 됩니다. 이어폰을 쓰고, 음량은 처음에 한 번 맞춘 뒤 바꾸지 마세요. 약 15분 걸립니다.</p>

  <div id="start" class="card">
    <p>응답자 번호를 고르세요(이름 대신 씁니다).</p>
    <div class="row">
      <select id="rater"><option value="">선택</option><option>r1</option><option>r2</option><option>r3</option></select>
      <button id="go" class="primary" disabled>시작</button>
    </div>
  </div>

  <div id="quiz" class="card hidden">
    <div class="progress" id="prog"></div>
    <div class="bar"><div id="barfill"></div></div>
    <div class="row">
      <button class="play" data-k="anchor">▶ X 기준</button>
      <button class="play" data-k="a">▶ A</button>
      <button class="play" data-k="b">▶ B</button>
    </div>
    <p style="margin-top:12px">세 소리를 <b>끝까지</b> 들은 뒤 고르세요. A와 B를 모두 재생해야 버튼이 켜집니다.</p>
    <div class="row">
      <button class="choice" data-c="a" disabled>A가 X와 더 비슷</button>
      <button class="choice" data-c="b" disabled>B가 X와 더 비슷</button>
    </div>
    <div class="row" style="margin-top:16px">
      <button id="prev">← 이전</button>
    </div>
  </div>

  <div id="done" class="card hidden">
    <p><b>끝났습니다. 고맙습니다.</b> 아래 버튼으로 답 파일을 내려받아 담당자(C)에게 보내 주세요.</p>
    <div class="row">
      <button id="download" class="primary">답 파일 내려받기</button>
      <button id="review">답 다시 보기</button>
    </div>
  </div>
</main>
<script>
const QUESTIONS = __QUESTIONS__;
const AUDIO = __AUDIO__;
const KEY = "e1-triplets-v2";
let state = { rater: "", i: 0, answers: {} };
let heard = {};
let view = [];  // 이 응답자에게 보여 줄 순서: { q, swap }
const player = new Audio();

// 응답자 번호를 시드로 문항 순서와 A·B 위치를 섞는다. 답은 원래 a·b로 저장하므로 채점은 그대로다
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function buildView(rater) {
  const r = rng(Number(rater.slice(1)) * 7919);
  const order = QUESTIONS.map((q) => ({ q, swap: r() < 0.5 }));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
const shown = (v, k) => (k === "anchor" || !v.swap ? k : k === "a" ? "b" : "a");  // 화면의 A·B → 원래 a·b

function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.answers) state = s; } catch (e) {} }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
const $ = (id) => document.getElementById(id);

function show(id) { for (const x of ["start", "quiz", "done"]) $(x).classList.toggle("hidden", x !== id); }

function render() {
  if (state.i >= QUESTIONS.length) { show("done"); return; }
  show("quiz");
  const v = view[state.i];
  heard = {};
  $("prog").textContent = `${state.i + 1} / ${QUESTIONS.length}  ·  ${state.rater}`;
  $("barfill").style.width = `${(Object.keys(state.answers).length / QUESTIONS.length) * 100}%`;
  document.querySelectorAll(".play").forEach((b) => b.classList.remove("done"));
  const picked = state.answers[v.q.qid];
  document.querySelectorAll(".choice").forEach((b) => {
    b.classList.toggle("picked", picked !== undefined && shown(v, b.dataset.c) === picked);
    b.disabled = !picked;
  });
  $("prev").disabled = state.i === 0;
}

document.querySelectorAll(".play").forEach((b) => b.addEventListener("click", () => {
  const v = view[state.i];
  player.pause();
  player.src = AUDIO[v.q[shown(v, b.dataset.k)]];
  player.currentTime = 0;
  player.play();
  heard[b.dataset.k] = true;
  b.classList.add("done");
  if (heard.a && heard.b) document.querySelectorAll(".choice").forEach((c) => (c.disabled = false));
}));

document.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
  player.pause();
  const v = view[state.i];
  state.answers[v.q.qid] = shown(v, b.dataset.c);
  state.i += 1;
  save();
  render();
}));

$("prev").addEventListener("click", () => { player.pause(); if (state.i > 0) { state.i -= 1; save(); render(); } });
$("review").addEventListener("click", () => { state.i = 0; save(); render(); });
$("rater").addEventListener("change", (e) => { $("go").disabled = !e.target.value; });
$("go").addEventListener("click", () => {
  const r = $("rater").value;
  if (state.rater !== r) state = { rater: r, i: 0, answers: {} };
  view = buildView(r);
  save();
  render();
});
$("download").addEventListener("click", () => {
  const lines = ["rater,qid,choice"];
  for (const q of QUESTIONS) if (state.answers[q.qid]) lines.push(`${state.rater},${q.qid},${state.answers[q.qid]}`);
  const url = URL.createObjectURL(new Blob([lines.join("\\n") + "\\n"], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `triplet_answers_${state.rater}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

load();
if (state.rater) { $("rater").value = state.rater; $("go").disabled = false; }
show("start");
</script>
</body>
</html>
"""


def build_sheet(triplets: list[dict], clips: dict[str, bytes]) -> str:
    """소리 이름을 숨기고(s0, s1 …) mp3를 페이지 안에 넣는다. 문항 순서는 모두 같다."""
    order = sorted({s for t in triplets for s in (t["anchor"], t["a"], t["b"])})
    alias = {sid: f"s{i}" for i, sid in enumerate(order)}
    questions = [{"qid": t["qid"], **{k: alias[t[k]] for k in ("anchor", "a", "b")}} for t in triplets]
    audio = {alias[sid]: "data:audio/mpeg;base64," + base64.b64encode(clips[sid]).decode() for sid in order}
    return SHEET_HTML.replace("__QUESTIONS__", json.dumps(questions)).replace("__AUDIO__", json.dumps(audio))


# ── 명령 ──


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="E1 세 쌍 비교: 문항 → 듣기 페이지 → 일치율")
    p.add_argument("command", choices=("make", "sheet", "score"))
    p.add_argument("--data", type=Path, default=AI_DIR / "data", help="sounds.csv·sounds/·triplets.csv가 있는 폴더")
    p.add_argument("--force", action="store_true", help="make: 이미 있는 triplets.csv를 덮어쓴다")
    p.add_argument(
        "--all", action="store_true", help="score: 다른 계열 문항까지 판단에 쓴다. 계열을 사람이 듣고 확인한 뒤에만"
    )
    args = p.parse_args(argv)
    data = args.data
    tri_path = data / "triplets.csv"
    try:
        rows = read_csv(data / "sounds.csv")
        ids = {r["id"] for r in rows}
        if args.command == "make":
            if tri_path.exists() and not args.force:
                raise ValueError(f"{tri_path.name}가 이미 있음. 답을 받은 뒤 바꾸면 답이 어긋난다(덮어쓰려면 --force)")
            triplets = make_triplets(rows)
            validate_triplets(triplets, ids)
            _write(tri_path, TRIPLET_COLUMNS, triplets)
            group_of = {r["id"]: r["group"] for r in rows}
            n_within = sum(kind_of(t, group_of) == "같은 계열" for t in triplets)
            print(f"문항 {len(triplets)}개(같은 계열 {n_within}, 다른 계열 {len(triplets) - n_within}) → {tri_path}")
            return 0
        triplets = _read(tri_path, TRIPLET_COLUMNS)
        validate_triplets(triplets, ids)
        used = {s for t in triplets for s in (t["anchor"], t["a"], t["b"])}
        if args.command == "sheet":
            clips = {}
            for r in rows:
                if r["id"] in used:
                    y, sr = load_audio(data / "sounds" / r["file"])
                    clips[r["id"]] = _mp3_bytes(two_rates(normalize(y, sr, r["id"]), sr)[0])
            out = AI_DIR / "out" / "e1_listen.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(build_sheet(triplets, clips), encoding="utf-8")
            print(f"듣기 페이지 → {out} ({out.stat().st_size / 1e6:.1f} MB). 팀원에게 이 파일을 보낸다")
            return 0
        files = answer_files(data)
        if not files:
            raise ValueError(f"답 파일 없음: {data / 'triplet_answers.csv'} 또는 triplet_answers_r1.csv …")
        answers = [r for f in files for r in _read(f, ANSWER_COLUMNS)]
        validate_answers(answers, triplets)
        vectors = space_vectors(rows, data / "sounds", used)
        result = score(triplets, answers, vectors, {r["id"]: r["group"] for r in rows}, decide_all=args.all)
        out = AI_DIR / "reports" / "e1.md"
        write_report(result, out)
        acc = ", ".join(f"{s} {result['decideAccuracy'][s] * 100:.1f}%" for s in SPACES)
        print(
            f"답 {result['nAnswers']}개({', '.join(f.name for f in files)}) · "
            f"판단({result['decideOn']} {result['nDecide']}문항) {acc} → {result['chosen']} · {out}"
        )
        return 0
    except (ValueError, FileNotFoundError) as e:
        print(f"실패 — {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
