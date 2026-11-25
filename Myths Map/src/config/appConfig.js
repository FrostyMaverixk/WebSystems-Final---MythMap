function cleanEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanMapboxToken(raw) {
  const trimmed = cleanEnv(raw);
  // Safeguard against accidental `MAPBOX_TOKEN=pk...` copy-paste prefixes.
  return trimmed.replace(/^MAPBOX_TOKEN=/i, '');
}

const hasEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env);

export const MAPBOX_TOKEN = cleanMapboxToken(hasEnv ? import.meta.env.VITE_MAPBOX_TOKEN : '');
export const MAPBOX_STYLE = cleanEnv(hasEnv ? import.meta.env.VITE_MAPBOX_STYLE : '');

export const FIREBASE_CONFIG = {
  apiKey: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_API_KEY : ''),
  authDomain: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : ''),
  projectId: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_PROJECT_ID : ''),
  storageBucket: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : ''),
  messagingSenderId: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : ''),
  appId: cleanEnv(hasEnv ? import.meta.env.VITE_FIREBASE_APP_ID : ''),
};

export const USE_FIREBASE_EMULATORS =
  cleanEnv(hasEnv ? import.meta.env.VITE_USE_FIREBASE_EMULATORS : '').toLowerCase() === 'true';

export const isFirebaseConfigured = Boolean(
  (FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId) ||
    USE_FIREBASE_EMULATORS
);

export const CLOUDINARY_CONFIG = {
  cloudName: cleanEnv(hasEnv ? import.meta.env.VITE_CLOUDINARY_CLOUD_NAME : ''),
  uploadPreset: cleanEnv(hasEnv ? import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET : ''),
};

export const isCloudinaryConfigured = Boolean(
  CLOUDINARY_CONFIG.cloudName && CLOUDINARY_CONFIG.uploadPreset
);
