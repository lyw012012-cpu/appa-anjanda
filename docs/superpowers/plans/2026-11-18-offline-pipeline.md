# 오프라인 파이프라인 (I-2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cd ai && python -m src.build_sounds` 한 번으로 소리 목록·원본에서 `sounds.json`·mp3·`sound-assets.ts`·보고서를 만든다. 특징은 모두 고정 기준.

**Architecture:** 스크립트 하나(`ai/src/build_sounds.py`)에 단계마다 함수 하나. 기준·대조 합성 소리는 `ai/src/reference_sounds.py`. 끝에서 C2 규칙을 모두 검사한 뒤에만 파일을 쓴다. 테스트는 기준 소리로 고정 기준을 확인한다.

**Tech Stack:** Python 3.13 (`ai/.venv`), numpy, scipy, librosa(`pyin`, `resample`, `trim`), soundfile 0.14(mp3 쓰기), tensorflow 2.21 + tensorflow-hub 0.16.1(YAMNet), matplotlib, pytest

**Spec:** [docs/context/pipeline-design.md](../../context/pipeline-design.md) (계산식·검사 기대값의 원본). 입출력 모양은 [docs/context/contracts.md](../../context/contracts.md) C1~C4.

## Global Constraints

- 모든 명령은 `ai/`에서, 파이썬은 `.venv/Scripts/python`(Windows) — 이하 `PY`
- 브랜치 `feature/pipeline`(`origin/develop`에서). 커밋 접두어: 문서 `docs`, 코드 `ai`. `main`·`develop` 직접 커밋 금지
- **계약 변경이 코드보다 먼저**(contracts 9절): 코드 PR은 PR #9 반영(또는 별도 `docs(contract):` PR) 뒤에 올린다. 요청 댓글은 PR #9에 남김(2026-11-18)
- 커밋 금지: `ai/data/`, `ai/models/`, `ai/out/`. 커밋함: `ai/reports/`(작은 png·md), `app/src/data/sounds.json`·`sound-assets.ts`·`app/assets/sounds/`(실제 소리로 만든 것만)
- 출력 파일 손으로 고치지 않기(M5). 소리 ID `^[a-z][a-z0-9_]{0,31}$`
- `sounds.json` 필드 이름은 C4 `Sound`의 camelCase(`groupRep`, `sourceUrl`, `durationSec`, `sim520`, `top3`). 0~1 점수는 소수 4자리, `embedding`·`simMedian`은 5자리로 반올림해 저장
- 고정 상수: `SIM_ZERO = 0.58`, 음높이 눈금 100~4000 Hz, 날카로움 눈금 100~8000 Hz, 음량 RMS −20 dBFS(소리 나는 구간), 피크 −1 dBFS, 최대 30초, mp3 모노 64 kbps, 전체 10 MB

## Review Focus

1. **스테레오·48 kHz·24비트 원본** → 모노로 섞고 바꿔야 함 (Task 1 `test_load_stereo_48k`)
2. **무음뿐인 파일**(0으로만 됨) → 0으로 나누지 말고 어느 id인지 적은 오류 (Task 1 `test_normalize_silent_raises`)
3. **YAMNet 조각(0.96초)보다 짧은 소리**(0.3초 삑) → 임베딩 1024칸·노름 1 (Task 3 `test_embed_short_sound`)
4. **엑셀이 저장한 BOM 있는 UTF-8 CSV, 한글 제목** → 첫 열 이름이 `id`로 읽혀야 함 (Task 4 `test_read_csv_bom`)
5. **CSV의 id 중복·정렬 안 됨** → 중복은 오류, 출력은 id 오름차순 (Task 4 `test_validate_duplicate_id`, `test_build_sorted`)

---

### Task 0: 브랜치·문서·환경

**Files:**
- Modify: `ai/requirements.txt`
- Create: `ai/pytest.ini`
- Modify: `.gitignore` (`ai/out/` 추가)
- Commit: `docs/context/pipeline-design.md`, 이 계획 파일

- [ ] **Step 1:** `git switch -c feature/pipeline origin/develop` 후 설계 문서와 이 계획을 가져와(`git checkout feature/skeleton -- <두 파일>` 또는 작업 트리에서 복사) 커밋: `docs: I-2 오프라인 파이프라인 설계와 구현 계획`
- [ ] **Step 2:** `requirements.txt`: `torch` 삭제, `tensorflow==2.21.*`, `tensorflow-hub==0.16.1`, `setuptools<81`, `pytest` 추가(나머지 유지)
- [ ] **Step 3:** `ai/pytest.ini`: `pythonpath = .`, `testpaths = tests`, `markers = yamnet: YAMNet을 내려받아 돌리는 느린 검사`
- [ ] **Step 4:** `PY -m pip install pytest matplotlib` → `PY -m pytest --version`이 버전을 출력
- [ ] **Step 5:** 커밋 `chore: ai 의존성 정리(torch 제거, TF·pytest 추가)`

### Task 1: 기준 소리 + 읽기·맞추기 (①)

**Files:**
- Create: `ai/src/reference_sounds.py`, `ai/src/build_sounds.py`, `ai/tests/test_build_sounds.py`
- Modify: `ai/src/proto_sounds.py` (생성 함수를 `reference_sounds`에서 import, 출력 wav는 그대로)

**Interfaces:**
- Produces (`reference_sounds.py`, 모두 44.1 kHz 모노 float32, 기본 3초):
  `SR = 44100`; `square(freq, sec=3.0)`, `sine(freq, sec=3.0)`, `chime(sec=3.0)`(지금 `soft_chime`), `buzzer(sec=3.0)`(3 kHz 사각파 × `0.5*(1+sin(2π·70t))`), `beep(freq=520, on=0.25, off=0.25, sec=3.0)`, `sweep(f0=500, f1=3000, sec=3.0)`, `white_noise(sec=3.0, seed=0)`;
  `E2_SOUNDS: dict[str, Callable[[], np.ndarray]]` = `square_520`, `beep_520`, `sweep_500_3000`, `sine_3100`, `white_noise`
- Produces (`build_sounds.py`):
  `load_audio(path: Path) -> tuple[np.ndarray, int]` (모노 float32, 원래 sr)
  `normalize(y: np.ndarray, sr: int, sound_id: str) -> np.ndarray` (자르기 → 30초 자르기+끝 50 ms 줄이기 → 소리 나는 구간 RMS −20 dBFS → 피크 −1 dBFS 제한)
  `two_rates(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]` (44.1 kHz, 16 kHz)
  `active_rms_db(y: np.ndarray, sr: int) -> float` (최대 프레임보다 40 dB 넘게 작은 프레임 제외)

- [ ] **Step 1: 실패하는 테스트**

```python
def test_loudness_ignores_gaps():
    a = normalize(beep(off=0.25), SR, "a"); b = normalize(beep(off=1.0), SR, "b")
    assert abs(active_rms_db(a, SR) - active_rms_db(b, SR)) <= 0.5
    assert abs(active_rms_db(a, SR) - (-20)) <= 0.5

def test_peak_limited():
    y = normalize(square(520) * 0.01, SR, "x")
    assert 20 * np.log10(np.abs(y).max()) <= -1.0 + 1e-6

def test_trim_and_cut():
    y = np.concatenate([np.zeros(SR), sine(440, sec=40), np.zeros(SR)])
    out = normalize(y, SR, "x")
    assert len(out) <= 30 * SR and np.abs(out[:100]).max() > 0

def test_normalize_silent_raises():
    with pytest.raises(ValueError, match="silent_x"):
        normalize(np.zeros(SR), SR, "silent_x")

def test_load_stereo_48k(tmp_path):
    t = np.arange(48000) / 48000
    sf.write(tmp_path / "s.wav", np.stack([np.sin(2*np.pi*440*t)]*2, 1), 48000, subtype="PCM_24")
    y, sr = load_audio(tmp_path / "s.wav")
    assert y.ndim == 1 and sr == 48000

def test_two_rates():
    hi, lo = two_rates(sine(440, sec=1.0), SR)
    assert len(hi) == SR and len(lo) == 16000
```

- [ ] **Step 2:** `PY -m pytest tests -k "loudness or peak or trim or silent or stereo or two_rates" -v` → import 오류로 FAIL
- [ ] **Step 3:** `reference_sounds.py`·위 4개 함수 구현. 자르기는 `librosa.effects.trim(top_db=40)`, 바꾸기는 `librosa.resample`. 무음(최대 절댓값 0)이면 `ValueError(f"{sound_id}: 소리가 없음")`
- [ ] **Step 4:** 같은 명령 → PASS. `PY -m src.proto_sounds ../app/assets/prototype` 뒤 `git status`에 wav 변경이 없음(같은 소리)
- [ ] **Step 5:** 커밋 `ai: 파이프라인 기준 소리와 읽기·음량 맞추기`

### Task 2: 음향 특징 (③)

**Files:** Modify `ai/src/build_sounds.py`, `ai/tests/test_build_sounds.py`

**Interfaces:**
- Consumes: Task 1의 `normalize`, `two_rates`, `reference_sounds.*`
- Produces:
  `f0_median(y16: np.ndarray) -> float | None` (`pyin` 65~4200 Hz, 소리 나는 프레임 30% 미만이면 None)
  `pitch_from_f0(f0: float | None) -> float` (None이면 0.5)
  `sharpness(y44: np.ndarray) -> float`, `roughness(y16: np.ndarray) -> float`
  `RAW0: float`, `RAW1: float` (상수), `harshness(y44, y16) -> float`
  `sim520_hand(y16: np.ndarray, f0: float | None) -> float`
- 계산식은 Spec 3절 ③ 그대로(눈금·0.273·√2·1% 기준 포함). 테스트 소리는 모두 `normalize`를 거친 뒤 `two_rates`로 나눈다(헬퍼 `prep(y) -> (y44, y16)`을 테스트 파일에 둔다)

- [ ] **Step 1: 실패하는 테스트**

```python
def test_square_520():
    y44, y16 = prep(square(520)); f0 = f0_median(y16)
    assert abs(pitch_from_f0(f0) - 0.447) <= 0.01
    assert sim520_hand(y16, f0) >= 0.95

def test_sine_520():
    y44, y16 = prep(sine(520)); f0 = f0_median(y16)
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
```

- [ ] **Step 2:** `PY -m pytest tests -k "square or sine or white or anchors or sharpness" -v` → FAIL
- [ ] **Step 3:** 함수 구현. `RAW0`·`RAW1`은 `harshness` 원점수(`0.5*sharpness + 0.5*roughness`)를 차임·버저에 대해 한 번 계산해 소수 6자리 상수로 박는다(계산에 쓴 한 줄 명령을 주석으로 남김). 배음 진폭은 `f0`의 k배 주파수 ±3% 안의 스펙트럼 최댓값
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `ai: 음높이·거슬림·520 닮음 고정 기준 계산`

### Task 3: YAMNet과 비교용 520 닮음 (②④)

**Files:** Modify `ai/src/build_sounds.py`, `ai/tests/test_build_sounds.py`

**Interfaces:**
- Produces:
  `yamnet_embed(y16: np.ndarray) -> tuple[np.ndarray, list[str]]` (평균 → L2 정규화한 1024칸, 상위 3개 클래스 이름). 모델은 처음 부를 때 한 번만 읽는다(`functools.cache`). 내려받는 곳 `TFHUB_CACHE_DIR = ai/models`
  `sim520_emb(emb: np.ndarray) -> float`, `mel_profile(y16: np.ndarray) -> np.ndarray`, `sim520_mel(y16: np.ndarray) -> float` (기준은 `square(520)`을 `normalize`한 것, `max(0, 코사인)`)

- [ ] **Step 1: 실패하는 테스트** (모두 `@pytest.mark.yamnet`)

```python
def test_embed_shape_norm():
    emb, top3 = yamnet_embed(prep(square(520))[1])
    assert emb.shape == (1024,) and abs(np.linalg.norm(emb) - 1) <= 1e-3 and len(top3) == 3

def test_embed_short_sound():
    emb, _ = yamnet_embed(prep(beep(sec=0.3))[1])
    assert emb.shape == (1024,) and abs(np.linalg.norm(emb) - 1) <= 1e-3

def test_sim520_self():
    _, y16 = prep(square(520))
    assert sim520_emb(yamnet_embed(y16)[0]) >= 0.99 and sim520_mel(y16) >= 0.99
```

- [ ] **Step 2:** `PY -m pytest tests -m yamnet -v` → FAIL
- [ ] **Step 3:** 구현. 로그 멜은 `librosa.feature.melspectrogram(sr=16000, n_mels=64)` → dB → 시간 평균 → 칸 평균을 뺌
- [ ] **Step 4:** 같은 명령 → PASS (첫 실행은 내려받기로 느림)
- [ ] **Step 5:** 커밋 `ai: YAMNet 임베딩과 520 닮음 비교값`

### Task 4: 목록 읽기·검사·쓰기·명령 (⑤⑦)

**Files:** Modify `ai/src/build_sounds.py`, `ai/tests/test_build_sounds.py`

**Interfaces:**
- Consumes: Task 1~3 함수 전부
- Produces:
  `SIM_ZERO = 0.58`
  `read_csv(csv: Path) -> list[dict]` (`utf-8-sig`, C1 열, `license` 빈칸이면 `ValueError(id)`)
  `synthetic_rows() -> list[tuple[dict, np.ndarray, int]]` (Spec 3절의 합성 모드 C1 값, `chime`의 id는 `chime`)
  `analyze(row: dict, y: np.ndarray, sr: int) -> tuple[dict, np.ndarray]` (C4 `Sound` dict, 맞춘 44.1 kHz 파형)
  `build(items: list[tuple[dict, np.ndarray, int]], synthetic: bool) -> tuple[dict, dict[str, np.ndarray]]` (C4 `SoundLibrary` dict — `model = {"space": "yamnet", "embeddingDim": 1024, "simMedian": SIM_ZERO}` — 와 id별 파형. 반올림 뒤 검사까지)
  `validate_library(lib: dict, synthetic: bool) -> None` (C2 표 전부 + 계열마다 `groupRep` 1개, 실제 모드만 계열마다 3개 이상. 어기면 `ValueError("<규칙>: <id>")`)
  `write_outputs(lib: dict, waves: dict[str, np.ndarray], root: Path) -> None` (`root/src/data/sounds.json`, `root/assets/sounds/<id>.mp3`, `root/src/data/sound-assets.ts`. 쓰기 전 mp3 합계 10 MB 검사)
  `main(argv: list[str] | None = None) -> int` (`--csv`, `--app`, `--synthetic`. 합성 모드면 `root = ai/out`, 아니면 `--app`)
- `sound-assets.ts` 모양: 맨 위 `// 생성 파일: ai/src/build_sounds.py가 만든다. 손으로 고치지 않는다(M5).`, `import type { SoundId } from '@/types/contracts';`, `export const soundAssets: Record<SoundId, number> = { <id>: require('../../assets/sounds/<id>.mp3'), ... };` (id 오름차순)
- 테스트에서 YAMNet은 `monkeypatch`로 `yamnet_embed`를 가짜(고정 임베딩)로 바꿔 빠르게 돈다

- [ ] **Step 1: 실패하는 테스트**

```python
def test_read_csv_bom(tmp_path): ...       # BOM + 한글 title → rows[0]["id"] == "bell_01"
def test_read_csv_license_blank(tmp_path): # → ValueError, 메시지에 id
def test_validate_hyphen_id():             # id "bell-01" → ValueError("소리 ID 형식: bell-01")
def test_validate_bad_norm():              # embedding 노름 1.01 → ValueError, 메시지에 id
def test_validate_duplicate_id():          # 같은 id 두 개 → ValueError
def test_build_sorted(fake_yamnet):        # 입력 순서 c, a, b → 출력 id a, b, c
def test_fixed_reference(fake_yamnet):     # 소리 3개로 build → 1개 더해 build → 기존 3개의 pitch·harshness·sim520·simMedian 같음
def test_invalid_writes_nothing(tmp_path, fake_yamnet): # 잘못된 목록으로 main → 0이 아닌 값, root 아래 파일 없음
def test_synthetic_goes_to_out(tmp_path, fake_yamnet, monkeypatch): # main(["--synthetic", "--app", app]) → app 아래 그대로, out 아래 sounds.json 있음
def test_mp3_size(tmp_path):               # 30초 sine을 write_outputs → mp3가 240 KB ± 10%
```

(각 테스트는 주석의 입력과 기대값을 그대로 assert로 쓴다.)

- [ ] **Step 2:** `PY -m pytest tests -m "not yamnet" -v` → 새 테스트 FAIL
- [ ] **Step 3:** 구현. mp3는 `sf.write(..., format="MP3", bitrate_mode="CONSTANT", compression_level=c)`로 쓰고, 64 kbps가 되는 `c`를 `test_mp3_size`로 찾아 상수로 둔다. `generatedAt`은 `datetime.now().astimezone().isoformat(timespec="seconds")`
- [ ] **Step 4:** 같은 명령 → 전부 PASS
- [ ] **Step 5:** 커밋 `ai: 소리 목록 검사와 sounds.json·mp3·자산 목록 쓰기`

### Task 5: 보고서와 합성 모드 끝까지 실행 (⑥)

**Files:** Modify `ai/src/build_sounds.py`, `ai/tests/test_build_sounds.py`; Delete `ai/src/features.py`; Create `ai/reports/*`(실행 결과)

**Interfaces:**
- Produces: `write_report(lib: dict, report_dir: Path, e2: dict[str, dict[str, float]]) -> None` — `cos_hist.png`(서로 다른 쌍 `max(0, 내적)`, 0.58 선), `pitch_vs_hand.png`, `report.md`(E2 순위 표: 5개 대조 소리를 `emb`·`mel`·`hand`로 각각 줄 세운 것 / 쌍별 중앙값 / 소리별 2단계 후보 수 = 영점 조정 유사도 `clip((dot−0.58)/(1−0.58),0,1)` ≤ 0.5인 다른 소리 수 / `pitch`–`hand` 상관, |r| > 0.7이면 맨 위 경고 / 소리별 특징 표). `main`이 쓰기 뒤에 `ai/reports/`로 부른다

- [ ] **Step 1: 실패하는 테스트** `test_report_files(tmp_path, fake_yamnet)`: 소리 4개로 `write_report` → 파일 3개가 있고 `report.md`에 `2단계 후보`와 E2 표 머리줄이 있음
- [ ] **Step 2:** `PY -m pytest tests -k report -v` → FAIL
- [ ] **Step 3:** 구현(matplotlib `Agg` 백엔드). `features.py` 삭제
- [ ] **Step 4:** `PY -m pytest tests -v`(yamnet 포함) → 전부 PASS
- [ ] **Step 5:** `PY -m src.build_sounds --synthetic` → `ai/out/src/data/sounds.json`이 생기고 `app/`은 `git status`에 변화 없음. `ai/reports/report.md`의 E2 표를 읽고 결론 한 단락(어느 방식이 520 닮음을 잘 재는가)을 report.md 끝에 적는다
- [ ] **Step 6:** `cd ../app && npm run check` → 통과(앱은 바뀐 것이 없음을 확인)
- [ ] **Step 7:** `PROGRESS.md` "완료" 증거 칸에 돌린 명령과 결과를 적고 커밋 `ai: 파이프라인 보고서와 합성 소리 실행 결과`

## 이 계획 밖 (I-3 뒤)

- 실제 `sounds.csv`로 실행 → `app/`에 출력 커밋, 보고서의 쌍별 중앙값과 2단계 후보 수를 보고 `SIM_ZERO`를 한 번 갱신(근거 한 단락), 팀 거슬림 평가(E6)
