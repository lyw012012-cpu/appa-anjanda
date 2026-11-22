import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
// @ts-expect-error getReactNativePersistence는 firebase/auth의 react-native 빌드에만 있고 기본 타입에는 없다
import { getReactNativePersistence } from 'firebase/auth';
import { initializeAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

// 값은 app/.env 에서 읽습니다 (.env.example 참고)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

let auth: Auth | undefined;

/** 익명 로그인. 로그인 상태는 AsyncStorage에 남아 앱을 다시 켜도 같은 uid (contracts C11, D8). */
export async function ensureUid(): Promise<string> {
  auth ??= initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  await auth.authStateReady();
  return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
}

/** users/{uid}/events/{eventId}에 쓴다. 앱은 Firestore를 읽지 않는다(M3). */
export async function uploadEvent(eventId: string, data: Record<string, unknown>): Promise<void> {
  const uid = await ensureUid();
  await setDoc(doc(db, 'users', uid, 'events', eventId), data);
}
