const STORE_KEY = 'myths-map-local-demo-v1';
const SESSION_KEY = 'myths-map-local-demo-session';

const VALID_REVIEW_CATEGORIES = new Set([
  'appreciation',
  'regional_variant',
  'historical_context',
  'source_suggestion',
  'correction',
]);
const VALID_MYTH_STATUSES = new Set(['pending', 'approved', 'needs_revision', 'rejected']);

let memoryStore = null;
let memorySessionUid = null;
const authListeners = new Set();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null || value === undefined) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Ignore storage errors in restricted environments or Node tests.
  }
}

function makeSeedData() {
  const now = Date.now();
  const isoAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();

  return {
    version: 1,
    users: {
      'demo-admin': {
        uid: 'demo-admin',
        name: 'Archivist Admin',
        email: 'admin@demo.local',
        login: 'admin',
        password: 'admin',
        role: 'admin',
        bookmarks: ['manananggal'],
        createdAt: isoAgo(1440),
        lastActiveAt: isoAgo(15),
      },
      'demo-user': {
        uid: 'demo-user',
        name: 'Juan Explorer',
        email: 'explorer@demo.local',
        login: 'admin',
        password: 'admin',
        role: 'user',
        bookmarks: ['tikbalang'],
        createdAt: isoAgo(1200),
        lastActiveAt: isoAgo(30),
      },
      'demo-maya': {
        uid: 'demo-maya',
        name: 'Maya Reyes',
        email: 'maya@demo.local',
        login: 'maya@demo.local',
        password: 'maya123',
        role: 'user',
        bookmarks: [],
        createdAt: isoAgo(900),
        lastActiveAt: isoAgo(120),
      },
    },
    myths: [
      {
        id: 'demo-myth-bakunawa',
        title: 'Bakunawa of the Visayan Sea',
        author: 'Maya Reyes',
        story:
          'A colossal serpent-like sea dragon said to rise from the deep waters between Cebu and Negros to swallow the moons in the night sky. Villagers once beat gongs, bamboo drums, and pots to startle the Bakunawa into releasing the moon back into the heavens.',
        lat: 10.315,
        lng: 123.885,
        type: 'sea',
        region: 'Cebu, Central Visayas',
        source: 'Visayan oral tradition & Hiligaynon moon-eclipse lore',
        imageUrl: '/assets/banners/magindara.webp',
        ownerId: 'demo-maya',
        status: 'approved',
        reviewNote: 'Verified regional folklore with clear source attribution.',
        reviewedBy: 'demo-admin',
        reviewedAt: isoAgo(600),
        feedbackHistory: [
          {
            status: 'approved',
            note: 'Verified regional folklore with clear source attribution.',
            reviewerName: 'Archivist Admin',
            reviewerRole: 'admin',
            createdAt: isoAgo(600),
          },
        ],
        createdAt: isoAgo(720),
        updatedAt: isoAgo(600),
      },
      {
        id: 'demo-myth-makiling',
        title: 'Diwata of Mount Makiling',
        author: 'Maya Reyes',
        story:
          'Maria Makiling is remembered as a benevolent forest guardian whose silhouette is traced along the peaks of Mount Makiling. Travelers who care for the woodland paths find wild fruits waiting along the trail, while those who take without respect lose their way in sudden mist.',
        lat: 14.136,
        lng: 121.194,
        type: 'land',
        region: 'Los Baños, Laguna',
        source: 'Tagalog oral narratives of Laguna',
        imageUrl: '',
        ownerId: 'demo-maya',
        status: 'pending',
        reviewNote: '',
        reviewedBy: '',
        reviewedAt: '',
        feedbackHistory: [],
        createdAt: isoAgo(90),
        updatedAt: isoAgo(90),
      },
      {
        id: 'demo-myth-kapre',
        title: 'Kapre of the Old Balete',
        author: 'Juan Explorer',
        story:
          'A towering tree-dwelling spirit often noticed by the scent of a glowing tobacco cigar drifting from ancient balete branches after dusk. Though intimidating in stature, elders say the kapre rarely harms passersby unless its home tree is cut without permission.',
        lat: 13.941,
        lng: 121.163,
        type: 'land',
        region: 'Lipa, Batangas',
        source: '',
        imageUrl: '',
        ownerId: 'demo-user',
        status: 'needs_revision',
        reviewNote: 'Please add a regional oral tradition or book source before publication.',
        reviewedBy: 'demo-admin',
        reviewedAt: isoAgo(240),
        feedbackHistory: [
          {
            status: 'needs_revision',
            note: 'Please add a regional oral tradition or book source before publication.',
            reviewerName: 'Archivist Admin',
            reviewerRole: 'admin',
            createdAt: isoAgo(240),
          },
        ],
        createdAt: isoAgo(360),
        updatedAt: isoAgo(240),
      },
    ],
    stories: {
      manananggal: {
        comments: [
          {
            id: 'demo-c-man-1',
            storyId: 'manananggal',
            parentId: null,
            authorUid: 'demo-admin',
            authorName: 'Archivist Admin',
            authorRole: 'admin',
            body: 'Welcome to the Manananggal thread! Share regional names (such as wakwak or tanggal) or local variations from your province.',
            pinned: true,
            createdAt: isoAgo(500),
            updatedAt: isoAgo(500),
          },
          {
            id: 'demo-c-man-2',
            storyId: 'manananggal',
            parentId: null,
            authorUid: 'demo-user',
            authorName: 'Juan Explorer',
            authorRole: 'user',
            body: 'My grandmother in Capiz always mentioned placing crushed garlic and rock salt near window sills at night.',
            pinned: false,
            createdAt: isoAgo(180),
            updatedAt: isoAgo(180),
          },
          {
            id: 'demo-c-man-3',
            storyId: 'manananggal',
            parentId: 'demo-c-man-2',
            authorUid: 'demo-guest',
            authorName: 'Visayan Reader',
            authorRole: 'guest',
            body: 'Same in Iloilo! Elders also talk about bamboo bagakay spears.',
            pinned: false,
            createdAt: isoAgo(110),
            updatedAt: isoAgo(110),
          },
        ],
        reviews: {
          'demo-admin': {
            id: 'demo-admin',
            storyId: 'manananggal',
            authorUid: 'demo-admin',
            authorName: 'Archivist Admin',
            authorRole: 'admin',
            rating: 5,
            category: 'historical_context',
            feedback:
              'Classic Visayan nocturnal motif documented in early Spanish colonial lexicons and preserved across Western Visayas oral traditions.',
            highlighted: false,
            createdAt: isoAgo(480),
            updatedAt: isoAgo(480),
          },
          'demo-user': {
            id: 'demo-user',
            storyId: 'manananggal',
            authorUid: 'demo-user',
            authorName: 'Juan Explorer',
            authorRole: 'user',
            rating: 5,
            category: 'regional_variant',
            feedback:
              'In Capiz and Aklan, elders distinguish the flying manananggal from the wakwak by the sound of its wings.',
            highlighted: true,
            createdAt: isoAgo(210),
            updatedAt: isoAgo(210),
          },
        },
      },
      tikbalang: {
        comments: [
          {
            id: 'demo-c-tik-1',
            storyId: 'tikbalang',
            parentId: null,
            authorUid: 'demo-user',
            authorName: 'Juan Explorer',
            authorRole: 'user',
            body: 'Turning your shirt inside out when lost on a mountain trail is still a popular saying in Southern Luzon!',
            pinned: false,
            createdAt: isoAgo(300),
            updatedAt: isoAgo(300),
          },
        ],
        reviews: {
          'demo-admin': {
            id: 'demo-admin',
            storyId: 'tikbalang',
            authorUid: 'demo-admin',
            authorName: 'Archivist Admin',
            authorRole: 'admin',
            rating: 5,
            category: 'historical_context',
            feedback:
              'Tagalog forest trickster spirit traditionally associated with bamboo groves and sudden afternoon rain.',
            highlighted: false,
            createdAt: isoAgo(420),
            updatedAt: isoAgo(420),
          },
        },
      },
    },
  };
}

function loadStore() {
  if (memoryStore) return memoryStore;
  const raw = readStorage(globalThis.localStorage, STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.users && Array.isArray(parsed.myths) && parsed.stories) {
        memoryStore = parsed;
        return memoryStore;
      }
    } catch {
      // Fall back to fresh seed if corrupted.
    }
  }
  memoryStore = makeSeedData();
  saveStore(memoryStore);
  return memoryStore;
}

function saveStore(next) {
  memoryStore = next;
  writeStorage(globalThis.localStorage, STORE_KEY, JSON.stringify(next));
}

function getSessionUid() {
  if (memorySessionUid !== null) return memorySessionUid;
  const saved = readStorage(globalThis.sessionStorage, SESSION_KEY);
  memorySessionUid = saved || '';
  return memorySessionUid;
}

function setSessionUid(uid) {
  memorySessionUid = uid || '';
  writeStorage(globalThis.sessionStorage, SESSION_KEY, uid || null);
}

function toPublicUser(user) {
  if (!user) return null;
  if (user.role === 'guest' || user.uid === 'demo-guest') {
    return {
      uid: 'demo-guest',
      role: 'guest',
      name: 'Guest',
      email: '',
      isAnonymous: true,
      bookmarks: [],
    };
  }
  return {
    uid: user.uid,
    role: user.role === 'admin' ? 'admin' : 'user',
    name: user.name,
    email: user.email || '',
    isAnonymous: false,
    bookmarks: Array.isArray(user.bookmarks) ? [...user.bookmarks] : [],
  };
}

function getCurrentDemoUser() {
  const uid = getSessionUid();
  if (!uid) return null;
  if (uid === 'demo-guest') return toPublicUser({ uid: 'demo-guest', role: 'guest' });
  const store = loadStore();
  const account = store.users[uid];
  if (!account) {
    setSessionUid('');
    return null;
  }
  return toPublicUser(account);
}

function notifyAuthListeners() {
  const current = getCurrentDemoUser();
  for (const listener of authListeners) {
    try {
      listener(current);
    } catch (error) {
      console.error('Demo auth listener error:', error);
    }
  }
}

function makeId(prefix) {
  const rand = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${rand}`;
}

function validateDemoImageUrl(url) {
  const clean = typeof url === 'string' ? url.trim() : '';
  if (!clean) return '';
  if (clean.startsWith('https://') && clean.length <= 500) return clean;
  if (clean.startsWith('/assets/') && clean.length <= 300) return clean;
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(clean) && clean.length <= 2_500_000) return clean;
  throw new Error('Image URL must be an https:// URL or a valid PNG/JPEG/WebP upload.');
}

function validateDemoMythInput(input) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4 || lat > 22 || lng < 116 || lng > 127) {
    throw new Error('Choose a location within the Philippine archipelago (4–22° N, 116–127° E).');
  }
  const title = String(input.title || '').trim();
  if (title.length < 3 || title.length > 100) {
    throw new Error('Story title must be between 3 and 100 characters.');
  }
  const author = String(input.author || '').trim();
  if (author.length < 2 || author.length > 80) {
    throw new Error('Author / credit must be between 2 and 80 characters.');
  }
  const story = String(input.story || '').trim();
  if (story.length < 20 || story.length > 10000) {
    throw new Error('Story text must be between 20 and 10,000 characters.');
  }
  const type = input.type === 'sea' ? 'sea' : input.type === 'land' ? 'land' : '';
  if (!type) throw new Error('Choose land or sea as the story category.');
  const region = String(input.region || '').trim();
  if (region.length > 80) throw new Error('Region must be 80 characters or fewer.');
  const source = String(input.source || '').trim();
  if (source.length > 300) throw new Error('Source must be 300 characters or fewer.');
  const imageUrl = validateDemoImageUrl(input.imageUrl);
  return { title, author, story, lat, lng, type, region, source, imageUrl };
}

function formatMyth(item) {
  return {
    ...clone(item),
    name: item.title,
    community: true,
  };
}

function ensureStoryBucket(store, storyId) {
  if (!store.stories[storyId]) {
    store.stories[storyId] = { comments: [], reviews: {} };
  }
  return store.stories[storyId];
}

// ===========================================================================
// Auth & Demo Switcher
// ===========================================================================
export function subscribeAuth(callback) {
  authListeners.add(callback);
  callback(getCurrentDemoUser());
  return () => {
    authListeners.delete(callback);
  };
}

export async function quickSignInRole(role) {
  const store = loadStore();
  if (role === 'guest') {
    setSessionUid('demo-guest');
  } else if (role === 'admin') {
    if (!store.users['demo-admin']) {
      store.users['demo-admin'] = makeSeedData().users['demo-admin'];
    }
    store.users['demo-admin'].lastActiveAt = new Date().toISOString();
    saveStore(store);
    setSessionUid('demo-admin');
  } else {
    if (!store.users['demo-user']) {
      store.users['demo-user'] = makeSeedData().users['demo-user'];
    }
    store.users['demo-user'].lastActiveAt = new Date().toISOString();
    saveStore(store);
    setSessionUid('demo-user');
  }
  notifyAuthListeners();
  return getCurrentDemoUser();
}

export async function signInAsGuest() {
  return quickSignInRole('guest');
}

export async function signInWithEmail({ email, password, expectedRole }) {
  const cleanLogin = String(email || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!cleanLogin || !pass) {
    throw new Error('Please enter both your email/username and password.');
  }
  const store = loadStore();
  const accounts = Object.values(store.users);

  // Match exact email, or demo shorthand ('admin' / 'admin') scoped to expectedRole.
  const matched = accounts.find((acc) => {
    const emailMatch = acc.email.toLowerCase() === cleanLogin;
    const shorthandMatch =
      acc.login &&
      acc.login.toLowerCase() === cleanLogin &&
      (!expectedRole || acc.role === expectedRole);
    return (emailMatch || shorthandMatch) && acc.password === pass;
  });

  if (!matched) {
    throw new Error('Incorrect credentials. Try admin / admin or use the 1-click demo buttons.');
  }
  if (expectedRole === 'admin' && matched.role !== 'admin') {
    throw new Error('This account does not have Administrator privileges.');
  }

  matched.lastActiveAt = new Date().toISOString();
  saveStore(store);
  setSessionUid(matched.uid);
  notifyAuthListeners();
  return toPublicUser(matched);
}

export async function registerExplorer({ name, email, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const pass = String(password || '');
  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new Error('Display name must be between 2 and 60 characters.');
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (pass.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const store = loadStore();
  if (Object.values(store.users).some((u) => u.email.toLowerCase() === cleanEmail)) {
    throw new Error('An account with this email already exists. Try signing in instead.');
  }

  const uid = makeId('demo-explorer');
  const now = new Date().toISOString();
  store.users[uid] = {
    uid,
    name: cleanName,
    email: cleanEmail,
    login: cleanEmail,
    password: pass,
    role: 'user', // Never client-elevatable
    bookmarks: [],
    createdAt: now,
    lastActiveAt: now,
  };
  saveStore(store);
  setSessionUid(uid);
  notifyAuthListeners();
  return toPublicUser(store.users[uid]);
}

export async function signOutUser() {
  setSessionUid('');
  notifyAuthListeners();
}

export function resetDemoData() {
  const seeded = makeSeedData();
  saveStore(seeded);
  const uid = getSessionUid();
  if (uid && uid !== 'demo-guest' && !seeded.users[uid]) {
    setSessionUid('demo-user');
  }
  notifyAuthListeners();
  return getCurrentDemoUser();
}

// ===========================================================================
// Bookmarks
// ===========================================================================
export async function toggleBookmark(uid, storyId, currentBookmarks = []) {
  if (!uid || uid === 'demo-guest' || !storyId || !/^[a-zA-Z0-9_-]{1,100}$/.test(storyId)) {
    throw new Error('Sign in as an Explorer or Administrator to save stories.');
  }
  const store = loadStore();
  const account = store.users[uid];
  if (!account) throw new Error('Account not found.');

  const set = new Set(account.bookmarks || currentBookmarks);
  const saved = !set.has(storyId);
  if (saved) {
    if (set.size >= 1000) throw new Error('Your saved collection has reached the 1,000 story limit.');
    set.add(storyId);
  } else {
    set.delete(storyId);
  }
  account.bookmarks = [...set];
  account.lastActiveAt = new Date().toISOString();
  saveStore(store);
  notifyAuthListeners();
  return { bookmarks: [...account.bookmarks], saved };
}

// ===========================================================================
// Community Myths
// ===========================================================================
export async function listApprovedMyths() {
  const store = loadStore();
  return store.myths
    .filter((m) => m.status === 'approved')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(formatMyth);
}

export async function listMySubmissions(uid) {
  const store = loadStore();
  return store.myths
    .filter((m) => m.ownerId === uid)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(formatMyth);
}

export async function submitMyth(user, data) {
  if (!user || user.isAnonymous || !['user', 'admin'].includes(user.role)) {
    throw new Error('Sign in as an Explorer or Administrator to share a myth.');
  }
  const payload = validateDemoMythInput(data);
  const store = loadStore();
  const now = new Date().toISOString();
  const record = {
    id: makeId('demo-myth'),
    ...payload,
    ownerId: user.uid,
    status: 'pending',
    reviewNote: '',
    reviewedBy: '',
    reviewedAt: '',
    feedbackHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  store.myths.unshift(record);
  saveStore(store);
  return formatMyth(record);
}

export async function resubmitMyth(mythId, user, data) {
  if (!user || user.isAnonymous || !['user', 'admin'].includes(user.role)) {
    throw new Error('Sign in to edit and resubmit your story.');
  }
  const store = loadStore();
  const target = store.myths.find((m) => m.id === mythId);
  if (!target) throw new Error('Submission not found.');
  if (target.ownerId !== user.uid) throw new Error('You can only resubmit your own stories.');
  if (!['needs_revision', 'rejected'].includes(target.status)) {
    throw new Error('Only stories marked as needs revision or declined can be resubmitted.');
  }

  const payload = validateDemoMythInput(data);
  Object.assign(target, payload, {
    status: 'pending',
    updatedAt: new Date().toISOString(),
  });
  saveStore(store);
  return formatMyth(target);
}

// ===========================================================================
// Admin Moderation & Account Directory
// ===========================================================================
export async function listAllMythsForAdmin() {
  const store = loadStore();
  return [...store.myths]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(formatMyth);
}

export async function reviewMyth({ mythId, status, reviewNote = '', adminUser }) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new Error('Only Administrators can review submissions.');
  }
  if (!VALID_MYTH_STATUSES.has(status)) {
    throw new Error('Invalid moderation status.');
  }
  const cleanNote = String(reviewNote || '').trim();
  if (cleanNote.length > 500) {
    throw new Error('Review note must be 500 characters or fewer.');
  }
  const store = loadStore();
  const target = store.myths.find((m) => m.id === mythId);
  if (!target) throw new Error('Submission not found.');

  const now = new Date().toISOString();
  const historyEntry = {
    status,
    note: cleanNote,
    reviewerName: adminUser.name || 'Administrator',
    reviewerRole: 'admin',
    createdAt: now,
  };
  target.status = status;
  target.reviewNote = cleanNote;
  target.reviewedBy = adminUser.uid;
  target.reviewedAt = now;
  target.updatedAt = now;
  target.feedbackHistory = [...(target.feedbackHistory || []), historyEntry];
  saveStore(store);
  return clone(historyEntry);
}

export async function deleteMyth(mythId) {
  const current = getCurrentDemoUser();
  if (!current || current.role !== 'admin') {
    throw new Error('Only Administrators can delete submissions.');
  }
  const store = loadStore();
  store.myths = store.myths.filter((m) => m.id !== mythId);
  for (const user of Object.values(store.users)) {
    if (Array.isArray(user.bookmarks)) {
      user.bookmarks = user.bookmarks.filter((id) => id !== mythId);
    }
  }
  saveStore(store);
  notifyAuthListeners();
}

export async function listAccountsForAdmin(myths = []) {
  const store = loadStore();
  const counts = new Map();
  for (const myth of myths) {
    if (myth.ownerId) counts.set(myth.ownerId, (counts.get(myth.ownerId) || 0) + 1);
  }
  return Object.values(store.users)
    .map((acc) => ({
      uid: acc.uid,
      name: acc.name || 'Explorer',
      email: acc.email || '',
      role: acc.role === 'admin' ? 'admin' : 'user',
      submissions: counts.get(acc.uid) || 0,
      createdAt: acc.createdAt || '',
      lastActiveAt: acc.lastActiveAt || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteAccountProfile(uid, currentAdminUid) {
  if (uid === currentAdminUid) {
    throw new Error('Your signed-in administrator account cannot be removed.');
  }
  const store = loadStore();
  if (!store.users[uid]) throw new Error('Account not found.');
  delete store.users[uid];
  saveStore(store);
}

// ===========================================================================
// Per-Creature Community Discussion Threads
// ===========================================================================
export async function getStoryCommentCount(storyId) {
  const store = loadStore();
  return store.stories[storyId]?.comments?.length || 0;
}

export async function listStoryComments(storyId, { pageSize = 20, cursor = null } = {}) {
  const store = loadStore();
  const all = store.stories[storyId]?.comments || [];
  const top = all
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  const offset = typeof cursor === 'number' ? cursor : 0;
  const page = top.slice(offset, offset + pageSize).map(clone);
  const pageIds = new Set(page.map((c) => c.id));
  const repliesByParent = {};

  for (const reply of all
    .filter((c) => c.parentId && pageIds.has(c.parentId))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))) {
    if (!repliesByParent[reply.parentId]) repliesByParent[reply.parentId] = [];
    repliesByParent[reply.parentId].push(clone(reply));
  }

  const nextOffset = offset + pageSize;
  return {
    comments: page,
    repliesByParent,
    nextCursor: nextOffset < top.length ? nextOffset : null,
    hasMore: nextOffset < top.length,
  };
}

export async function createComment({ storyId, parentId = null, user, authorName, body }) {
  if (!user?.uid) {
    throw new Error('Sign in or continue as a Guest to join the discussion.');
  }
  const cleanBody = String(body || '').trim();
  if (cleanBody.length < 1 || cleanBody.length > 1000) {
    throw new Error('Comment must be between 1 and 1,000 characters.');
  }
  const resolvedName = (
    user.role === 'guest'
      ? String(authorName || 'Guest Explorer').trim() || 'Guest Explorer'
      : user.name || 'Explorer'
  ).slice(0, 40);
  if (resolvedName.length < 2) {
    throw new Error('Display name must be at least 2 characters.');
  }
  const authorRole = user.role === 'admin' ? 'admin' : user.role === 'user' ? 'user' : 'guest';
  const now = new Date().toISOString();
  const comment = {
    id: makeId('demo-comment'),
    storyId,
    parentId: parentId || null,
    authorUid: user.uid,
    authorName: resolvedName,
    authorRole,
    body: cleanBody,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };

  const store = loadStore();
  const bucket = ensureStoryBucket(store, storyId);
  bucket.comments.push(comment);
  saveStore(store);
  return clone(comment);
}

export async function updateComment({ storyId, commentId, body }) {
  const cleanBody = String(body || '').trim();
  if (cleanBody.length < 1 || cleanBody.length > 1000) {
    throw new Error('Comment must be between 1 and 1,000 characters.');
  }
  const store = loadStore();
  const bucket = store.stories[storyId];
  const target = bucket?.comments?.find((c) => c.id === commentId);
  if (!target) throw new Error('Comment not found.');
  target.body = cleanBody;
  target.updatedAt = new Date().toISOString();
  saveStore(store);
}

export async function togglePinComment({ storyId, commentId, pinned }) {
  const store = loadStore();
  const bucket = store.stories[storyId];
  const target = bucket?.comments?.find((c) => c.id === commentId);
  if (!target) throw new Error('Comment not found.');
  target.pinned = Boolean(pinned);
  target.updatedAt = new Date().toISOString();
  saveStore(store);
}

export async function deleteComment({ storyId, commentId, isTopLevel = false, isAdmin = false, currentUid = '' }) {
  const store = loadStore();
  const bucket = store.stories[storyId];
  if (!bucket) return;
  bucket.comments = bucket.comments.filter((c) => {
    if (c.id === commentId) return false;
    if (isTopLevel && c.parentId === commentId && (isAdmin || c.authorUid === currentUid)) {
      return false;
    }
    return true;
  });
  saveStore(store);
}

// ===========================================================================
// Published Myth Reviews & Feedback
// ===========================================================================
export function summarizeDemoReviews(reviews) {
  const count = reviews.length;
  const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  const average = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
  return { reviews, average, count };
}

export async function listStoryReviews(storyId) {
  const store = loadStore();
  const map = store.stories[storyId]?.reviews || {};
  const list = Object.values(map)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(clone);
  return summarizeDemoReviews(list);
}

export async function saveReview({ storyId, user, rating, category, feedback, existingReview }) {
  if (!user || user.isAnonymous || !['user', 'admin'].includes(user.role)) {
    throw new Error('Sign in as an Explorer or Administrator to submit a review.');
  }
  const intRating = Number(rating);
  if (!Number.isInteger(intRating) || intRating < 1 || intRating > 5) {
    throw new Error('Select a star rating from 1 to 5.');
  }
  if (!VALID_REVIEW_CATEGORIES.has(category)) {
    throw new Error('Choose a valid feedback category.');
  }
  const cleanFeedback = String(feedback || '').trim();
  if (cleanFeedback.length < 5 || cleanFeedback.length > 1000) {
    throw new Error('Feedback must be between 5 and 1,000 characters.');
  }

  const store = loadStore();
  const bucket = ensureStoryBucket(store, storyId);
  const now = new Date().toISOString();
  const prev = bucket.reviews[user.uid] || existingReview;
  const record = {
    id: user.uid,
    storyId,
    authorUid: user.uid,
    authorName: (user.name || 'Explorer').slice(0, 80),
    authorRole: user.role === 'admin' ? 'admin' : 'user',
    rating: intRating,
    category,
    feedback: cleanFeedback,
    highlighted: Boolean(prev?.highlighted),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  bucket.reviews[user.uid] = record;
  saveStore(store);
  return clone(record);
}

export async function deleteReview({ storyId, reviewUid }) {
  const store = loadStore();
  const bucket = store.stories[storyId];
  if (bucket?.reviews?.[reviewUid]) {
    delete bucket.reviews[reviewUid];
    saveStore(store);
  }
}

export async function toggleHighlightReview({ storyId, reviewUid, highlighted }) {
  const store = loadStore();
  const target = store.stories[storyId]?.reviews?.[reviewUid];
  if (!target) throw new Error('Review not found.');
  target.highlighted = Boolean(highlighted);
  target.updatedAt = new Date().toISOString();
  saveStore(store);
}
