---
description: 달성 과제 보기 — 밀린 PR, 이슈, 설계·결정할 것, 개발할 것을 한 화면에
allowed-tools: Bash(gh pr list:*), Bash(gh issue list:*), Bash(gh api user:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(date:*), Read
---

읽기만 한다. 파일·GitHub를 고치지 않는다.

## 모을 것 (한 번에 병렬로)

- 오늘 날짜: !`date +%Y-%m-%d`
- 열린 PR: !`gh pr list --state open --json number,title,author,createdAt,isDraft,reviewDecision,reviewRequests,headRefName,url`
- 열린 이슈: !`gh issue list --state open --limit 50 --json number,title,assignees,labels,milestone,url`
- 내 GitHub 아이디: !`gh api user --jq .login`
- 현재 브랜치와 변경: !`git branch --show-current` / !`git status --short`
- `PROGRESS.md`를 읽는다.

## 보여 줄 형식 (한국어, 이 순서, 해당 없는 칸은 "없음")

```
📅 오늘 YYYY-MM-DD · 마감 2026-11-22 (D-n) · 지금 마일스톤: Mx

① 밀린 PR 확인
② 이슈
③ 설계·결정할 것
④ 개발할 것
⑤ 지금 내 작업 상태 (브랜치, 커밋 안 한 변경)
👉 오늘 먼저 할 3가지
```

- ① 열린 PR마다 번호·제목·작성자·열린 지 며칠. **밀림** 표시 기준: 리뷰 없이 24시간 넘음, `CHANGES_REQUESTED`, 또는 리뷰 요청 대상이 나. 초안(draft)은 따로 표시.
- ② 열린 이슈를 담당자별로. 담당자 없는 이슈는 "담당 없음"으로 묶는다. 이슈가 하나도 없고 PROGRESS.md D3이 ⬜이면 "이슈 미등록 → D3 먼저"라고 쓴다.
- ③ PROGRESS.md 1절에서 ✅가 아닌 것만. 기한이 오늘 이전이면 ⚠️ 지남.
- ④ PROGRESS.md 2절에서 ✅가 아닌 것만, 마일스톤 순. 기한이 지났으면 ⚠️, "먼저 필요"가 모두 ✅이거나 "—"면 ▶ 지금 시작 가능.
- 👉 고르는 순서: 밀린 PR 리뷰 → 기한 지난 설계·결정 → 기한 지난 개발 중 시작 가능한 것. 각 항목에 한 줄 이유.
- PR·이슈 상태는 GitHub 결과를 믿고, PROGRESS.md와 다르면 "PROGRESS.md 갱신 필요"라고 짚는다.
- `gh`가 실패하면(로그인 안 됨 등) 그 칸에 오류 한 줄을 쓰고 나머지는 계속 보여 준다.
