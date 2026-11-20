"""E1 세 쌍 비교(I-12) 검사. YAMNet 없이 도는 부분만."""

import json
import re

import numpy as np
import pytest

from src.triplets import (
    SWITCH_MARGIN,
    _split_counts,
    _unit,
    build_sheet,
    decide,
    human_by_question,
    kind_of,
    make_triplets,
    predict,
    score,
    validate_answers,
    validate_triplets,
)


def _rows(sizes: dict[str, int]) -> list[dict]:
    return [{"id": f"{g}_{i:02d}", "group": g} for g, n in sizes.items() for i in range(n)]


ROWS = _rows({"bell": 13, "melody": 11, "beep": 6})  # 실제 I-3 목록과 같은 계열 크기
GROUP_OF = {r["id"]: r["group"] for r in ROWS}


# ── 문항 만들기 ──


def test_make_has_30_mixed_valid_questions():
    t = make_triplets(ROWS)
    validate_triplets(t, set(GROUP_OF))
    assert len(t) == 30
    kinds = [kind_of(x, GROUP_OF) for x in t]
    assert kinds.count("같은 계열") == 15
    assert kinds.count("다른 계열") == 15
    assert all(GROUP_OF[x["a"]] != GROUP_OF[x["b"]] for x, k in zip(t, kinds) if k == "다른 계열")
    assert [x["qid"] for x in t] == [f"q{i:02d}" for i in range(1, 31)]


def test_make_is_deterministic_and_unique():
    assert make_triplets(ROWS) == make_triplets(ROWS)
    keys = {(x["anchor"], frozenset((x["a"], x["b"]))) for x in make_triplets(ROWS)}
    assert len(keys) == 30


def test_make_spreads_sounds():
    used = {sid: 0 for sid in GROUP_OF}
    for x in make_triplets(ROWS):
        for s in (x["anchor"], x["a"], x["b"]):
            used[s] += 1
    assert min(used.values()) >= 1  # 90자리 / 30소리: 모든 소리가 한 번 이상
    assert max(used.values()) - min(used.values()) <= 2


def test_within_counts_follow_group_size():
    assert _split_counts({"bell": 13, "melody": 11, "beep": 6}, 15) == {"bell": 7, "melody": 5, "beep": 3}


def test_make_rejects_single_group_cross():
    with pytest.raises(ValueError, match="계열이 2개 이상"):
        make_triplets(_rows({"bell": 6}), n_within=2, n_cross=1)


def test_validate_triplets_rejects_repeated_sound():
    bad = [{"qid": "q01", "anchor": "bell_00", "a": "bell_00", "b": "bell_01"}]
    with pytest.raises(ValueError, match="서로 달라야"):
        validate_triplets(bad, set(GROUP_OF))


# ── 답 검사 ──

TRI = [{"qid": "q01", "anchor": "bell_00", "a": "bell_01", "b": "beep_00"}]


@pytest.mark.parametrize(
    "answers, msg",
    [
        ([{"rater": "kim", "qid": "q01", "choice": "a"}], "r1·r2·r3"),
        ([{"rater": "r1", "qid": "q99", "choice": "a"}], "없는 문항"),
        ([{"rater": "r1", "qid": "q01", "choice": "x"}], "a 또는 b"),
        ([{"rater": "r1", "qid": "q01", "choice": "a"}] * 2, "두 번"),
    ],
)
def test_validate_answers(answers, msg):
    with pytest.raises(ValueError, match=msg):
        validate_answers(answers, TRI)


# ── 예측·일치율 ──


def test_predict_picks_higher_cosine_and_ties():
    v = {"x": _unit([1, 0]), "a": _unit([1, 0.2]), "b": _unit([0, 1])}
    assert predict(v, {"anchor": "x", "a": "a", "b": "b"}) == "a"
    assert predict(v, {"anchor": "x", "a": "b", "b": "a"}) == "b"
    assert predict(v, {"anchor": "x", "a": "a", "b": "a"}) is None


def test_human_leave_one_out():
    ans = [{"qid": "q01", "choice": c} for c in ("a", "a", "b")]
    # r1: 나머지 a,b 반반 → 0.5 / r2: 같음 → 0.5 / r3: 나머지 a,a → 틀림 0
    assert human_by_question(ans) == {"q01": [0.5, 0.5, 0.0]}
    assert human_by_question([{"qid": "q01", "choice": "a"}]) == {}


def test_decide_rule():
    assert decide({"yamnet": 0.6, "logmel": 0.69, "hand": 0.5})[0] == "yamnet"
    assert decide({"yamnet": 0.6, "logmel": 0.6 + SWITCH_MARGIN, "hand": 0.5})[0] == "logmel"
    assert decide({"yamnet": 0.7, "logmel": 0.5, "hand": 0.9})[0] == "hand"


def test_score_end_to_end():
    tri = [
        {"qid": "q01", "anchor": "x", "a": "near", "b": "far"},
        {"qid": "q02", "anchor": "x", "a": "far", "b": "near"},
    ]
    near_in = {"x": _unit([1, 0]), "near": _unit([1, 0.1]), "far": _unit([0, 1])}
    far_in = {"x": _unit([1, 0]), "near": _unit([0, 1]), "far": _unit([1, 0.1])}
    vectors = {"yamnet": far_in, "logmel": near_in, "hand": far_in}
    answers = [{"rater": r, "qid": q, "choice": c} for r in ("r1", "r2") for q, c in (("q01", "a"), ("q02", "b"))]
    res = score(tri, answers, vectors, {"x": "bell", "near": "bell", "far": "bell"})
    assert res["accuracy"] == {"yamnet": 0.0, "logmel": 1.0, "hand": 0.0}
    assert res["human"] == 1.0
    assert res["chosen"] == "logmel"
    assert res["byKind"]["같은 계열"]["n"] == 2


# ── 듣기 페이지 ──


def test_sheet_hides_sound_ids():
    tri = [{"qid": "q01", "anchor": "bell_00", "a": "bell_01", "b": "beep_00"}]
    html = build_sheet(tri, {s: b"ID3fake" for s in ("bell_00", "bell_01", "beep_00")})
    assert "bell_00" not in html and "beep_00" not in html
    questions = json.loads(re.search(r"const QUESTIONS = (.*);", html).group(1))
    assert questions == [{"qid": "q01", "anchor": "s1", "a": "s2", "b": "s0"}]
    assert "__AUDIO__" not in html and "__QUESTIONS__" not in html
