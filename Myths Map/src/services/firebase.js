import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import {
  FIREBASE_CONFIG,
  USE_FIREBASE_EMULATORS,
  isFirebaseConfigured,
} from '../config/appConfig.js';

let app = null;
let auth = null;
let db = null;
let firebaseError = null;
let emulatorsConnected = false;

if (isFirebaseConfigured) {
  try {
    const config = USE_FIREBASE_EMULATORS && !FIREBASE_CONFIG.projectId
      ? {
          apiKey: 'demo-api-key',
          authDomain: 'demo-myths-map.firebaseapp.com',
          projectId: 'demo-myths-map',
          appId: '1:000000000000:web:demo',
        }
      : FIREBASE_CONFIG;

    app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);

    if (USE_FIREBASE_EMULATORS && !emulatorsConnected) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      emulatorsConnected = true;
    }
  } catch (error) {
    firebaseError = error;
    console.error('Firebase initialization failed:', error);
  }
}

export const firebaseReady = Boolean(app && auth && db && !firebaseError);
export const isLocalDemoMode = !firebaseReady;
export const isBackendReady = firebaseReady || isLocalDemoMode;
export { app, auth, db, firebaseError };
