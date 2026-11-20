# PROGRESS.md — 달성 과제와 진행 상황

> Claude Code에서 `/todo`를 치면 이 파일과 GitHub의 PR·이슈를 합쳐 "지금 할 일"을 보여 준다.
> PR·이슈 상태는 GitHub이 원본이라 여기 적지 않는다. 설계·개발 과제가 끝나거나 막히면 그 작업 PR에서 이 파일도 함께 고친다.
> 이슈 내용·완료 조건은 [docs/context/issues-draft.md](docs/context/issues-draft.md).

마지막 갱신: 2026-11-19 · 마감 2026-11-22 · 제출물: **기획안 + PoC**

## 현재 검증 상태

| 항목 | 상태 |
|---|---|
| 기준 검사 `cd app && npm run check` | ✅ 통과 (2026-11-16, PR #4) |
| 번들 `npx expo export --platform android` | ✅ 성공 (2026-11-16) |
| 자동 테스트 | 없음 (jest-expo 설치는 I-6, [docs/system/](docs/system/README.md)) |
| 기능 코드 | 알람 프로토타입(PR #10), 파이프라인(PR #11, 합성 소리), 뼈대(공유 타입·설정·모양만 있는 모듈). 11/19 정오까지 I-1 실기기 확인이 가장 급하다 |

## 1. 설계·결정할 것

팀이 정해야 코드가 움직이는 것. 상태: ⬜ 할 일 / 🔄 진행 중 / ✅ 끝 / ⛔ 막힘

| # | 과제 | 근거 | 누가 | 기한 | 상태 |
|---|---|---|---|---|---|
| D1 | 담당(A 알람·B 추천·C AI) 확정 | issues-draft 담당 제안 | 전원 | **11/18** | ✅ 2026-11-18: A lyw012012-cpu · B yj2trigger · C chickenbbqr ([vibe-coding.md](docs/context/vibe-coding.md)) |
| D2 | 아키텍처 결정 AD1~AD7 확정 | design.md 3절 (PoC 범위로 다시 씀, 2026-11-18) | 전원 | 11/18 | 🔄 계약 변경 PR로 제안 |
| D3 | 이슈 초안을 GitHub 이슈로 등록 (등록 전 중복 확인) | issues-draft | 누구든 | 11/19 | ✅ 2026-11-18: #14~#27, 담당자 지정 |
| D4 | 공모전 평가표 원문 확인 → design.md 0절 | design.md 0절 | 누구든 | 11/19 | 🔄 심사 기준 4개 확인(공고), 배점·기획안 형식은 대회 홈페이지 확인 필요 |
| D5 | 테스트 도구 확정 → jest-expo + pytest | contracts 10절 | — | — | ✅ 2026-11-17 |
| D6 | UI 라이브러리: React Native Reusables 설치할지 | AGENTS.md 2절, I-0 | 전원 | I-8 전 | ⬜ (설치하지 않고 기본 컴포넌트로 가는 것을 [제안]: 시간 절약) |
| D15 | 대비를 재는 방법(임베딩 거리 / 음량·음높이·거칠기 축) | ai-design.md 12절 2, contracts 10절 | B (I-13 결과로) | 11/21 | 🔄 기본값 임베딩 거리 |
| D16 | 단계 길이(30초)·스누즈 동작(2단계부터, 상한 2회) | ai-design.md 12절 1·3 | 전원 | 11/19 | 🔄 PR #7 제안값으로 계약에 넣음 |
| D7 | 소리 파일 형식·길이·위치 | contracts 10절, R1 | A (I-1 결과로) | 11/19 | ⬜ |
| D10 | 발표에 쓸 논문 원문 확인 | design.md 7절 `[미확인]` | C (I-14) | 11/21 | 🔄 2026-11-19: 4편 서지 확인, Rankin 2009·McFarlane 2020 본문, Bruck·Thomas 2008 초록, Thompson·Spencer 1966 본문 못 구함 ([literature.md](ai/reports/literature.md)). design.md 7절 수정은 PR에서 제안. 2026-11-20 PR #32 리뷰 반영: 2차 출처 수치 발표 금지, 특성 9 근거·한계 양쪽. **남음**: 리뷰가 제기한 Rankin 특성 3·4 원문 확인(PMC·Europe PMC 접속 실패), design.md 7절 수정 `docs:` PR |
| D11 | PR #4 하네스 엔지니어링 리뷰·병합 | — | 팀원 1명 | 11/17 | ✅ 병합 (2026-11-16) |
| D12 | AI 개념 설계 | design.md AD2, PR #7 ai-design.md | 모델 담당 | 11/18 | 🔄 PR #7 ai-design.md를 원안으로 계약 변경 PR에 반영: 3단계 순서, 특징 5개 밴딧, 단계별 보상, 상태 질문·재확인, 노출 기준 습관화. 대비 방법은 임베딩 거리를 기본값으로 [가설] |
| D14 | Expo 계정·EAS 프로젝트 연결 (`eas.json`, 개발 빌드) | design.md AD4, R1 | A | I-1 안에서 | 🔄 EAS 프로젝트 연결·개발 빌드 요청(PR #10) |

D8(익명 인증 유지)과 D13(Firebase 프로젝트)은 PR #10에서 끝냈다: `getReactNativePersistence(AsyncStorage)`, 콘솔에서 자기 경로 쓰기 OK·남의 경로 거부 확인. D9 보안 설계(C11 밖의 인증·권한)는 다음 단계로 미룬다. Firebase는 계속 쓴다(팀 결정, design.md AD6).

## 2. 개발할 것

| 이슈 | 마일스톤 (기한) | 영역 | 담당(제안) | 먼저 필요 | 상태 |
|---|---|---|---|---|---|
| I-0 레포 설정과 평가표 확인 | — | chore | 누구든 | — | 🔄 기본 브랜치·심사 기준·app.json 이름·README UI 줄·이슈 라벨 ✅ (PR #6), 배점 확인·README 기술 표 남음 |
| I-1 알람 경로 | M1 (11/19 정오) | app-alarm | A | — | 🔄 프로토타입 PR #10, 실기기 확인 1~5 남음 |
| I-2 오프라인 파이프라인 | M2 (11/20) | ai | C | — | 🔄 실제 소리 30개로 재실행 ✅ (`app/`에 출력). 짧은 소리는 YAMNet 입력만 4초 반복(2026-11-20, C3 계약 PR) → 쌍별 중앙값 0.5989로 영점 0.58과 거의 같음. 영점 갱신은 목록 확정 뒤. 이웃 0개 소리 8개라 `prefMinSim`은 B 판단 |
| I-3 소리 목록 수집 | M1 (11/19) | ai | C | — | 🔄 30개(Pixabay 28 + 합성 2)·라이선스 표 ✅. 3계열이라 "4~6계열" 미달(자연음 없음), 계열은 YAMNet 초안이라 듣고 확인 필요, 원본 팀 드라이브 공유 남음 |
| I-4 이벤트 기록 | M2 (11/20) | app-alarm | A | I-1 | ⬜ |
| I-5 소리 목록 로드 | M2 (11/20) | app-recommend | B | I-2 | ⬜ |
| I-6 습관화와 설정 파일 | M1 (11/19) | app-recommend | B | — | ⬜ |
| I-7 보상·사람별 학습·3단계 계획 | M2 (11/20) | app-recommend | B | I-6 | ⬜ |
| I-8 알람 화면 | M2 (11/20) | app-alarm | A | I-1 | 🔄 템플릿 정리 ✅ (PR #4) |
| I-9 한 바퀴 연결 | M2 (11/20) | app-alarm | A | I-4·I-7·I-8 | ⬜ |
| I-11 기획안·PoC 제출 | 제출 (11/22) | — | 전원 | I-9·I-13·I-14 | ⬜ |
| I-12 세 쌍 비교 (시간이 남으면) | M3 (11/21) | ai | C (응답은 전원) | I-3 | 🔄 문항 30개·듣기 페이지·채점 도구 ✅ (`ai/src/triplets.py`). 팀 3명 응답(각 15분) → `score` → 결론 남음 |
| I-13 시뮬레이션: 무작위 대 모델 | M3 (11/21) | app-recommend | B | I-7 | ⬜ |
| I-14 문제 근거: 설문과 문헌 | M1 배포 (11/19) → M3 정리 (11/21) | ai | C | — | 🔄 설문 4문항 Google 설문지로 만듦(2026-11-19, [survey.md](ai/reports/survey.md)), 응답 수집 중(11/21 마감). 해석 규칙(문항 2 과대 추정, 문항 4 순서·모순 응답, 개수로 쓰기)과 결과 표 틀을 결과 보기 전에 정함(2026-11-20). 중간 집계 16명: 한 달에 한 번 이상 늦잠 10, 익숙해짐 느낌 8, 소리 안 바꿈 13, "익숙해져서 바꿈" 사실상 1 → 익숙해짐 때문에 소리를 바꾼다는 근거는 안 됨(survey.md). 11/21 마감 뒤 다시 집계. Google 설문지 보기 순서 무작위는 C가 직접 켜야 함. 논문 확인은 D10 |

뺀 이슈: I-10 실데이터 분석(기록이 3명 × 며칠이라 결론을 낼 수 없음. Firestore 보관은 유지).

"먼저 필요"의 정확한 의존성은 [issues-draft 의존성 그래프](docs/context/issues-draft.md#의존성-그래프).

## 3. 완료 (증거)

| 과제 | 증거 (돌린 명령과 결과, PR) |
|---|---|
| I-2 실제 소리 재실행 | `cd ai && python -m src.build_sounds --csv data/sounds.csv --app ../app` → 소리 30개, C2 검사 통과, `app/assets/sounds/` 640 KB. 결론 `ai/reports/conclusion.md`: 쌍별 중앙값 0.6632(영점은 0.58 유지, 목록 확정 뒤 한 번 갱신), 2단계 후보 15~29개, `hand`가 0.05를 넘는 소리 5개뿐, R10 r = 0.21. **확인 못 한 것**: `npm run check`·번들(이 PC에 Node 없음, `sound-assets.ts`를 아직 아무도 import하지 않음), 벨소리 `pitch` 0.00 원인. `npm run check`는 A가 PR #33 리뷰에서 통과 확인 |
| I-2 짧은 소리 반복 | PR #33 리뷰 1. 측정(원래 vs 반복): 1초 미만 14개의 YAMNet 코사인 0.52~0.98, 반복 4초 vs 10초 ≥ 0.97. `yamnet_embed`가 4초 미만 입력을 이어 붙여 반복(C3). 파이프라인 재실행 → 쌍별 중앙값 0.6632 → 0.5989, `pitch`·`harshness`·`hand`·`mel`·길이·mp3 그대로, `sim520.emb` 9개 0.05 넘게 변화, E2 순위 그대로. 영점 0.58에서 이웃 0개 소리 2 → 8. `python -m pytest tests` → 59 passed(YAMNet 포함, 새 2개). **확인 못 한 것**: `npm run check`(Node 없음. `sounds.json` 값만 바뀌고 모양은 같음) |
| I-2 파이프라인 (합성 소리까지) | `cd ai && .venv/Scripts/python -m pytest tests` → 28 passed (YAMNet 3개 포함). `python -m src.build_sounds --synthetic` → 소리 6개, `ai/out/`에만 출력, `app/` 변화 없음. `cd app && npm run check` 통과. 결론 `ai/reports/conclusion.md`. **남은 것**: 실제 소리(I-3)로 실행해 `app/`에 출력, 영점 0.58 한 번 갱신, 팀 거슬림 평가(E6). 계약 변경(C2·C3·C8 규칙 3)은 PR #9 댓글로 요청함 (2026-11-18) |

| I-3 소리 목록 (진행 중) | `cd ai && python -m src.collect_sounds` → 소리 30개(벨 13·멜로디 11·삑 6), `ai/reports/sound_credits.md` 라이선스 빈칸 0. `read_csv(data/sounds.csv)` 30줄 통과. `python -m pytest tests` → 57 passed. **확인 못 한 것**: Pixabay 라이선스·URL(팀원 제공 정보로 적음), 계열을 귀로 확인, `build_sounds` 전체 실행(I-2 재실행에서), `npm run check`(이 PC에 Node 없음, 앱 파일은 안 바꿈). 경보음·사이렌은 금지어 검사로 제외. McFarlane 2020 대입: 멜로디가 뚜렷하고 1단계(거슬림 ≤ 0.3)에 드는 소리는 벨소리 3개뿐, 520 닮음은 합성음 외 거의 0 |
| I-12 세 쌍 비교 (도구까지) | `cd ai && python -m src.triplets make` → `data/triplets.csv` 30문항(같은 계열 15·다른 계열 15, 모든 소리 1회 이상). `python -m src.triplets sheet` → `out/e1_listen.html` 0.8 MB(소리 이름 숨김, 답 CSV 내려받기). 세 공간 예측이 갈리는 문항: yamnet–logmel 16·yamnet–hand 11·logmel–hand 13 / 30(문항이 공간을 구별함). `python -m pytest tests -m "not yamnet"` → 69 passed(새 15개). **확인 못 한 것**: 듣기 페이지를 브라우저에서 끝까지 눌러 보기, 사람 응답(없음 → 일치율·결론 없음), `npm run check`(앱 파일 안 바꿈). `hand` 공간 정의(음높이·거슬림·520 닮음 − 0.5, L2 정규화)는 [제안]. **PR #34 리뷰 반영(2026-11-20)**: 판단은 같은 계열 문항만(계열이 YAMNet 초안이라 다른 계열 문항은 YAMNet에 유리, 확인 뒤 `score --all`), 바꾸려면 10%p 이상 + 95% 구간 아래 끝 > 0, 판단 후보는 logmel만(`hand`는 기록용), 응답자별 문항 순서·A·B 위치 섞기(헤드리스 Edge로 30문항 자동 응답: 재생·답 되돌리기 모두 맞음). r1 답 30개로 `score` 실행 → 같은 계열 15문항 yamnet 46.7%·logmel 60.0%, 구간 −20.0~+46.7%p라 YAMNet 유지(1명이라 결론 아님). r1은 순서를 섞기 전 페이지로 답함. 73 passed |

## 4. 막힘

| 과제 | 무엇에 막혔나 | 누가 풀 수 있나 |
|---|---|---|
| I-3 자연음 계열 | Wikimedia Commons 다운로드가 요청 제한(429)에 반복해 걸림(연락처 없는 User-Agent로 추정). 그래서 3계열로 감 | C: 연락처를 넣을지 팀 결정, 또는 다른 음원 |
| I-3 원본 공유 | Pixabay 원본 29개가 C의 PC `ai/data/library/`에만 있음 | C: 팀 드라이브에 올리기 |
