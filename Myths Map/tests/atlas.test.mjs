import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREATURES,
  MAX_BOUNDS,
  PH_BOUNDS,
  hydrateCreaturesWithGallery,
  useLocalCoastline,
} from '../src/engine/config.js';
const {
  hasEncounterModel,
  createEncounterModel,
  habitatOf,
  classifyWeatherCode,
  makeEnvironment,
  setAtmosphereTint,
  updateEncounterAtmosphere,
} = await import('../src/engine/encounter-scene.js');
import { validateMythImage } from '../src/services/imageUpload.js';
import {
  isLocalDemoMode,
  quickSignInDemoRole,
  registerExplorer,
  resetLocalDemoData,
  listApprovedMyths,
  listMySubmissions,
  submitMyth,
  resubmitMyth,
  listAllMythsForAdmin,
  reviewMyth,
  listAccountsForAdmin,
  deleteAccountProfile,
  listStoryComments,
  createComment,
  togglePinComment,
  deleteComment,
  listStoryReviews,
  saveReview,
  toggleHighlightReview,
  toggleBookmark,
  formatFirebaseError,
  summarizeReviews,
} from '../src/services/api.js';
import {
  fetchLiveWeather,
  fetchMarineConditions,
  fetchOpenLibraryBooks,
  fetchSunriseSunset,
  fetchWikimediaCommonsMedia,
  fetchWikipediaLore,
  getLunarPhase,
} from '../src/services/externalApis.js';
import {
  coordinatesLabel,
  formatAtmosphereSummary,
  kindLabel,
  roleLabel,
  statusLabel,
} from '../src/utils/format.js';

const rootDir = fileURLToPath(new URL('../', import.meta.url));

test('CREATURES has 17 built-in entries with zero hardcoded image paths', () => {
  assert.equal(CREATURES.length, 17);
  for (const creature of CREATURES) {
    assert.ok(creature.id);
    assert.ok(creature.name);
    assert.equal(creature.banner, undefined);
    assert.equal(creature.marker, undefined);
    assert.equal(creature.illustration, undefined);
    assert.ok(creature.lat >= PH_BOUNDS[0][1] && creature.lat <= PH_BOUNDS[1][1]);
    assert.ok(creature.lng >= PH_BOUNDS[0][0] && creature.lng <= PH_BOUNDS[1][0]);
  }
});

test('gallery.json hydrates all 17 creatures and communityMarker with real disk files', async () => {
  const galleryPath = path.join(rootDir, 'public', 'assets', 'gallery.json');
  const gallery = JSON.parse(await fs.readFile(galleryPath, 'utf8'));

  assert.equal(gallery.count, 17);
  assert.equal(gallery.communityMarker, '/assets/ink/community.png');

  const hydrated = hydrateCreaturesWithGallery(CREATURES, gallery);
  assert.equal(hydrated.length, 17);

  for (const creature of hydrated) {
    for (const key of ['banner', 'marker', 'illustration']) {
      assert.ok(creature[key], `Missing ${key} for ${creature.id}`);
      const diskPath = path.join(rootDir, 'public', creature[key].replace(/^\//, ''));
      await fs.access(diskPath);
    }
  }
});

test('hasEncounterModel & createEncounterModel cover all 17 built-ins and reject unknown IDs', () => {
  for (const creature of CREATURES) {
    assert.equal(hasEncounterModel(creature.id), true);
    const model = createEncounterModel(creature.id);
    assert.equal(model.group.name, `encounter-${creature.id}`);
    model.animate(0.5);
    model.dispose();
  }
  assert.equal(hasEncounterModel('community-story-123'), false);
  assert.equal(hasEncounterModel('unknown-creature'), false);
  assert.equal(hasEncounterModel(''), false);
  assert.equal(hasEncounterModel(null), false);
  assert.equal(habitatOf({ type: 'sea', habitat: '' }), 'coast');
  assert.equal(habitatOf({ type: 'land', habitat: 'Mountains and hills' }), 'hills');
});

test('useLocalCoastline rewires style sources to local geojson and terrarium DEM tiles', async () => {
  const stylePath = path.join(rootDir, 'public', 'assets', 'atlas-style.json');
  const rawStyle = JSON.parse(await fs.readFile(stylePath, 'utf8'));
  const patched = useLocalCoastline(rawStyle, 'https://example.web.app');

  assert.equal(patched.sources['ph-coastline'].data, '/assets/ph-coastline.json');
  assert.equal(patched.sources['atlas-local-dem'].encoding, 'terrarium');
  assert.deepEqual(patched.sources['atlas-local-dem'].tiles, [
    'https://example.web.app/assets/elevation/{z}/{x}/{y}.png',
  ]);
  const relief = patched.layers.find((l) => l.id === 'engraved-relief');
  assert.equal(relief.source, 'atlas-local-dem');
});

test('validateMythImage enforces PNG/JPEG/WebP and 5 MB limit', () => {
  assert.equal(validateMythImage(null).valid, false);
  assert.equal(validateMythImage({ type: 'image/svg+xml', size: 512 }).valid, false);
  assert.equal(validateMythImage({ type: 'text/html', size: 512 }).valid, false);
  assert.equal(validateMythImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }).valid, false);
  assert.equal(validateMythImage({ type: 'image/png', size: 5 * 1024 * 1024 }).valid, true);
  assert.equal(validateMythImage({ type: 'image/jpeg', size: 1024 * 1024 }).valid, true);
  assert.equal(validateMythImage({ type: 'image/webp', size: 2048 }).valid, true);
});

test('summarizeReviews computes accurate average and count', () => {
  assert.deepEqual(summarizeReviews([]), { reviews: [], average: 0, count: 0 });
  const sample = [{ rating: 5 }, { rating: 4 }, { rating: 5 }];
  const res = summarizeReviews(sample);
  assert.equal(res.count, 3);
  assert.equal(res.average, 4.7);
});

test('format helpers and Firebase error formatter produce expected labels', () => {
  assert.equal(kindLabel({ type: 'sea' }), 'Sea deity');
  assert.equal(kindLabel({ type: 'land' }), 'Land spirit');
  assert.equal(coordinatesLabel({ lat: 11.35, lng: 122.35 }), '11.350° N, 122.350° E');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('user'), 'Explorer');
  assert.equal(roleLabel('guest'), 'Guest');
  assert.equal(statusLabel('needs_revision'), 'Needs revision');
  assert.match(formatFirebaseError({ code: 'permission-denied' }), /Firestore security rules/i);
});

test('externalApis gracefully caches Open-Meteo weather and Wikipedia lore with fallback', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const urlStr = String(url);
    if (urlStr.includes('marine-api.open-meteo.com')) {
      return new Response(
        JSON.stringify({
          current: {
            wave_height: 1.05,
            wave_direction: 68,
            wave_period: 8.4,
            swell_wave_height: 0.92,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('api.open-meteo.com')) {
      return new Response(
        JSON.stringify({
          current: {
            temperature_2m: 29.4,
            wind_speed_10m: 14.2,
            weather_code: 2,
            cloud_cover: 40,
            is_day: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('api.sunrise-sunset.org')) {
      return new Response(
        JSON.stringify({
          status: 'OK',
          results: {
            sunrise: '2026-11-24T21:51:10+00:00',
            sunset: '2026-11-25T09:23:46+00:00',
            civil_twilight_begin: '2026-11-24T21:28:45+00:00',
            civil_twilight_end: '2026-11-25T09:46:11+00:00',
            day_length: 41556,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('openlibrary.org/search.json')) {
      return new Response(
        JSON.stringify({
          docs: [
            {
              key: '/works/OL2506561W',
              title: 'Creatures of Philippine lower mythology',
              author_name: ['Ramos, Maximo D.'],
              first_publish_year: 1971,
              cover_i: 13198638,
            },
            {
              key: '/works/OL9999999W',
              title: 'Creatures of Philippine lower mythology', // duplicate title
              author_name: ['Maximo Ramos'],
              first_publish_year: 1990,
            },
            {
              key: '/works/OL123456W',
              title: 'Unrelated Modern Physics Textbook',
              author_name: ['Someone Else'],
              first_publish_year: 2020,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('commons.wikimedia.org/w/api.php')) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              101: {
                title: 'File:Sarimanok bird of Philippine Folklore.jpg',
                imageinfo: [
                  {
                    mime: 'image/jpeg',
                    thumburl: 'https://upload.wikimedia.org/sarimanok-thumb.jpg',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sarimanok_bird_of_Philippine_Folklore.jpg',
                    extmetadata: {
                      Artist: { value: '<a href="https://example.com">Folk Artist</a>' },
                      LicenseShortName: { value: 'CC BY-SA 4.0' },
                    },
                  },
                ],
              },
              102: {
                title: 'File:Audio.wav',
                imageinfo: [
                  {
                    mime: 'audio/wav',
                    thumburl: 'https://upload.wikimedia.org/audio.png',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Audio.wav',
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('wikipedia.org/api/rest_v1/page/summary/')) {
      const slug = decodeURIComponent(urlStr.split('/summary/')[1] || '');
      return new Response(
        JSON.stringify({
          type: 'standard',
          title: slug.replace(/_/g, ' '),
          extract: `Verified Philippine folklore entry for ${slug}.`,
          content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${slug}` } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(null, { status: 404 });
  };

  try {
    const weather1 = await fetchLiveWeather(11.36, 122.36);
    const weather2 = await fetchLiveWeather(11.37, 122.38); // rounds to same 11.4, 122.4 cache bucket
    assert.equal(weather1.temperature, 29);
    assert.equal(weather1.isDay, 0);
    assert.equal(weather1.dayPeriod, 'Night');
    assert.equal(weather2.label, 'Partly cloudy');
    assert.equal(calls, 1);

    const marine1 = await fetchMarineConditions(7.11, 126.61);
    const marine2 = await fetchMarineConditions(7.12, 126.62); // cached under 7.1,126.6
    assert.equal(marine1.waveHeight, 1.05);
    assert.equal(marine1.compass, 'E');
    assert.equal(marine1.seaState, 'Moderate waves');
    assert.equal(marine2.swellHeight, 0.92);
    assert.equal(calls, 2);

    const solar = await fetchSunriseSunset(11.36, 122.36);
    assert.ok(solar.sunriseLabel.includes('AM'));
    assert.ok(solar.sunsetLabel.includes('PM'));
    assert.equal(solar.daylightLabel, '11h 33m');
    assert.ok(solar.moonPhase.name);
    assert.equal(getLunarPhase(new Date('2000-01-06T18:14:00Z')).name, 'New Moon');

    const books = await fetchOpenLibraryBooks({ id: 'amdag', community: false });
    assert.equal(books.length, 1);
    assert.equal(books[0].title, 'Creatures of Philippine lower mythology');
    assert.match(books[0].coverUrl, /covers\.openlibrary\.org/);

    const sarimanokMedia = await fetchWikimediaCommonsMedia({ id: 'sarimanok', community: false });
    assert.equal(sarimanokMedia.length, 1); // audio/wav filtered out
    assert.equal(sarimanokMedia[0].artist, 'Folk Artist'); // HTML stripped
    assert.equal(sarimanokMedia[0].license, 'CC BY-SA 4.0');

    const callsBeforeSkipped = calls;
    const amdagMedia = await fetchWikimediaCommonsMedia({ id: 'amdag', community: false });
    assert.deepEqual(amdagMedia, []);
    assert.equal(calls, callsBeforeSkipped);

    const lore = await fetchWikipediaLore({ id: 'manananggal', community: false });
    assert.equal(lore.title, 'Manananggal');
    assert.match(lore.url, /wikipedia\.org\/wiki\/Manananggal$/);

    const bakunawaLore = await fetchWikipediaLore({
      id: 'demo-myth-bakunawa',
      title: 'Bakunawa of the Visayan Sea',
      region: 'Cebu, Central Visayas',
      community: true,
    });
    assert.equal(bakunawaLore.title, 'Bakunawa');

    const kapreLore = await fetchWikipediaLore({
      id: 'demo-myth-kapre',
      title: 'Kapre of the Old Balete',
      region: 'Lipa, Batangas',
      community: true,
    });
    assert.equal(kapreLore.title, 'Kapre');

    const callsBeforeSkippedWiki = calls;
    for (const idWithoutWiki of ['amdag', 'janggu', 'duwende', 'white_deer', 'mumu', 'tarabusaw']) {
      const skipped = await fetchWikipediaLore({ id: idWithoutWiki, community: false });
      assert.equal(skipped, null);
    }
    const unknownCommunity = await fetchWikipediaLore({
      id: 'community-custom',
      title: 'Mystery Spirit of Panay',
      region: 'Iloilo City, Western Visayas',
      community: true,
    });
    assert.equal(unknownCommunity, null);
    assert.equal(calls, callsBeforeSkippedWiki);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('distance field and Firebase config files are valid', async () => {
  const dfJson = JSON.parse(
    await fs.readFile(path.join(rootDir, 'public', 'assets', 'ph-distance-field.json'), 'utf8')
  );
  assert.equal(dfJson.flipY, false);
  assert.equal(dfJson.rowZero, 'north');
  assert.deepEqual(dfJson.geographicBounds, MAX_BOUNDS);

  const fbJson = JSON.parse(await fs.readFile(path.join(rootDir, 'firebase.json'), 'utf8'));
  assert.equal(fbJson.hosting.public, 'dist');
  assert.deepEqual(fbJson.hosting.predeploy, ['npm run build']);
});

test('localDemoStore runs full Guest, Explorer, and Admin workflows without Firebase config', async () => {
  assert.equal(isLocalDemoMode, true);
  resetLocalDemoData();

  // 1. Seeded data has 1 approved, 1 pending, 1 needs_revision
  const initialApproved = await listApprovedMyths();
  assert.equal(initialApproved.length, 1);
  assert.equal(initialApproved[0].title, 'Bakunawa of the Visayan Sea');

  // 2. Guest role can comment & reply, but cannot submit myths or reviews
  const guest = await quickSignInDemoRole('guest');
  assert.equal(guest.role, 'guest');
  await assert.rejects(
    () =>
      saveReview({
        storyId: 'manananggal',
        user: guest,
        rating: 5,
        category: 'appreciation',
        feedback: 'Should be blocked for guests.',
      }),
    /Sign in as an Explorer/i
  );

  const guestComment = await createComment({
    storyId: 'manananggal',
    parentId: null,
    user: guest,
    authorName: 'Night Traveler',
    body: 'Heard this story in Antique!',
  });
  const guestReply = await createComment({
    storyId: 'manananggal',
    parentId: guestComment.id,
    user: guest,
    authorName: 'Night Traveler',
    body: 'Specifically near the coastal towns.',
  });
  assert.equal(guestReply.parentId, guestComment.id);

  // 3. Register new Explorer (always role: 'user'), bookmark, submit myth, and review
  const explorer = await registerExplorer({
    name: 'Lakan Test',
    email: 'lakan@example.com',
    password: 'password123',
  });
  assert.equal(explorer.role, 'user');

  const bm = await toggleBookmark(explorer.uid, 'manananggal', explorer.bookmarks);
  assert.deepEqual(bm.bookmarks, ['manananggal']);

  const submitted = await submitMyth(explorer, {
    title: 'Sarangay of Ilocos',
    author: explorer.name,
    story: 'A horned guardian creature said to protect hidden treasures deep in the northern hills.',
    lat: 17.57,
    lng: 120.38,
    type: 'land',
    region: 'Ilocos Sur',
    source: 'Northern Luzon folklore',
    imageUrl: '',
  });
  assert.equal(submitted.status, 'pending');

  const ownReview = await saveReview({
    storyId: 'tikbalang',
    user: explorer,
    rating: 4,
    category: 'regional_variant',
    feedback: 'Known across Southern Tagalog and Batangas forested trails.',
  });
  assert.equal(ownReview.rating, 4);

  // 4. Admin moderates: requests revision -> Explorer resubmits -> Admin approves -> appears on map
  const admin = await quickSignInDemoRole('admin');
  assert.equal(admin.role, 'admin');

  await reviewMyth({
    mythId: submitted.id,
    status: 'needs_revision',
    reviewNote: 'Add municipality detail.',
    adminUser: admin,
  });

  await quickSignInDemoRole('user');
  // Switch back to registered explorer via email login is not even needed; check listMySubmissions for lakan
  const lakanSubs = await listMySubmissions(explorer.uid);
  assert.equal(lakanSubs[0].status, 'needs_revision');
  assert.equal(lakanSubs[0].feedbackHistory.length, 1);

  const resubmitted = await resubmitMyth(submitted.id, explorer, {
    title: 'Sarangay of Vigan Hills',
    author: explorer.name,
    story: 'A horned guardian creature said to protect hidden treasures deep in the hills near Vigan.',
    lat: 17.57,
    lng: 120.38,
    type: 'land',
    region: 'Vigan, Ilocos Sur',
    source: 'Northern Luzon oral folklore',
    imageUrl: '',
  });
  assert.equal(resubmitted.status, 'pending');

  await quickSignInDemoRole('admin');
  await reviewMyth({
    mythId: submitted.id,
    status: 'approved',
    reviewNote: 'Approved after revision.',
    adminUser: admin,
  });

  const approvedAfter = await listApprovedMyths();
  assert.equal(approvedAfter.some((m) => m.id === submitted.id), true);

  // 5. Admin pins & deletes comment + child reply, highlights review, and deletes non-self account
  await togglePinComment({ storyId: 'manananggal', commentId: guestComment.id, pinned: true });
  let thread = await listStoryComments('manananggal');
  assert.equal(thread.comments.some((c) => c.id === guestComment.id && c.pinned), true);
  await deleteComment({
    storyId: 'manananggal',
    commentId: guestComment.id,
    isTopLevel: true,
    isAdmin: true,
    currentUid: admin.uid,
  });
  thread = await listStoryComments('manananggal');
  assert.equal(thread.comments.some((c) => c.id === guestComment.id), false);

  await toggleHighlightReview({ storyId: 'tikbalang', reviewUid: explorer.uid, highlighted: true });
  const tikReviews = await listStoryReviews('tikbalang');
  assert.equal(tikReviews.reviews.find((r) => r.authorUid === explorer.uid)?.highlighted, true);

  await assert.rejects(() => deleteAccountProfile(admin.uid, admin.uid), /cannot be removed/i);
  await deleteAccountProfile(explorer.uid, admin.uid);
  const allMyths = await listAllMythsForAdmin();
  assert.equal(allMyths.some((m) => m.id === submitted.id), true); // myth preserved
  const remainingAccounts = await listAccountsForAdmin(allMyths);
  assert.equal(remainingAccounts.some((a) => a.uid === explorer.uid), false);

  resetLocalDemoData();
});

test('formatAtmosphereSummary produces one combined message without clock times', () => {
  const landSummary = formatAtmosphereSummary({
    weather: { temperature: 24, label: 'Misty fog', dayPeriod: 'Night', icon: '🌫', windSpeed: 8 },
    marine: null,
    moonPhase: { name: 'Full Moon', icon: '🌕' },
  });
  assert.equal(landSummary.text, '24°C · Misty fog · Night · 🌕 Full Moon');
  assert.doesNotMatch(landSummary.text, /\b(AM|PM|PHT)\b/);

  const seaSummary = formatAtmosphereSummary({
    weather: { temperature: 28, label: 'Light drizzle', dayPeriod: 'Day', icon: '🌦', windSpeed: 12 },
    marine: { waveHeight: 0.86, seaState: 'Gentle swell', compass: 'E' },
    moonPhase: { name: 'Waxing Crescent', icon: '🌒' },
  });
  assert.equal(seaSummary.text, '28°C · Light drizzle · Day · 🌒 Waxing Crescent · 🌊 0.86 m');
});

test('3D encounter environment renders misty fog, light drizzle, thunderstorm, and moon phase', () => {
  assert.equal(classifyWeatherCode(0), 'clear');
  assert.equal(classifyWeatherCode(3), 'overcast');
  assert.equal(classifyWeatherCode(45), 'mist');
  assert.equal(classifyWeatherCode(48), 'dense_fog');
  assert.equal(classifyWeatherCode(51), 'light_drizzle');
  assert.equal(classifyWeatherCode(63), 'heavy_rain');
  assert.equal(classifyWeatherCode(95), 'thunderstorm');

  const env = makeEnvironment();

  // Misty fog at Night with Full Moon
  setAtmosphereTint(env, {
    isDay: 0,
    weatherCode: 45,
    windSpeed: 10,
    moonPhase: { name: 'Full Moon', icon: '🌕' },
  });
  assert.equal(env.mistGroup.visible, true);
  assert.equal(env.rainLines.visible, false);
  assert.equal(env.moonGroup.visible, true);
  assert.equal(env.moonShadow.visible, false);
  assert.equal(env.scene.fog.near, 7);
  assert.equal(env.scene.fog.far, 36);
  updateEncounterAtmosphere(env, 1.0, 0.016, true);

  // Light drizzle during Day
  setAtmosphereTint(env, {
    isDay: 1,
    weatherCode: 51,
    windSpeed: 14,
    moonPhase: { name: 'First Quarter', icon: '🌓' },
  });
  assert.equal(env.rainLines.visible, true);
  assert.equal(env.rainLines.geometry.drawRange.count, 95 * 2);
  assert.equal(env.moonGroup.visible, false);
  assert.equal(env.cloudGroup.visible, true);
  updateEncounterAtmosphere(env, 2.0, 0.016, true);

  // Thunderstorm
  setAtmosphereTint(env, { isDay: 0, weatherCode: 95, windSpeed: 28, moonPhase: { name: 'New Moon', icon: '🌑' } });
  assert.equal(env.rainLines.visible, true);
  assert.equal(env.rainLines.geometry.drawRange.count, 320 * 2);
  assert.equal(env.moonShadow.visible, true);
  updateEncounterAtmosphere(env, 5.42, 0.016, true);

  for (const tex of env.textures) tex.dispose();
});
