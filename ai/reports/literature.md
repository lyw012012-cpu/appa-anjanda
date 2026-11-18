# 근거 논문 원문 확인 (I-14, D10)

> design.md 7절의 `[미확인]` 논문 4편을 2026-11-19에 확인했다. "확인 수준"은 실제로 읽은 것을 적는다. 읽지 못한 부분은 계속 미확인이다.

## 요약

| 논문 | 서지 정보 | 확인 수준 | design.md 7절과 맞나 |
|---|---|---|---|
| Thompson·Spencer 1966 | Thompson RF, Spencer WA. Habituation: a model phenomenon for the study of neuronal substrates of behavior. *Psychological Review* 73(1):16–43. doi:10.1037/h0022681 | 서지 정보만(2차 출처 2곳). 본문은 못 읽음. 내용은 Rankin 2009가 다시 정리한 것으로 확인 | 대체로 맞음. 아래 "일반화" 참고 |
| Rankin 외 2009 | Rankin CH, Abrams T, Barry RJ, 외. Habituation revisited: an updated and revised description of the behavioral characteristics of habituation. *Neurobiology of Learning and Memory* 92(2):135–138. doi:10.1016/j.nlm.2008.09.012 (PMC2754195) | **본문 읽음** | 맞음 |
| McFarlane 외 2020 | McFarlane SJ, Garcia JE, Verhagen DS, Dyer AG. Alarm tones, music and their elements: Analysis of reported waking sounds to counteract sleep inertia. *PLOS ONE* 15(1):e0215788. doi:10.1371/journal.pone.0215788 (PMC6986749) | **본문 읽음** | 맞음 |
| Bruck·Thomas 2008 | Bruck D, Thomas IR. Towards a better smoke alarm signal — an evidence based approach. *Fire Safety Science* 9:403–414. doi:10.3801/IAFSS.FSS.9-403 | 공식 초록만 | 맞음. 단 "3100 Hz"는 초록에 없음 |

## 1. Rankin 외 2009 (Thompson·Spencer 1966의 개정판)

1966년 논문의 습관화 특성 9개를 2007년 모임에서 다시 검토하고, 10번째(장기 습관화)를 더한 합의 문서다.

- 정의: 습관화는 "반복 자극으로 생기는 행동 반응의 감소", 탈습관화는 "다른 자극을 주면 원래 자극에 대한 줄어든 반응이 다시 커지는 것"
- 설계와 연결되는 특성:

| # | 특성 | 우리 설계에서 |
|---|---|---|
| 1 | 반복하면 반응이 점점 줄어 바닥에 닿는다 | 같은 소리에 익숙해짐(design.md 4.3) |
| 2 | 자극을 멈추면 반응이 적어도 일부 회복된다(자연 회복) | 오래 안 쓴 소리는 익숙함이 줄어듦(`tauDays`) |
| 5 | **약한 자극이 더 빨리 습관화되고, 아주 센 자극은 거의 줄지 않을 수 있다** | 아래 "주의할 점" |
| 7 | 같은 감각 안에서 감소는 **어느 정도 자극 특이적**이다(1966년의 "일반화"를 이 말로 바꿈) | 비슷한 소리로 익숙함이 옮겨 감(유사도 기반 일반화) |
| 8 | 다른 자극을 주면 줄어든 반응이 회복된다(탈습관화) | 2·3단계 대비·낯섦 |
| 9 | **탈습관화를 반복하면 그 효과도 줄어든다** | 아래 "주의할 점" |
| 10 | 어떤 조건에서는 습관화가 몇 시간~몇 주 간다(장기 습관화) | 며칠 단위로 익숙함이 쌓인다는 가정 |

- 수면·각성·알람 맥락은 **다루지 않는다**. 예시는 놀람 반사, 정향 반사, 스트레스 반응 등이다. design.md R7("알람 직접 근거는 아님")이 맞다.

## 2. Thompson·Spencer 1966

- 서지 정보는 Frontiers(2014) 참고문헌 목록과 Scilit에서 확인했다. 본문은 열람하지 못했다.
- 내용(특성 9개)은 저자 Thompson이 공동 저자로 참여한 Rankin 2009가 다시 정리한 것으로 확인한다. 발표에서는 Rankin 2009를 주 인용으로 쓰는 것을 [제안]한다.

## 3. McFarlane 외 2020

- 설계: 익명 온라인 자기보고 설문, 횡단 연구, 실험 조작 없음. 83명 중 50명 분석. 깬 뒤 **최대 4시간 안에** 응답
- 유의한 것: 참가자가 "멜로디가 있다"고 평가한 소리 ↔ 수면 관성(깬 직후 멍함) 감소 보고. Fisher 정확 검정 p = 0.023, 카이제곱 p = 0.044
- 유의하지 않은 것: 소리 종류(알람음·음악 등)와 수면 관성(p = 0.296), 소리에 대한 느낌과 수면 관성(p = 0.068)
- 저자 스스로 "예비 결과", 인과가 아닌 관련성이라고 밝힘. 한계: 자기보고, 수면 시간 등 미측정, 응답 시점이 늦음
- design.md 7절("50명 자기보고 설문, 유의하지 않은 결과도 함께 있음 → 약함")이 정확하다. 우리 쪽 대입(I-3): 멜로디가 뚜렷한 소리 3개를 1단계 후보로. 이것은 **보조 근거일 뿐**, 효과를 주장하지 않는다

## 4. Bruck·Thomas 2008

- 초록: 520 Hz 사각파가 지금의 고음 경보음보다 **적어도 4~12배 효과적**(75 dBA에서 계속 잠든 비율 기준). 여섯 개 실험 연구에서 시험했고, 대상은 어린이, 깊이 자는 젊은 성인, 노인, 난청인, 술 마신 사람
- 저자 결론: 전 인구용 새 화재경보 신호로 도입을 권고할 만큼 근거가 쌓였다
- 확인 못 한 것: 연구별 표본 수, 비교한 고음 신호가 정확히 3100 Hz인지(초록에는 "high pitched signal"만 있음). design.md 7절의 "표본 작음"과 "3100 Hz 순음"은 원문으로 확인하지 못했다
- 관련 논문(2차 출처로만 확인, 서지 미확인): Bruck, Thomas, Rouillard 2009(*Journal of Sleep Research*, 음높이·패턴과 각성 역치. "400·520 Hz 사각파가 다른 신호보다 각성 역치가 유의하게 낮음"), 난청인 대상 연구 2009(*Ear and Hearing*, 75 dBA에서 520 Hz가 92%, 고음 경보가 56%를 깨움)
- 주의: 화재경보 맥락의 연구다. "알람 소리가 520 Hz 사각파를 **닮을수록** 잘 깨운다"는 여전히 우리 가설(design.md R5)

## 주의할 점 (설계에 알릴 것)

1. **"세기가 아니라 낯섦으로 깨운다"의 근거 범위.** Rankin 2009 특성 5에 따르면 센 자극은 습관화가 덜 된다. 즉 문헌은 "세기로는 안 된다"를 말하지 않는다. 우리가 세기 대신 낯섦을 고른 이유는 **편안함(혐오감 없이)이라는 목표** 때문이지 문헌이 세기를 배제해서가 아니다. 기획안에 이렇게 적어야 정확하다
2. **탈습관화도 닳는다.** 특성 9: 같은 방식의 탈습관화를 반복하면 효과가 줄어든다. 3단계 낯섦 소리를 계속 바꿔야 한다는 우리 설계(최근 쓴 소리 제외, 노출 기준 습관화)와 맞는 근거로 쓸 수 있다
3. **"일반화"라는 말.** 1966년의 "일반화"는 2009년에 "자극 특이성"으로 바뀌었다. 뜻은 같은 방향(비슷한 소리에는 익숙함이 남고, 다른 소리로는 회복)이지만, 발표에서는 새 용어로 인용하는 게 안전하다

## 출처

- Rankin 2009 본문: https://pmc.ncbi.nlm.nih.gov/articles/PMC2754195
- McFarlane 2020 본문: https://pmc.ncbi.nlm.nih.gov/articles/PMC6986749
- Bruck·Thomas 2008 초록: https://publications.iafss.org/publications/fss/9/403
- Thompson·Spencer 1966 서지: https://www.frontiersin.org/articles/10.3389/fnint.2014.00097/full (참고문헌), https://scilit.com/publications/28fab18ff5be04ecd1605ea1452485f7
