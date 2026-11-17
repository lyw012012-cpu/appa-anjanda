# AGENTS.md — Claude용 프로젝트 지도 (진입점)

> **아빠 안잔다**: 알람을 끄지 않거나 스누즈를 누르면 "이 소리에 익숙해졌다"고 판단하고, 익숙한 소리와 덜 닮았으면서 520 Hz 사각파와 닮은 소리를 골라 다음 알람으로 트는 Expo 앱. (엘리스 AI챌린지, 3명, 마감 2026-11-22)

이 파일은 요약과 안내만 담는다. 자세한 규칙은 링크된 원본 문서가 기준이고, 이 파일과 다르면 원본이 맞다. 같은 규칙을 다른 파일에 다시 쓰지 않는다.

## 0. 작업 순서 (매 세션)

**시작**
1. `git status`, `git log --oneline -5`로 브랜치와 최근 변경을 본다. `develop`이면 `git pull` 후 작업 브랜치부터 만든다.
2. `/todo`(또는 [PROGRESS.md](PROGRESS.md))로 밀린 PR·이슈·설계·개발 과제와 막힘을 확인한다.
3. `cd app && npm run check`로 기준 상태를 확인한다. **이미 실패하면 새 기능보다 그것부터 고치거나, 고칠 수 없으면 PROGRESS.md 막힘에 적는다.**
4. 이슈 하나만 골라 그 범위 안에서만 고친다. 범위 밖 문제는 고치지 말고 PROGRESS.md에 적는다.

**완료 조건** (모두 참일 때만 "완료"라고 말한다)
- 이슈의 완료 조건([docs/context/issues-draft.md](docs/context/issues-draft.md))대로 동작한다.
- `npm run check`와 관련 테스트를 **실제로 돌려** 통과했다. 테스트를 지우거나 기대값을 바꿔서 통과시키지 않는다.
- 돌린 명령과 결과를 PROGRESS.md "완료"의 증거 칸에 적었다.
- 설계·문서·규칙을 바꿨으면 [docs/system/design-checklist.md](docs/system/design-checklist.md)에서 해당 절을 확인했다. "됐다"고 말할 때는 어디까지 확인했는지(타입·린트 / 번들 / 휴대폰 / 서버 / 기능)와 확인 못 한 것을 같이 말한다.

**끝낼 때**: PROGRESS.md 갱신(확인 못 한 것 포함) → 안전한 상태에서 커밋 → 다음 세션이 시작 3번부터 바로 할 수 있게 둔다.

## 1. 먼저 읽을 문서

| 하려는 일 | 볼 문서 |
|---|---|
| 데이터·함수·파일 모양 (공유 타입, ID·시각 규칙) | [docs/context/contracts.md](docs/context/contracts.md) — **계약이 코드보다 먼저** |
| 아키텍처 제약: 구조 규칙과 도구로 막는 방법 | [docs/architecture/](docs/architecture/README.md) |
| 시스템 제약: 타입 검사·린트, 자동 테스트, 검증 다각화 | [docs/system/](docs/system/README.md) |
| 왜 이렇게 설계했나, 점수 공식, 실험 | [docs/context/design.md](docs/context/design.md) 3·4·6절 |
| 지금 맡은 이슈의 범위·완료 조건 | [docs/context/issues-draft.md](docs/context/issues-draft.md) |
| Expo API·명령 | [app/AGENTS.md](app/AGENTS.md) (Expo SDK 58 문서 기준, 기억에 의존 금지) |
| 지금 어디까지 했나 | [PROGRESS.md](PROGRESS.md) |
| 브랜치·커밋·셋업 | [README.md](README.md) |

## 2. 개요

| 영역 | 기술 | 위치 |
|---|---|---|
| 앱 언어 | JavaScript, TypeScript | `app/` |
| AI | 오프라인(Python 3.13, TensorFlow·YAMNet): 소리 특징 미리 계산. 앱(TypeScript): 노출 기준 습관화 + 사람별 학습(특징 5개 선형 Thompson sampling 밴딧) + 3단계 계획. design.md AD2, 원안 PR #7 ai-design.md | `ai/src/`, `app/src/lib/recommend.ts` |
| 프론트엔드 프레임워크 | Expo SDK 58 (React Native 0.88, React 19), 라우팅은 Expo Router (파일 = 화면) | `app/src/app/` |
| 서버·백엔드 | **없음.** 기록은 기기에만(design.md AD6). Firebase는 다음 단계라 `firebase.ts`는 PoC 코드에서 import하지 않는다 | `app/src/lib/firebase.ts`, `app/.env` |
| 상태 (화면에 영향을 주는 동적 데이터) | Zustand | `app/src/stores/` |
| UI (화면 구성 요소) | React Native Reusables | `app/src/components/` |
| 실험 값 | 실험으로 바뀔 값을 한 파일에 모음. 이름과 기본값은 contracts C9 | `app/src/config.ts` |

데이터 흐름: `ai/` 파이프라인 → `app/src/data/sounds.json`(커밋됨, 손으로 수정 금지) → 앱이 기기에 저장한 이벤트로 습관화·사람별 학습을 계산해 3단계 계획 → 단계별 재생 → 상태 질문·재확인 → 이벤트는 기기에만 저장.

## 3. 오류가 나면 어디를 보나

| 증상 | 먼저 볼 곳 |
|---|---|
| 패키지 버전 충돌, 빌드·번들 실패 | `npx expo-doctor`, `npx expo install --fix` |
| Firebase 연결·인증 실패 | `app/.env` 값(`EXPO_PUBLIC_` 접두어), `app/src/lib/firebase.ts`, contracts C11 |
| 네이티브 모듈이 Expo Go에서 안 됨 | 개발 빌드 필요 (`app/AGENTS.md` Rules) |
| 알람이 안 울림·늦게 울림 | design.md AD4, R1, contracts C5·C6 |
| `sounds.json` 로드·검증 실패 | contracts C2 규칙 (임베딩 길이·L2 노름·ID 정렬) |
| 추천 결과가 이상함 | contracts C8·C9, 8절 가짜 데이터의 기대 결과와 비교 |
| 타입 오류 | contracts C4 공유 타입과 실제 코드 비교 |

## 4. 명령

```bash
cd app && npx expo start          # 실행. 화면은 Expo Go로 확인 가능, 알람 소리는 EAS 개발 빌드에서만 (design.md R1·AD4, PROGRESS D14)
cd app && npm run check           # 타입 검사(tsc) → 린트(expo lint, 아키텍처 규칙 포함)
cd app && npx expo install <pkg>  # 패키지 추가 (npm install 금지)
cd ai && python -m src.features <wav>
```

- 빌드: EAS(`npx eas-cli@latest build`)만 쓴다. 로컬 Xcode·Android Studio 불필요.
- 테스트 (2026-11-17 확정): 앱 **jest-expo**, AI **pytest**, E2E 없음. 대상·검증 층은 [docs/system/](docs/system/README.md).
  - 설치 (아직 안 함): `cd app && npx expo install jest-expo jest @types/jest -- --save-dev`, `cd ai && pip install pytest`

## 5. 코딩 규칙

- 코드 식별자는 영어 camelCase, 화면 문구와 주석은 한국어.
- 화면이 아닌 코드(컴포넌트·훅·유틸)는 `src/app/` 밖에 둔다.
- ID·시각·단위는 contracts 1절을 따른다 (소리 ID는 소문자·숫자·밑줄, 시각은 오프셋 포함 ISO 8601, 시간 길이는 초 단위 + `Sec` 접미어).
- 실험으로 바뀔 값은 코드에 직접 쓰지 않고 `config.ts`에서 읽는다.
- 계약과 다른 코드가 필요하면 코드보다 먼저 `docs(contract):` PR을 올린다 (contracts 9절).
- 의존성 추가 전에 Expo 기본 모듈이나 이미 설치된 패키지로 되는지 확인한다.

## 6. 금지 규칙

- `app/android/`, `app/ios/`를 만들거나 직접 고치지 않는다. 네이티브 설정은 `app.json`과 config plugin으로 한다.
- `npm install`·`yarn add`로 패키지를 추가하지 않는다.
- `app/src/data/sounds.json`, `app/src/data/sound-assets.ts`, `app/assets/sounds/`를 손으로 고치지 않는다. 파이프라인으로 다시 만든다 (contracts C2·C3).
- `.env`, Firebase 키·서비스 계정 키, `google-services.json`, `ai/data/`(원본 오디오 포함), `ai/models/`는 커밋하지 않는다. 앱에 넣는 `app/assets/sounds/`는 커밋한다.
- 구조 규칙(신경망 금지, 추천 순수 함수, Firestore 읽기 금지, 의존 방향 등)은 [docs/architecture/](docs/architecture/README.md)를 따른다. 새 모듈·패키지를 넣거나 구조를 바꾸기 전에 반드시 읽는다.
- 한 번 쓴 소리 ID를 다른 소리에 다시 쓰지 않는다. 0~1 점수는 계산 중에 반올림하지 않는다 (contracts 1절).
- `[미확인]` 항목(평가 기준, 논문 수치 등)을 추측으로 채우지 않는다. 가짜·합성 데이터 결과로 "추천이 효과 있다"고 주장하지 않는다 (design.md 1.5·5절).
- `main`·`develop`에 직접 커밋·push하지 않는다. `feature/<이름>` 또는 `fix/<이름>` 브랜치를 만들고 `develop` 대상 PR로 올린다. `main`은 배포 때 `develop → main` PR로만.
- 커밋 접두어는 `feat` / `fix` / `refactor` / `docs` / `chore` / `ai` 중 하나.
- 보안 설계는 아직 하지 않았다. 확정된 것은 contracts.md C11(익명 인증, 자기 `uid` 경로만 읽고 쓰는 규칙)뿐이다. 그 밖의 인증·권한·암호화 방식은 만들지 말고 먼저 팀에 묻는다.
