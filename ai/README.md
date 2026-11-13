# ai/ — 알람 소리 특징 추출과 모델 학습 (Python)

## 처음 설정
```bash
cd ai
python -m venv .venv
# Windows: .venv\Scripts\activate   /  macOS·Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## 폴더
- `src/` 특징 추출·모델·학습 코드
- `notebooks/` 실험용 노트북 (결과 정리 후 코드는 `src/`로 옮기기)
- `data/` 원본 오디오·데이터셋 (**git에 올리지 않음**, 팀 드라이브로 공유)
- `models/` 학습된 가중치 (**git에 올리지 않음**)

## 실행 예시
```bash
python -m src.features data/alarm_example.wav
```
