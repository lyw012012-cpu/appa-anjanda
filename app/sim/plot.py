"""out/results.json만 읽어 그림 2장을 그린다. 추천을 다시 구현하지 않는다(I-13).

실행: python sim/plot.py   (app/ 에서)
"""
import json
import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from matplotlib import font_manager

_have = {f.name for f in font_manager.fontManager.ttflist}
matplotlib.rcParams["font.family"] = next((f for f in ["Malgun Gothic", "AppleGothic", "NanumGothic"] if f in _have), "DejaVu Sans")
matplotlib.rcParams["axes.unicode_minus"] = False

out = pathlib.Path(__file__).parent / "out"
r = json.loads((out / "results.json").read_text(encoding="utf-8"))
users = r["users"]
days = range(1, r["meta"]["days"] + 1)
NOTE = f"시뮬레이션 가정 안에서의 결과, 효과의 증거가 아님 (14일 × {r['meta']['reps']}회 반복 평균, 반응 모델 값은 모두 가설)"

STYLE = {
    "random": ("무작위 돌리기", "#9aa0a6", "--"),
    "prior": ("학습 없는 규칙", "#f2a900", "-."),
    "model": ("이 모델", "#1a73e8", "-"),
}

# 그림 1: 유형별 깬 단계 평균(위)과 안전장치까지 간 비율(아래)의 날짜별 추이
fig, axes = plt.subplots(2, len(users), figsize=(3.4 * len(users), 6.2), sharex=True)
for c, (uid, u) in enumerate(users.items()):
    for arm, (label, color, ls) in STYLE.items():
        d = u["arms"][arm]["days"]
        axes[0][c].plot(days, d["wakeStage"], color=color, ls=ls, lw=2, label=label)
        axes[1][c].plot(days, d["safetyRate"], color=color, ls=ls, lw=2, label=label)
    axes[0][c].set_title(u["label"], fontsize=11)
    axes[0][c].set_ylim(0.9, 4.1)
    axes[0][c].set_yticks([1, 2, 3, 4], ["1단계", "2단계", "3단계", "안전장치"])
    axes[1][c].set_ylim(-0.02, 1.02)
    axes[1][c].set_xlabel("날짜")
    for ax in axes[:, c]:
        ax.grid(alpha=0.3)
        ax.set_xticks([1, 5, 10, 14])
axes[0][0].set_ylabel("깬 단계 (평균)")
axes[1][0].set_ylabel("안전장치 비율")
axes[0][0].legend(fontsize=8, loc="lower left")
fig.suptitle("유형별 깬 단계와 안전장치 비율 추이\n" + NOTE, fontsize=11)
fig.tight_layout()
fig.savefig(out / "fig1-wake-and-safety.png", dpi=150)
plt.close(fig)

# 그림 2: 학습한 가중치가 정답 쪽으로 가는가 (위: 정답 방향과의 코사인, 아래: 음높이 가중치)
fig, axes = plt.subplots(2, len(users), figsize=(3.4 * len(users), 6.2), sharex=True)
W = {
    "model": ("이 모델", "#1a73e8", "-"),
    "nohand": ("hand 특징 없음", "#d93025", "--"),
    "random": ("무작위(기록만 학습)", "#9aa0a6", ":"),
}
for c, (uid, u) in enumerate(users.items()):
    for arm, (label, color, ls) in W.items():
        d = u["arms"][arm]["days"]
        axes[0][c].plot(days, d["cos"], color=color, ls=ls, lw=2, label=label)
        axes[1][c].plot(days, d["pitchW"], color=color, ls=ls, lw=2, label=label)
    axes[0][c].set_title(u["label"], fontsize=11)
    axes[0][c].set_ylim(-0.2, 1.05)
    axes[1][c].axhline(0, color="black", lw=0.8)
    axes[1][c].set_xlabel("날짜")
    for ax in axes[:, c]:
        ax.grid(alpha=0.3)
axes[0][0].set_ylabel("정답 방향과의 코사인\n(단계·익숙함·520·음높이)")
axes[1][0].set_ylabel("학습한 음높이 가중치\n(⑥의 정답은 음수)")
axes[0][0].legend(fontsize=8, loc="lower right")
fig.suptitle("학습한 가중치의 추이\n" + NOTE, fontsize=11)
fig.tight_layout()
fig.savefig(out / "fig2-weights.png", dpi=150)
plt.close(fig)

# 요약 표 (마크다운)
rows = ["| 유형 | 비교군 | 깬 단계 평균 | 안전장치 비율 | 다시 잠든 비율 | 쓴 소리 수 | 남은 낯선 소리 | 정답 방향 코사인 | 음높이 가중치 |", "|---|---|---|---|---|---|---|---|---|"]
for uid, u in users.items():
    for arm, a in u["arms"].items():
        s = a["summary"]
        rows.append(
            f"| {u['label']} | {a['label']} | {s['wakeStage']['mean']:.2f} ± {s['wakeStage']['sd']:.2f} | {s['safetyRate']['mean']:.0%} | "
            f"{s['resleepRate']:.0%} | {s['uniqueSounds']:.1f} | {s['freshSoundsLeft']:.1f} | {s['finalCos']:.2f} | {s['finalPitchW']:+.2f} |"
        )
(out / "summary.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
print("ok")
