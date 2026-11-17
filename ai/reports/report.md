# 파이프라인 보고서

생성 2026-11-18T05:19:14+09:00 · 소리 6개 · 영점 0.58

## 유사도

- 서로 다른 쌍의 max(0, 내적) 중앙값: 0.5207
- 분포: ![cos_hist](cos_hist.png)

### 2단계 후보 수

영점 조정한 유사도가 0.5 이하인 다른 소리의 수. 0이면 그 소리 다음에 대비 단계가 조건을 푼다.

| 소리 | 2단계 후보 |
|---|---|
| beep_520 | 5 |
| chime | 5 |
| sine_3100 | 5 |
| square_520 | 5 |
| sweep_500_3000 | 5 |
| white_noise | 5 |

## pitch–sim520.hand (R10)

- 상관 r = -0.63
- 산점도: ![pitch_vs_hand](pitch_vs_hand.png)

## E2: 520 Hz 닮음 방식별 순위

| 순위 | emb | mel | hand |
|---|---|---|---|
| 1 | square_520 (1.00) | square_520 (1.00) | square_520 (1.00) |
| 2 | beep_520 (0.67) | beep_520 (0.90) | beep_520 (1.00) |
| 3 | sweep_500_3000 (0.62) | white_noise (0.16) | sweep_500_3000 (0.00) |
| 4 | sine_3100 (0.47) | sweep_500_3000 (0.00) | sine_3100 (0.00) |
| 5 | white_noise (0.33) | sine_3100 (0.00) | white_noise (0.00) |

## 소리별 특징

| 소리 | 계열 | pitch | harshness | hand | emb | mel | top3 |
|---|---|---|---|---|---|---|---|
| beep_520 | beep | 0.4469 | 0.3581 | 0.9998 | 0.6705 | 0.9016 | Music, Noise, Sound effect |
| chime | melody | 0.5033 | 0.0 | 0.2734 | 0.5556 | 0.0925 | Ding, Beep, bleep, Doorbell |
| sine_3100 | beep | 0.9355 | 0.043 | 0.0 | 0.4654 | 0.0 | Sine wave, Chirp tone, Beep, bleep |
| square_520 | beep | 0.4469 | 0.1781 | 0.9998 | 1.0 | 1.0 | Synthesizer, Beep, bleep, Keyboard (musical) |
| sweep_500_3000 | beep | 0.6779 | 0.0 | 0.0 | 0.6199 | 0.0 | Synthesizer, Theremin, Keyboard (musical) |
| white_noise | other | 0.5 | 0.3326 | 0.0 | 0.3273 | 0.1629 | White noise, Static, Noise |
