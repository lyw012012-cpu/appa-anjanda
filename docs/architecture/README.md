# 아키텍처 제약 (기계적 제약)

> 구조 규칙과, 그 규칙을 **사람이 아니라 도구가 막는 방법**. 규칙의 근거는 [context/design.md](../context/design.md) 2·3절, 함수·데이터 모양은 [context/contracts.md](../context/contracts.md)가 기준이다. 검증을 언제·어떻게 돌리나는 [system/](../system/README.md).
> 규칙을 바꾸려면 코드보다 먼저 `docs(contract):` PR을 올린다 ([context/contracts.md 9절](../context/contracts.md#9-계약을-바꾸는-절차)).

전체 스타일: **모바일 앱 + 오프라인 전처리.** 서버 연산 없음, Firestore는 보관용(쓰기만, design.md 3절 AD6).

## 계층과 의존 방향 (앱)

`타입·config` ← `lib`(추천·알람·firebase) ← `stores`(Zustand 저장소 C7, 연결 순서 `orchestrator` C10) ← `app`(화면)

화살표 반대로만 import한다. 화면이 Firebase·알람 같은 부수효과를 직접 부르지 않고 `lib`를 거친다. 바꿀 곳이 어느 계층인지 모르겠으면 이 순서로 판단한다.

## 규칙과 강제 방법

상태: ✅ 적용됨 / ⬜ 제안 (아직 사람이 지킴)

| # | 규칙 | 출처 | 기계로 막는 방법 | 상태 |
|---|---|---|---|---|
| M1 | 휴대폰에서 신경망을 돌리지 않는다 | D4, AD1 | ESLint `no-restricted-imports`로 `@tensorflow/*`, `*tflite*`, `onnxruntime*` 금지 | ✅ |
| M2 | 추천 모듈(`lib/recommend.ts`, `lib/sound-library.ts`)은 순수·결정적 함수. 시간·무작위·저장소·네트워크 접근 금지. Thompson 표본·음량 흔들림의 난수는 입력 `seed`로 만든 결정적 난수만 쓴다(C8 규칙 6) | C8 | 두 파일에만 ESLint `no-restricted-imports`(`firebase`, `expo-*`, 저장소, alarm·firebase·stores를 별칭과 상대 경로 모두), `no-restricted-properties`(`Date.now`, `performance.now`, `Math.random`), `no-restricted-syntax`(인자 없는 `new Date()`), `no-restricted-globals`(`fetch`) | ✅ |
| M3 | 앱은 Firestore를 읽지 않는다 (쓰기만) | C11 | ESLint `no-restricted-imports`로 `firebase/firestore`의 `getDoc`·`getDocs`·`onSnapshot` 등 금지 | ✅ |
| M4 | 위 의존 방향. `lib/`·`stores/`는 화면을 import하지 않는다 | app/AGENTS.md | `lib/`·`stores/`에 ESLint `no-restricted-imports`로 `@/app/*` 금지 | ✅ |
| M5 | `sounds.json`·`sound-assets.ts`·`app/assets/sounds/`는 파이프라인 출력. 손으로 고치지 않는다 | C2, C3 | 앱 로더와 파이프라인이 둘 다 C2 규칙(ID 형식·정렬·임베딩 길이·L2 노름) 검사, 테스트로 확인 | ⬜ |
| M6 | 소리 ID는 `^[a-z][a-z0-9_]{0,31}$` (하이픈 금지) | 1절 | M5의 로더·파이프라인 검사에 포함 | ⬜ |
| M7 | `computeStats`·`stageRewards`·`fitBandit`·`planAlarm({ library, events, settings, config, now, seed })`(contracts C8), 알람 모듈(`lib/alarm.ts`) 함수 모양 고정 | AD2, C5 | contracts C4 공유 타입으로 선언 → 모양이 바뀌면 `tsc`가 실패 | ⬜ (타입 파일 생기면 ✅) |
| M8 | 실험으로 바뀔 값(이름은 contracts C9)은 `config.ts`에만 | AD5, C9 | 도구로 막기 어려움 → PR 리뷰 | — |
| M9 | `app/android/`·`app/ios/`를 커밋하지 않는다 | app/AGENTS.md | `app/.gitignore`의 `/android`, `/ios` | ✅ |
| M10 | 비밀 파일·`ai/data/`·`ai/models/`를 커밋하지 않는다 | README | `.gitignore` + PR 템플릿 체크박스 | ✅ |

M1~M4는 [app/eslint.config.js](../../app/eslint.config.js)에 있고 `npm run check`가 잡는다. 오류 메시지에 규칙 번호(M1~M4)와 이 문서 경로가 나온다.

**규칙 늘리는 법:** PR 리뷰에서 같은 지적이 두 번 나오면, 문서에 한 줄 더 쓰지 말고 이 표에 규칙을 올리고 가능하면 ESLint·검사로 막는다.
