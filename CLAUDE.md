# CLAUDE.md

알람 적응 방지 앱 "아빠 안잔다". 3명이 협업하는 공모전 프로젝트입니다 (마감 2026-11-22).

## 구조
- `app/` Expo (React Native) + TypeScript 앱. Expo 관련 규칙은 `app/AGENTS.md`를 반드시 따를 것.
  - 화면(라우트): `app/src/app/` (Expo Router)
  - 상태관리: Zustand, 스토어는 `app/src/stores/`
  - UI 컴포넌트: React Native Reusables 우선 사용
  - Firebase 초기화: `app/src/lib/firebase.ts`, 설정값은 `app/.env` (`EXPO_PUBLIC_` 접두어)
- `ai/` Python. 알람 소리 특징(MFCC, 스펙트럼, 음량 포락선) 추출과 모델 학습.
  - `ai/data/`, `ai/models/`는 git에 올리지 않음.

## 명령어
```bash
cd app && npx expo start          # 앱 실행
cd app && npx tsc --noEmit        # 타입 검사
cd app && npx expo lint           # 린트
cd app && npx expo install <pkg>  # 패키지 추가 (npm install 대신)
cd ai && python -m src.features <wav>
```

## Git 규칙 (반드시 지킬 것)
- `main`에 직접 커밋·push 금지. 배포 때만 `develop → main` PR.
- `develop`에도 직접 push하지 말고, `develop`에서 `feature/<이름>` 또는 `fix/<이름>` 브랜치를 만들어 작업 후 `develop` 대상 PR.
- 작업 전 `git pull`로 develop 최신화.
- 커밋 메시지 접두어: feat / fix / refactor / docs / chore / ai
- `.env`, 키 파일, 오디오 데이터, 모델 가중치는 커밋하지 않기.

## 작업 원칙
- 끝내기 전에 `npx tsc --noEmit`과 `npx expo lint`를 통과시킬 것.
- 사용자에게 보이는 문구와 주석은 한국어로.
