import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseReady, isBackendReady, isLocalDemoMode } from './firebase.js';
import * as localDemo from './localDemoStore.js';

export { isLocalDemoMode, isBackendReady };
export const quickSignInDemoRole = (role) => localDemo.quickSignInRole(role);
export const resetLocalDemoData = () => localDemo.resetDemoData();

export const REVIEW_CATEGORIES = Object.freeze([
  { value: 'appreciation', label: 'Appreciation' },
  { value: 'regional_variant', label: 'Regional variant' },
  { value: 'historical_context', label: 'Historical context' },
  { value: 'source_suggestion', label: 'Source suggestion' },
  { value: 'correction', label: 'Correction' },
]);

const VALID_REVIEW_CATEGORIES = new Set(REVIEW_CATEGORIES.map((c) => c.value));
const VALID_MYTH_STATUSES = new Set(['pending', 'approved', 'needs_revision', 'rejected']);

function ensureFirebase() {
  if (!firebaseReady || !auth || !db) {
    throw new Error(
      'Firebase is not configured yet. Add your VITE_FIREBASE_* keys to .env (see .env.example) or enable the Firebase Emulator Suite.'
    );
  }
}

function toIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return '';
}

function sortByCreatedDesc(items) {
  return [...items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function sortByCreatedAsc(items) {
  return [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function formatFirebaseError(error, fallback = 'The request could not be completed.') {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in your Firebase Authentication console yet.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase. Check your connection and try again.';
    case 'permission-denied':
      return 'Permission denied by Firestore security rules for this account or payload.';
    case 'unavailable':
      return 'Cloud Firestore is temporarily unavailable. Please try again.';
    default:
      return error?.message || fallback;
  }
}

function validateImageUrl(url) {
  const clean = typeof url === 'string' ? url.trim() : '';
  if (!clean) return '';
  if (!clean.startsWith('https://') || clean.length > 500) {
    throw new Error('Image URL must be an https:// URL of at most 500 characters.');
  }
  return clean;
}

function validateMythInput(input) {
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
  const imageUrl = validateImageUrl(input.imageUrl);
  return { title, author, story, lat, lng, type, region, source, imageUrl };
}

function serializeMyth(snap) {
  const data = snap.data() || {};
  const history = Array.isArray(data.feedbackHistory)
    ? data.feedbackHistory.map((item) => ({
        status: item.status || '',
        note: item.note || '',
        reviewerName: item.reviewerName || 'Administrator',
        reviewerRole: item.reviewerRole || 'admin',
        createdAt: toIso(item.createdAt),
      }))
    : [];
  return {
    id: snap.id,
    title: data.title || '',
    name: data.title || '',
    author: data.author || '',
    story: data.story || '',
    lat: Number(data.lat),
    lng: Number(data.lng),
    type: data.type === 'sea' ? 'sea' : 'land',
    region: data.region || '',
    source: data.source || '',
    imageUrl: data.imageUrl || '',
    ownerId: data.ownerId || '',
    status: data.status || 'pending',
    reviewNote: data.reviewNote || '',
    reviewedBy: data.reviewedBy || '',
    reviewedAt: toIso(data.reviewedAt),
    feedbackHistory: history,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    community: true,
  };
}

function serializeComment(snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    storyId: data.storyId || '',
    parentId: data.parentId ?? null,
    authorUid: data.authorUid || '',
    authorName: data.authorName || 'Explorer',
    authorRole: data.authorRole || 'guest',
    body: data.body || '',
    pinned: Boolean(data.pinned),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function serializeReview(snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    storyId: data.storyId || '',
    authorUid: data.authorUid || snap.id,
    authorName: data.authorName || 'Explorer',
    authorRole: data.authorRole === 'admin' ? 'admin' : 'user',
    rating: Number(data.rating) || 0,
    category: data.category || 'appreciation',
    feedback: data.feedback || '',
    highlighted: Boolean(data.highlighted),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

// ===========================================================================
// Authentication & User Profiles
// ===========================================================================
async function loadOrInitUserProfile(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    // Touch lastActiveAt without failing sign-in if offline/throttled.
    updateDoc(ref, { lastActiveAt: serverTimestamp() }).catch(() => {});
    return {
      uid: firebaseUser.uid,
      role: data.role === 'admin' ? 'admin' : 'user',
      name: data.name || firebaseUser.displayName || 'Explorer',
      email: data.email || firebaseUser.email || '',
      isAnonymous: false,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
    };
  }

  const fallbackName = (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Explorer').slice(0, 80);
  const profile = {
    name: fallbackName,
    email: (firebaseUser.email || '').toLowerCase(),
    role: 'user',
    bookmarks: [],
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return {
    uid: firebaseUser.uid,
    role: 'user',
    name: fallbackName,
    email: profile.email,
    isAnonymous: false,
    bookmarks: [],
  };
}

export function subscribeAuth(callback) {
  if (isLocalDemoMode) return localDemo.subscribeAuth(callback);
  if (!firebaseReady || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }
    if (firebaseUser.isAnonymous) {
      callback({
        uid: firebaseUser.uid,
        role: 'guest',
        name: 'Guest',
        email: '',
        isAnonymous: true,
        bookmarks: [],
      });
      return;
    }
    try {
      const profile = await loadOrInitUserProfile(firebaseUser);
      callback(profile);
    } catch (error) {
      console.error('Could not load user profile:', error);
      callback({
        uid: firebaseUser.uid,
        role: 'user',
        name: firebaseUser.displayName || 'Explorer',
        email: firebaseUser.email || '',
        isAnonymous: false,
        bookmarks: [],
      });
    }
  });
}

export async function signInAsGuest() {
  if (isLocalDemoMode) return localDemo.signInAsGuest();
  ensureFirebase();
  try {
    const credential = await signInAnonymously(auth);
    return {
      uid: credential.user.uid,
      role: 'guest',
      name: 'Guest',
      email: '',
      isAnonymous: true,
      bookmarks: [],
    };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not start guest session.'));
  }
}

export async function signInWithEmail({ email, password, expectedRole }) {
  if (isLocalDemoMode) return localDemo.signInWithEmail({ email, password, expectedRole });
  ensureFirebase();
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !password) {
    throw new Error('Please enter both your email and password.');
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const profile = await loadOrInitUserProfile(credential.user);
    if (expectedRole === 'admin' && profile.role !== 'admin') {
      await signOut(auth);
      throw new Error('This account does not have Administrator privileges.');
    }
    return profile;
  } catch (error) {
    if (error?.message === 'This account does not have Administrator privileges.') throw error;
    throw new Error(formatFirebaseError(error, 'Sign in failed.'));
  }
}

export async function registerExplorer({ name, email, password }) {
  if (isLocalDemoMode) return localDemo.registerExplorer({ name, email, password });
  ensureFirebase();
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new Error('Display name must be between 2 and 60 characters.');
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (String(password || '').length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    await updateProfile(credential.user, { displayName: cleanName });
    await setDoc(doc(db, 'users', credential.user.uid), {
      name: cleanName,
      email: cleanEmail,
      role: 'user',
      bookmarks: [],
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
    return {
      uid: credential.user.uid,
      role: 'user',
      name: cleanName,
      email: cleanEmail,
      isAnonymous: false,
      bookmarks: [],
    };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not create your account.'));
  }
}

export async function signOutUser() {
  if (isLocalDemoMode) return localDemo.signOutUser();
  if (!firebaseReady || !auth) return;
  await signOut(auth);
}

// ===========================================================================
// Bookmarks (users/{uid}.bookmarks)
// ===========================================================================
export async function toggleBookmark(uid, storyId, currentBookmarks = []) {
  if (isLocalDemoMode) return localDemo.toggleBookmark(uid, storyId, currentBookmarks);
  ensureFirebase();
  if (!uid || !storyId || !/^[a-zA-Z0-9_-]{1,100}$/.test(storyId)) {
    throw new Error('Invalid story ID.');
  }
  const set = new Set(currentBookmarks);
  const saved = !set.has(storyId);
  if (saved) {
    if (set.size >= 1000) {
      throw new Error('Your saved collection has reached the 1,000 story limit.');
    }
    set.add(storyId);
  } else {
    set.delete(storyId);
  }
  const next = [...set];
  try {
    await updateDoc(doc(db, 'users', uid), {
      bookmarks: next,
      lastActiveAt: serverTimestamp(),
    });
    return { bookmarks: next, saved };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not update your saved collection.'));
  }
}

// ===========================================================================
// Community Myths (myths/{mythId})
// ===========================================================================
export async function listApprovedMyths() {
  if (isLocalDemoMode) return localDemo.listApprovedMyths();
  if (!firebaseReady || !db) return [];
  const col = collection(db, 'myths');
  try {
    const snap = await getDocs(
      query(col, where('status', '==', 'approved'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(serializeMyth);
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      const snap = await getDocs(query(col, where('status', '==', 'approved')));
      return sortByCreatedDesc(snap.docs.map(serializeMyth));
    }
    throw new Error(formatFirebaseError(error, 'Could not load community stories.'));
  }
}

export async function listMySubmissions(uid) {
  if (isLocalDemoMode) return localDemo.listMySubmissions(uid);
  ensureFirebase();
  const col = collection(db, 'myths');
  try {
    const snap = await getDocs(
      query(col, where('ownerId', '==', uid), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(serializeMyth);
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      const snap = await getDocs(query(col, where('ownerId', '==', uid)));
      return sortByCreatedDesc(snap.docs.map(serializeMyth));
    }
    throw new Error(formatFirebaseError(error, 'Could not load your submissions.'));
  }
}

export async function submitMyth(user, data) {
  if (isLocalDemoMode) return localDemo.submitMyth(user, data);
  ensureFirebase();
  if (!user || user.isAnonymous || !['user', 'admin'].includes(user.role)) {
    throw new Error('Sign in as an Explorer or Administrator to share a myth.');
  }
  const payload = validateMythInput(data);
  try {
    const ref = await addDoc(collection(db, 'myths'), {
      ...payload,
      ownerId: user.uid,
      status: 'pending',
      reviewNote: '',
      feedbackHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, ...payload, ownerId: user.uid, status: 'pending' };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not submit your myth.'));
  }
}

export async function resubmitMyth(mythId, user, data) {
  if (isLocalDemoMode) return localDemo.resubmitMyth(mythId, user, data);
  ensureFirebase();
  if (!user || user.isAnonymous || !['user', 'admin'].includes(user.role)) {
    throw new Error('Sign in to edit and resubmit your story.');
  }
  const payload = validateMythInput(data);
  try {
    await updateDoc(doc(db, 'myths', mythId), {
      ...payload,
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
    return { id: mythId, ...payload, status: 'pending' };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not resubmit your story.'));
  }
}

// ===========================================================================
// Admin Moderation & Account Directory
// ===========================================================================
export async function listAllMythsForAdmin() {
  if (isLocalDemoMode) return localDemo.listAllMythsForAdmin();
  ensureFirebase();
  try {
    const snap = await getDocs(query(collection(db, 'myths'), orderBy('createdAt', 'desc')));
    return snap.docs.map(serializeMyth);
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      const snap = await getDocs(collection(db, 'myths'));
      return sortByCreatedDesc(snap.docs.map(serializeMyth));
    }
    throw new Error(formatFirebaseError(error, 'Could not load submissions.'));
  }
}

export async function reviewMyth({ mythId, status, reviewNote = '', adminUser }) {
  if (isLocalDemoMode) return localDemo.reviewMyth({ mythId, status, reviewNote, adminUser });
  ensureFirebase();
  if (!VALID_MYTH_STATUSES.has(status)) {
    throw new Error('Invalid moderation status.');
  }
  const cleanNote = String(reviewNote || '').trim();
  if (cleanNote.length > 500) {
    throw new Error('Review note must be 500 characters or fewer.');
  }
  const historyEntry = {
    status,
    note: cleanNote,
    reviewerName: adminUser?.name || 'Administrator',
    reviewerRole: 'admin',
    createdAt: new Date().toISOString(),
  };
  try {
    await updateDoc(doc(db, 'myths', mythId), {
      status,
      reviewNote: cleanNote,
      feedbackHistory: arrayUnion(historyEntry),
      reviewedBy: adminUser?.uid || '',
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return historyEntry;
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not save moderation decision.'));
  }
}

export async function deleteMyth(mythId) {
  if (isLocalDemoMode) return localDemo.deleteMyth(mythId);
  ensureFirebase();
  try {
    await deleteDoc(doc(db, 'myths', mythId));
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not delete submission.'));
  }
}

export async function listAccountsForAdmin(myths = []) {
  if (isLocalDemoMode) return localDemo.listAccountsForAdmin(myths);
  ensureFirebase();
  try {
    const snap = await getDocs(collection(db, 'users'));
    const counts = new Map();
    for (const myth of myths) {
      if (myth.ownerId) counts.set(myth.ownerId, (counts.get(myth.ownerId) || 0) + 1);
    }
    return snap.docs
      .map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          uid: docSnap.id,
          name: data.name || 'Explorer',
          email: data.email || '',
          role: data.role === 'admin' ? 'admin' : 'user',
          submissions: counts.get(docSnap.id) || 0,
          createdAt: toIso(data.createdAt),
          lastActiveAt: toIso(data.lastActiveAt),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not load account directory.'));
  }
}

export async function deleteAccountProfile(uid, currentAdminUid) {
  if (isLocalDemoMode) return localDemo.deleteAccountProfile(uid, currentAdminUid);
  ensureFirebase();
  if (uid === currentAdminUid) {
    throw new Error('Your signed-in administrator account cannot be removed.');
  }
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not remove account profile.'));
  }
}

// ===========================================================================
// Per-Creature Community Discussion Threads (stories/{storyId}/comments)
// ===========================================================================
export async function getStoryCommentCount(storyId) {
  if (isLocalDemoMode) return localDemo.getStoryCommentCount(storyId);
  if (!firebaseReady || !db || !storyId) return 0;
  try {
    const agg = await getCountFromServer(collection(db, 'stories', storyId, 'comments'));
    return agg.data().count || 0;
  } catch {
    return 0;
  }
}

export async function listStoryComments(storyId, { pageSize = 20, cursor = null } = {}) {
  if (isLocalDemoMode) return localDemo.listStoryComments(storyId, { pageSize, cursor });
  if (!firebaseReady || !db || !storyId) {
    return { comments: [], repliesByParent: {}, nextCursor: null, hasMore: false };
  }
  const commentsCol = collection(db, 'stories', storyId, 'comments');
  try {
    const constraints = [
      where('parentId', '==', null),
      orderBy('pinned', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(pageSize + 1),
    ];
    if (cursor) constraints.splice(3, 0, startAfter(cursor));

    const snap = await getDocs(query(commentsCol, ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const comments = pageDocs.map(serializeComment);
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1] : null;

    const repliesByParent = {};
    const parentIds = comments.map((c) => c.id);
    if (parentIds.length > 0) {
      // pageSize <= 20 fits inside Firestore's `in` limit of 30 in a single query.
      try {
        const replySnap = await getDocs(
          query(commentsCol, where('parentId', 'in', parentIds), orderBy('createdAt', 'asc'))
        );
        for (const rDoc of replySnap.docs) {
          const reply = serializeComment(rDoc);
          if (!repliesByParent[reply.parentId]) repliesByParent[reply.parentId] = [];
          repliesByParent[reply.parentId].push(reply);
        }
      } catch (replyError) {
        if (replyError?.code === 'failed-precondition') {
          const replySnap = await getDocs(query(commentsCol, where('parentId', 'in', parentIds)));
          for (const rDoc of replySnap.docs) {
            const reply = serializeComment(rDoc);
            if (!repliesByParent[reply.parentId]) repliesByParent[reply.parentId] = [];
            repliesByParent[reply.parentId].push(reply);
          }
          for (const key of Object.keys(repliesByParent)) {
            repliesByParent[key] = sortByCreatedAsc(repliesByParent[key]);
          }
        } else {
          throw replyError;
        }
      }
    }

    return { comments, repliesByParent, nextCursor, hasMore };
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      // Fallback if composite indexes are still deploying on a fresh project.
      const allSnap = await getDocs(commentsCol);
      const all = allSnap.docs.map(serializeComment);
      const top = all
        .filter((c) => !c.parentId)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
      const offset = typeof cursor === 'number' ? cursor : 0;
      const slice = top.slice(offset, offset + pageSize);
      const sliceIds = new Set(slice.map((c) => c.id));
      const repliesByParent = {};
      for (const item of sortByCreatedAsc(all.filter((c) => c.parentId && sliceIds.has(c.parentId)))) {
        if (!repliesByParent[item.parentId]) repliesByParent[item.parentId] = [];
        repliesByParent[item.parentId].push(item);
      }
      return {
        comments: slice,
        repliesByParent,
        nextCursor: offset + pageSize < top.length ? offset + pageSize : null,
        hasMore: offset + pageSize < top.length,
      };
    }
    throw new Error(formatFirebaseError(error, 'Could not load discussion comments.'));
  }
}

export async function createComment({ storyId, parentId = null, user, authorName, body }) {
  if (isLocalDemoMode) return localDemo.createComment({ storyId, parentId, user, authorName, body });
  ensureFirebase();
  if (!user?.uid) {
    throw new Error('Sign in or continue as a Guest to join the discussion.');
  }
  const cleanBody = String(body || '').trim();
  if (cleanBody.length < 1 || cleanBody.length > 1000) {
    throw new Error('Comment must be between 1 and 1,000 characters.');
  }
  const resolvedName = (
    user.role === 'guest' ? String(authorName || 'Guest Explorer').trim() || 'Guest Explorer' : user.name || 'Explorer'
  ).slice(0, 40);
  if (resolvedName.length < 2) {
    throw new Error('Display name must be at least 2 characters.');
  }
  const authorRole = user.role === 'admin' ? 'admin' : user.role === 'user' ? 'user' : 'guest';
  try {
    const ref = await addDoc(collection(db, 'stories', storyId, 'comments'), {
      storyId,
      parentId: parentId || null,
      authorUid: user.uid,
      authorName: resolvedName,
      authorRole,
      body: cleanBody,
      pinned: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const now = new Date().toISOString();
    return {
      id: ref.id,
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
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not post your comment.'));
  }
}

export async function updateComment({ storyId, commentId, body }) {
  if (isLocalDemoMode) return localDemo.updateComment({ storyId, commentId, body });
  ensureFirebase();
  const cleanBody = String(body || '').trim();
  if (cleanBody.length < 1 || cleanBody.length > 1000) {
    throw new Error('Comment must be between 1 and 1,000 characters.');
  }
  try {
    await updateDoc(doc(db, 'stories', storyId, 'comments', commentId), {
      body: cleanBody,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not update your comment.'));
  }
}

export async function togglePinComment({ storyId, commentId, pinned }) {
  if (isLocalDemoMode) return localDemo.togglePinComment({ storyId, commentId, pinned });
  ensureFirebase();
  try {
    await updateDoc(doc(db, 'stories', storyId, 'comments', commentId), {
      pinned: Boolean(pinned),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not update pin state.'));
  }
}

export async function deleteComment({ storyId, commentId, isTopLevel = false, isAdmin = false, currentUid = '' }) {
  if (isLocalDemoMode) return localDemo.deleteComment({ storyId, commentId, isTopLevel, isAdmin, currentUid });
  ensureFirebase();
  const commentsCol = collection(db, 'stories', storyId, 'comments');
  try {
    if (isTopLevel) {
      const childSnap = await getDocs(query(commentsCol, where('parentId', '==', commentId)));
      const batch = writeBatch(db);
      batch.delete(doc(commentsCol, commentId));
      for (const child of childSnap.docs) {
        if (isAdmin || child.data()?.authorUid === currentUid) {
          batch.delete(child.ref);
        }
      }
      await batch.commit();
    } else {
      await deleteDoc(doc(commentsCol, commentId));
    }
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not delete comment.'));
  }
}

// ===========================================================================
// Published Myth Reviews & Feedback (stories/{storyId}/reviews/{authorUid})
// ===========================================================================
export async function listStoryReviews(storyId) {
  if (isLocalDemoMode) return localDemo.listStoryReviews(storyId);
  if (!firebaseReady || !db || !storyId) {
    return { reviews: [], average: 0, count: 0 };
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'stories', storyId, 'reviews'), orderBy('createdAt', 'desc'))
    );
    const reviews = snap.docs.map(serializeReview);
    return summarizeReviews(reviews);
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      const snap = await getDocs(collection(db, 'stories', storyId, 'reviews'));
      return summarizeReviews(sortByCreatedDesc(snap.docs.map(serializeReview)));
    }
    throw new Error(formatFirebaseError(error, 'Could not load reviews.'));
  }
}

export function summarizeReviews(reviews) {
  const count = reviews.length;
  const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  const average = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
  return { reviews, average, count };
}

export async function saveReview({ storyId, user, rating, category, feedback, existingReview }) {
  if (isLocalDemoMode) return localDemo.saveReview({ storyId, user, rating, category, feedback, existingReview });
  ensureFirebase();
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

  const ref = doc(db, 'stories', storyId, 'reviews', user.uid);
  const authorRole = user.role === 'admin' ? 'admin' : 'user';
  const authorName = (user.name || 'Explorer').slice(0, 80);

  try {
    if (existingReview) {
      await updateDoc(ref, {
        rating: intRating,
        category,
        feedback: cleanFeedback,
        authorName,
        updatedAt: serverTimestamp(),
      });
      return {
        ...existingReview,
        rating: intRating,
        category,
        feedback: cleanFeedback,
        authorName,
        updatedAt: new Date().toISOString(),
      };
    }

    await setDoc(ref, {
      storyId,
      authorUid: user.uid,
      authorName,
      authorRole,
      rating: intRating,
      category,
      feedback: cleanFeedback,
      highlighted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const now = new Date().toISOString();
    return {
      id: user.uid,
      storyId,
      authorUid: user.uid,
      authorName,
      authorRole,
      rating: intRating,
      category,
      feedback: cleanFeedback,
      highlighted: false,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not save your review.'));
  }
}

export async function deleteReview({ storyId, reviewUid }) {
  if (isLocalDemoMode) return localDemo.deleteReview({ storyId, reviewUid });
  ensureFirebase();
  try {
    await deleteDoc(doc(db, 'stories', storyId, 'reviews', reviewUid));
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not delete review.'));
  }
}

export async function toggleHighlightReview({ storyId, reviewUid, highlighted }) {
  if (isLocalDemoMode) return localDemo.toggleHighlightReview({ storyId, reviewUid, highlighted });
  ensureFirebase();
  try {
    await updateDoc(doc(db, 'stories', storyId, 'reviews', reviewUid), {
      highlighted: Boolean(highlighted),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(formatFirebaseError(error, 'Could not update highlight status.'));
  }
}
