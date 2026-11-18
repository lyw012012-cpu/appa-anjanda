# 파이프라인 보고서

생성 2026-11-18T23:58:04+09:00 · 소리 30개 · 영점 0.58

## 유사도

- 서로 다른 쌍의 max(0, 내적) 중앙값: 0.6632
- 분포: ![cos_hist](cos_hist.png)

### 2단계 후보 수

영점 조정한 유사도가 0.5 이하인 다른 소리의 수. 0이면 그 소리 다음에 대비 단계가 조건을 푼다.

| 소리 | 2단계 후보 |
|---|---|
| beep_cowbell | 28 |
| beep_phone | 22 |
| beep_soft | 26 |
| beep_sonar | 29 |
| beep_square_520 | 28 |
| beep_triple_1k | 28 |
| bell_bicycle | 27 |
| bell_clang | 21 |
| bell_ding | 23 |
| bell_ding_beep | 28 |
| bell_ding_dong | 16 |
| bell_doorbell_ping | 27 |
| bell_glass_jingle | 28 |
| bell_glass_short | 28 |
| bell_jingle | 22 |
| bell_jingle_ring | 23 |
| bell_level_up | 23 |
| bell_mallet_ding | 15 |
| bell_plop | 27 |
| melody_glock_a | 19 |
| melody_glock_b | 20 |
| melody_glock_c | 22 |
| melody_glock_chime | 26 |
| melody_glock_d | 20 |
| melody_instrument | 29 |
| melody_marimba | 24 |
| melody_marimba_note | 15 |
| melody_ringtone_a | 24 |
| melody_ringtone_b | 19 |
| melody_ringtone_c | 19 |

## pitch–sim520.hand (R10)

- 상관 r = 0.21
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
| beep_cowbell | beep | 0.1197 | 0.4602 | 0.0 | 0.3232 | 0.0 | Cowbell, Doorbell, Vehicle horn, car horn, honking |
| beep_phone | beep | 0.198 | 0.1971 | 0.0 | 0.3159 | 0.0 | Telephone, Ringtone, Alarm |
| beep_soft | beep | 0.1964 | 0.0677 | 0.0 | 0.5255 | 0.0 | Beep, bleep, Sound effect, Music |
| beep_sonar | beep | 0.0257 | 0.4283 | 0.0 | 0.3624 | 0.0 | Music, Sonar, Sound effect |
| beep_square_520 | beep | 0.4469 | 0.3762 | 0.9998 | 0.6989 | 0.8914 | Music, Noise, Sound effect |
| beep_triple_1k | beep | 0.6254 | 0.3501 | 0.0012 | 0.6471 | 0.0 | Beep, bleep, Sound effect, Dial tone |
| bell_bicycle | bell | 0.3514 | 0.1934 | 0.1118 | 0.2535 | 0.0376 | Bicycle bell, Bell, Ding |
| bell_clang | bell | 0.7022 | 0.18 | 0.0 | 0.2476 | 0.108 | Ding, Clang, Doorbell |
| bell_ding | bell | 0.0915 | 0.2277 | 0.0 | 0.349 | 0.0156 | Ding, Music, Jingle, tinkle |
| bell_ding_beep | bell | 0.7163 | 0.375 | 0.0 | 0.3602 | 0.0 | Ding, Beep, bleep, Telephone bell ringing |
| bell_ding_dong | bell | 0.295 | 0.2171 | 0.01 | 0.3295 | 0.0186 | Ding, Doorbell, Ding-dong |
| bell_doorbell_ping | bell | 0.1432 | 0.3661 | 0.0 | 0.3053 | 0.0 | Doorbell, Ding-dong, Ding |
| bell_glass_jingle | bell | 0.7805 | 1.0 | 0.0 | 0.1814 | 0.1948 | Glass, Chink, clink, Jingle, tinkle |
| bell_glass_short | bell | 0.2606 | 0.2751 | 0.0007 | 0.2241 | 0.0 | Chink, clink, Glass, Ding |
| bell_jingle | bell | 0.1886 | 0.2043 | 0.0 | 0.26 | 0.0 | Ding, Jingle, tinkle, Music for children |
| bell_jingle_ring | bell | 0.2606 | 0.4173 | 0.0009 | 0.3312 | 0.0846 | Jingle, tinkle, Music, Ringtone |
| bell_level_up | bell | 0.0743 | 0.2333 | 0.0 | 0.3558 | 0.0251 | Ding, Chink, clink, Doorbell |
| bell_mallet_ding | bell | 0.2778 | 0.2258 | 0.0034 | 0.2799 | 0.1657 | Ding, Mallet percussion, Music |
| bell_plop | bell | 0.2136 | 0.2676 | 0.0 | 0.371 | 0.0 | Plop, Ding, Sound effect |
| melody_glock_a | melody | 0.1056 | 0.1732 | 0.0 | 0.2045 | 0.0013 | Music, Mallet percussion, Glockenspiel |
| melody_glock_b | melody | 0.3404 | 0.0 | 0.0781 | 0.2527 | 0.0 | Music, Mallet percussion, Glockenspiel |
| melody_glock_c | melody | 0.4344 | 0.0987 | 0.4862 | 0.3041 | 0.0 | Music, Mallet percussion, Glockenspiel |
| melody_glock_chime | melody | 0.6442 | 0.4959 | 0.0003 | 0.2525 | 0.0 | Music, Glockenspiel, Mallet percussion |
| melody_glock_d | melody | 0.0273 | 0.1467 | 0.0 | 0.23 | 0.1315 | Music, Mallet percussion, Glockenspiel |
| melody_instrument | melody | 0.0257 | 0.2726 | 0.0 | 0.3842 | 0.0 | Music, Musical instrument, Sound effect |
| melody_marimba | melody | 0.1525 | 0.1184 | 0.0 | 0.1419 | 0.0 | Mallet percussion, Percussion, Marimba, xylophone |
| melody_marimba_note | melody | 0.3561 | 0.1466 | 0.1788 | 0.2312 | 0.0 | Music, Mallet percussion, Marimba, xylophone |
| melody_ringtone_a | melody | 0.0 | 0.2073 | 0.0 | 0.2049 | 0.0 | Music, Mallet percussion, Percussion |
| melody_ringtone_b | melody | 0.1369 | 0.2751 | 0.0 | 0.192 | 0.0 | Music, Mallet percussion, Glockenspiel |
| melody_ringtone_c | melody | 0.0 | 0.2416 | 0.0 | 0.2405 | 0.0 | Music, Mallet percussion, Percussion |
