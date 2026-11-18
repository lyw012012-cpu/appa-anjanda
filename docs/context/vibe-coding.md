# 바이브 코딩 3분할 — 누가 어떤 파일을 고치나

> 세 사람이 각자 Claude로 동시에 작업해도 충돌하지 않도록 **고칠 수 있는 파일**을 나눈다. 이음새는 [contracts.md](contracts.md)가 정하고, 계약을 바꿀 때만 서로 맞춘다.

담당 (2026-11-18 확정): **A** lyw012012-cpu · **B** yj2trigger · **C** chickenbbqr. 이슈 내용과 완료 조건은 [issues-draft.md](issues-draft.md).

## 공통 규칙

- 브랜치: `develop`에서 `feature/<영역>-<이름>`(예: `feature/b-recommend`). PR은 `develop`으로, 작게 자주
- **내 영역 밖 파일은 고치지 않는다.** 필요하면 그 담당에게 말하거나 PROGRESS.md 막힘에 적는다
- 공유 파일(`app/src/types/contracts.ts`, `docs/context/contracts.md`)은 `docs(contract):` PR로만 고친다. PR 링크를 팀에 공유하고, 머지된 뒤 각자 `develop`을 받는다
- 모양만 있는 함수는 `"아직 구현 안 됨 (I-x)"` 오류를 던진다. 몸통을 채울 때 **함수 모양(이름·인자·반환 타입)은 바꾸지 않는다**
- 끝내기 전: `cd app && npm run check`(앱) 또는 `cd ai && python -m pytest tests`(AI) 통과, PROGRESS.md 갱신

## 영역별 파일

| | A 알람·화면 | B 추천 | C AI |
|---|---|---|---|
| 이슈 | I-1, I-4, I-8, I-9 | I-5, I-6, I-7, I-13 | I-2 재실행, I-3, I-14, (I-12) |
| 고치는 파일 | `app/src/lib/alarm.ts`·`sequence-player.ts`·`firebase.ts`, `app/src/stores/*`(`orchestrator.ts` 포함), `app/src/app/**`, `app/app.json`·`eas.json`, `firestore.rules` | `app/src/lib/recommend.ts`·`sound-library.ts`, `app/src/config.ts`의 **값**, 추천 테스트, 시뮬레이션 | `ai/**`, 파이프라인 출력(`app/src/data/sounds.json`, `sound-assets.ts`, `app/assets/sounds/`) |
| 계약 | C5·C6·C7·C10·C11·C12 | C8·C9, 8절 가짜 데이터 기대값 | C1·C2·C3 |
| 먼저 쓰는 데이터 | `sounds.fixture.json` | `sounds.fixture.json`(8절이 곧 테스트) | 합성 소리(`--synthetic`) |
| 기다리지 않는 방법 | `planAlarm`이 아직 오류면 가짜 계획을 화면에서 만들어 쓴다 | 이벤트는 테스트 안에서 손으로 만든다 | 실제 음원 전에는 합성 소리로 |

## 지금 풀어야 할 열린 곳 (2026-11-18 문서 점검)

| 담당 | 내용 |
|---|---|
| B | 1단계 후보가 다 풀어도 비는 경우(고른 소리가 모두 `comfortCap` 초과 등) 규칙이 없다. C8 규칙 11 |
| B | 영점 0.58에서 `contrastMaxSim`·`prefMinSim` 0.5 = 원래 코사인 약 0.79. 대비는 거의 항상 통과, 선호는 고른 소리 자신만 남을 수 있다. 8절은 영점 0이라 이 효과가 테스트에 안 보인다 |
| A | 재확인 "응답 없음"의 시간 제한과 "응답"이 무엇인지(C5). 상태 질문 60초 시간 초과 |
| C | `sim520.hand`의 400 Hz 값은 0.5가 아니라 0.38(650 Hz만 0.5). 실제 목록에서 `hand`가 0이 아닌 소리 수를 보고에 넣는다. 거슬림 기준점(E6) |

## 시작 문장 (각자 Claude에 그대로 붙여 넣기)

**A**
> 나는 A(알람·화면) 담당이다. docs/context/vibe-coding.md의 A 파일만 고친다. AGENTS.md 0절 순서대로 시작하고, I-1 실기기 확인 1~5를 먼저 끝낸 뒤 I-4(이벤트 기록: stores/event-store.ts·settings-store.ts를 contracts C7대로)를 진행해 줘.

**B**
> 나는 B(추천) 담당이다. docs/context/vibe-coding.md의 B 파일만 고친다. AGENTS.md 0절 순서대로 시작하고, jest-expo를 설치한 뒤 contracts.md 8절 가짜 데이터의 기대 결과를 테스트로 먼저 쓰고(I-6·I-7) lib/recommend.ts의 computeStats → stageRewards → fitBandit → planAlarm 순서로 채워 줘. vibe-coding.md "열린 곳"의 B 항목은 코드 전에 계약 PR로 제안해 줘.

**C**
> 나는 C(AI) 담당이다. docs/context/vibe-coding.md의 C 파일만 고친다. AGENTS.md 0절 순서대로 시작하고, docs/context/pipeline-design.md를 읽은 뒤 I-3 소리 목록(ai/data/sounds.csv, 라이선스 칸 필수)을 모아 `python -m src.build_sounds --csv data/sounds.csv --app ../app`로 실제 소리 출력을 만들어 줘. 영점 0.58은 실제 목록 중앙값으로 한 번만 갱신한다.
