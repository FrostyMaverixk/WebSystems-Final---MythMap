# Myths Map — Philippine Mythology Interactive Atlas

An interactive Philippine folklore atlas built with **React 19**, **Vite**, **Mapbox GL JS v3.35.2**, **Three.js r160**, and **Firebase (Free Spark Plan: Hosting, Authentication, Cloud Firestore)**.

## Key Features

- **Archival Parchment & WebGL Engine:** Custom GLSL ocean wake shaders using pre-baked Philippine coastal distance fields (`public/assets/ph-distance-field.png/.json`), local coastline GeoJSON, bundled in the app.
- **Dynamic Built-In Gallery:** `scripts/bake-gallery.mjs` runs automatically before `npm run dev` and `npm run build` (`predev` / `prebuild`), scanning `public/assets/` and generating `public/assets/gallery.json` from all recognized images.
- **Firebase Free Spark Plan:** Static hosting from `dist/`, Firebase Auth (Guest via Anonymous Auth, Explorer self-registration & sign-in, Admin role via `users/{uid}.role === 'admin'`), and Cloud Firestore.
- **User Myth Image Uploads:** Isolated Cloudinary Unsigned Upload adapter (`src/services/imageUpload.js`) validating PNG/JPEG/WebP up to 5 MB with live preview and progress.
- **Browser-Safe External APIs (`src/services/externalApis.js`):**
  - **Mapbox Geocoding API v6:** Auto-fills Region when dropping a pin on the Philippine map.
  - **Open-Meteo Weather API:** Live temperature/condition pill, cloud wind-speed scaling, and dusk lighting tint in 3D encounters at night (`Weather data by Open-Meteo.com`, CC BY 4.0).
  - **Wikipedia REST API:** Collapsible Cultural & Regional Context card in the Story Reader.
- **Per-Creature Discussion Threads & Reviews:** Paginated discussions (20/page + Load more, 1-level replies, Guest nicknames, Admin pin/delete) and categorized 1–5 star Reviews (1 per account per myth).

## Quick Start

1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your `VITE_MAPBOX_TOKEN`, `VITE_FIREBASE_*` keys, and optional `VITE_CLOUDINARY_*` keys.
3. Start development server (automatically bakes `public/assets/gallery.json`):
   ```sh
   npm run dev
   ```
4. Build for production:
   ```sh
   npm run build
   ```
5. Preview or deploy with Firebase CLI:
   ```sh
   firebase emulators:start --only hosting,auth,firestore
   firebase deploy
   ```

## Setting Up an Admin Account

New self-registered accounts are always created with `role: "user"` (enforced in `firestore.rules`). To designate an Administrator, open **Cloud Firestore** in the Firebase Console (or Emulator UI), find `users/{uid}`, and set its `role` field to `admin`.
