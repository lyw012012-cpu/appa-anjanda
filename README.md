# 아빠 안잔다 — 알람 적응 방지 앱

알람 소리를 특징 벡터로 바꿔 AI로 분석하고, 사용자가 익숙해져 못 깨는 일이 없도록 매번 효과적인 알람 소리를 골라주는 앱입니다. (엘리스 AI챌린지 공모전 출품, 마감 11/22)

| 영역 | 기술 |
| --- | --- |
| 앱 | Expo (React Native), TypeScript, Expo Router |
| 상태관리 | Zustand |
| UI | React Native Reusables |
| 서버 | Firebase (Firestore, Storage, Cloud Functions) |
| AI | Python (librosa, PyTorch) |
| 개발 도구 | VS Code + Claude Code |

## 폴더 구조
```
app/      Expo 앱 (화면은 app/src/app, 스토어는 app/src/stores, Firebase는 app/src/lib)
ai/       Python 특징 추출·모델 학습 (ai/README.md 참고)
.vscode/  팀 공용 VS Code 설정과 권장 확장
.github/  PR 템플릿
CLAUDE.md Claude Code가 읽는 프로젝트 규칙
```

## 처음 시작하기
1. 필요한 것: Git, Node.js 20 이상, Python 3.11 이상, VS Code, 휴대폰의 **Expo Go** 앱
2. 저장소 받기
   ```bash
   git clone https://github.com/<OWNER>/<REPO>.git
   cd <REPO>
   git switch develop
   ```
3. VS Code로 폴더를 열면 오른쪽 아래에 **권장 확장 설치** 알림이 뜹니다. 모두 설치하세요 (Claude Code 포함).
4. 앱 실행
   ```bash
   cd app
   npm install
   cp .env.example .env     # Firebase 값은 팀 단톡방/드라이브에서 받아 채우기
   npx expo start           # QR을 Expo Go로 스캔
   ```
5. AI 환경은 [ai/README.md](ai/README.md)를 따르세요.

> 패키지 추가는 `npm install` 대신 `npx expo install <패키지>`를 쓰세요. Expo SDK에 맞는 버전이 설치됩니다.

## 브랜치 전략

```
main      ← 배포·제출용. 직접 push 금지, develop에서 PR로만 병합
develop   ← 기본 개발 브랜치. 기능 브랜치를 PR로 병합
feature/* ← 기능 하나당 하나 (develop에서 만들어 develop으로 PR)
fix/*     ← 버그 수정
```

- **main**: 배포(제출)할 때만 `develop → main` PR을 만들어 병합합니다. 보호 규칙으로 직접 push가 막혀 있습니다.
- **develop**: GitHub 기본 브랜치입니다. 직접 push하지 말고 PR로 병합하는 것을 원칙으로 합니다.
- **기능 브랜치 이름**: `feature/alarm-list`, `feature/sound-vector`, `fix/snooze-crash` 처럼 영어 소문자와 하이픈으로.

### 하루 작업 흐름
```bash
git switch develop
git pull                                  # 최신 develop 받기
git switch -c feature/alarm-list          # 새 기능 브랜치
# ... 작업 ...
git add .
git commit -m "feat: 알람 목록 화면 추가"
git push -u origin feature/alarm-list     # GitHub에서 develop 대상으로 PR 생성
```
- PR은 팀원 1명 이상이 확인한 뒤 병합합니다.
- 오래 걸리는 작업은 중간중간 `git pull origin develop`으로 최신 내용을 합쳐 충돌을 줄이세요.
- 병합된 기능 브랜치는 삭제합니다.

### 커밋 메시지
`feat:` 기능 추가, `fix:` 버그 수정, `refactor:` 구조 변경, `docs:` 문서, `chore:` 설정·기타, `ai:` 모델·데이터 작업

### 역할이 겹치지 않게
3명이 같은 파일을 동시에 고치면 충돌이 잦습니다. GitHub **Issues**에 할 일을 올리고 담당자를 지정한 뒤, 이슈 하나당 브랜치 하나로 작업하세요.

## 팀원 초대 방법 (저장소 관리자)
1. GitHub 저장소 → **Settings** → **Collaborators** → **Add people**
2. 팀원의 GitHub 아이디 입력 → 초대
3. 팀원은 이메일 또는 https://github.com/notifications 에서 **초대 수락**

## Claude Code 사용
- VS Code에서 Claude Code 확장을 열면 루트의 `CLAUDE.md`(프로젝트 규칙)와 `app/AGENTS.md`(Expo 규칙)를 자동으로 참고합니다.
- 개인 설정은 `.claude/settings.local.json`, 개인 메모는 `CLAUDE.local.md`에 두세요 (git에 안 올라감).
- Claude에게도 "develop에서 feature 브랜치를 만들어 작업하고 PR로 올려줘"처럼 같은 브랜치 규칙을 따르게 하세요.

## 비밀 정보
`.env`, Firebase 서비스 계정 키, `google-services.json` 등은 절대 커밋하지 마세요. `.gitignore`에 등록돼 있습니다.
