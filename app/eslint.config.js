// https://docs.expo.dev/guides/using-eslint/
// 아키텍처 규칙 M1~M4: docs/architecture/README.md
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// M1: 휴대폰에서 신경망을 돌리지 않는다 (design.md D4)
const noNeuralNet = {
  group: ['@tensorflow/*', '*tflite*', 'onnxruntime*'],
  message: 'M1: 앱에서 신경망을 돌리지 않습니다. 특징은 ai/ 파이프라인이 미리 계산합니다 (docs/architecture/README.md).',
};
// M3: 앱은 Firestore를 읽지 않는다 (contracts C11)
const noFirestoreRead = {
  name: 'firebase/firestore',
  importNames: ['getDoc', 'getDocs', 'onSnapshot', 'getDocFromServer', 'getDocsFromServer'],
  message: 'M3: 앱은 Firestore를 읽지 않습니다. 추천은 기기에 저장된 이벤트로 합니다 (docs/architecture/README.md).',
};
// M4: lib·stores는 화면을 import하지 않는다
const noScreenImport = {
  group: ['@/app/*', '**/app/*'],
  message: 'M4: lib·stores는 화면(src/app)을 import하지 않습니다. 의존 방향은 화면 → stores → lib (docs/architecture/README.md).',
};
// M2: 추천 모듈은 순수 함수 (contracts C8)
const noSideEffectImport = {
  group: ['firebase', 'firebase/*', 'expo-*', '@react-native-async-storage/*', '@/lib/alarm', '@/lib/firebase', '@/stores/*'],
  message: 'M2: 추천 모듈은 순수 함수입니다. 시간·저장소·네트워크·알람에 접근하지 않습니다 (docs/architecture/README.md).',
};

// flat config는 같은 규칙이 겹치면 나중 것이 덮어쓰므로, 범위가 좁은 설정에 앞의 금지 목록을 다시 포함한다.
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [noFirestoreRead], patterns: [noNeuralNet] }],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}', 'src/stores/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [noFirestoreRead], patterns: [noNeuralNet, noScreenImport] }],
    },
  },
  {
    files: ['src/lib/recommend.ts', 'src/lib/sound-library.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [noFirestoreRead], patterns: [noNeuralNet, noScreenImport, noSideEffectImport] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'M2: 추천 모듈은 현재 시각을 읽지 않습니다. 시각은 인자로 받습니다.' },
        { object: 'Math', property: 'random', message: 'M2: 추천 모듈은 무작위를 쓰지 않습니다. 같은 입력이면 같은 결과여야 합니다.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'M2: 추천 모듈은 네트워크에 접근하지 않습니다.' },
      ],
    },
  },
]);
