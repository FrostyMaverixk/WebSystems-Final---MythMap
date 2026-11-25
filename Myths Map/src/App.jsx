import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminDashboardModal } from './components/AdminDashboardModal.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { DiscoverySidebar } from './components/DiscoverySidebar.jsx';
import { EncounterModal } from './components/EncounterModal.jsx';
import { HelpModal } from './components/HelpModal.jsx';
import { MapCanvas } from './components/MapCanvas.jsx';
import { MythFormModal } from './components/MythFormModal.jsx';
import { StoryReader } from './components/StoryReader.jsx';
import { SubmissionsModal } from './components/SubmissionsModal.jsx';
import { Toast } from './components/Toast.jsx';
import { CREATURES, GALLERY_URL, hydrateCreaturesWithGallery } from './engine/config.js';
import {
  isBackendReady,
  isLocalDemoMode,
  listApprovedMyths,
  quickSignInDemoRole,
  registerExplorer,
  resetLocalDemoData,
  resubmitMyth,
  signInAsGuest,
  signInWithEmail,
  signOutUser,
  submitMyth,
  subscribeAuth,
  toggleBookmark,
} from './services/api.js';
import { kindLabel } from './utils/format.js';

function initialHighQuality() {
  try {
    const saved = localStorage.getItem('myths-map-quality');
    if (saved === 'high') return true;
    if (saved === 'low') return false;
  } catch {
    // Optional preference
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function App() {
  const mapRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Built-in gallery manifest (dynamically baked via scripts/bake-gallery.mjs)
  const [gallery, setGallery] = useState(null);

  // Auth & session
  const [authInitialized, setAuthInitialized] = useState(!isBackendReady);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(true);
  const [authPromptMessage, setAuthPromptMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Stories & filters
  const [communityMyths, setCommunityMyths] = useState([]);
  const [dataError, setDataError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);

  // Map & visual state
  const [highQuality, setHighQuality] = useState(initialHighQuality);
  const [mapReady, setMapReady] = useState(false);
  const [placingPin, setPlacingPin] = useState(false);
  const [statusOverride, setStatusOverride] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [activeWeather, setActiveWeather] = useState(null);

  // Modals & 3D Encounter
  const [encounterStory, setEncounterStory] = useState(null);
  const [mythFormState, setMythFormState] = useState({ open: false, location: null, editingMyth: null });
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((message) => {
    clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 6000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  // 1. Fetch dynamic built-in gallery manifest on startup
  useEffect(() => {
    let active = true;
    fetch(GALLERY_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest) => {
        if (active && manifest) setGallery(manifest);
      })
      .catch(() => {
        // Fallback: built-in stories still render gracefully without gallery metadata.
      });
    return () => {
      active = false;
    };
  }, []);

  const builtinCreatures = useMemo(
    () => hydrateCreaturesWithGallery(CREATURES, gallery),
    [gallery]
  );
  const communityMarker = gallery?.communityMarker || '';

  // 2. Subscribe to Auth state (Firebase Auth or Local Demo Store)
  useEffect(() => {
    if (!isBackendReady) {
      setAuthInitialized(true);
      return undefined;
    }
    const unsubscribe = subscribeAuth((nextUser) => {
      setUser(nextUser);
      setAuthInitialized(true);
      if (nextUser) {
        setAuthModalOpen(false);
        setAuthPromptMessage('');
      } else {
        setSavedOnly(false);
        setPlacingPin(false);
        setStatusOverride('');
        setSubmissionsOpen(false);
        setAdminOpen(false);
        setMythFormState({ open: false, location: null, editingMyth: null });
      }
    });
    return unsubscribe;
  }, []);

  // 3. Load approved community myths
  const refreshCommunityMyths = useCallback(async () => {
    if (!isBackendReady) return;
    try {
      const approved = await listApprovedMyths();
      setCommunityMyths(approved);
      setDataError('');
    } catch (err) {
      setDataError(err?.message || 'Could not load community stories.');
      showToast(err?.message || 'Could not load community stories.');
    }
  }, [showToast]);

  useEffect(() => {
    refreshCommunityMyths();
  }, [refreshCommunityMyths]);

  const canWrite = Boolean(user && !user.isAnonymous && ['user', 'admin'].includes(user.role));
  const bookmarksSet = useMemo(() => new Set(user?.bookmarks || []), [user?.bookmarks]);

  const allStories = useMemo(
    () => [
      ...builtinCreatures,
      ...communityMyths.map((myth) => ({ ...myth, name: myth.title, community: true })),
    ],
    [builtinCreatures, communityMyths]
  );

  const filteredStories = useMemo(() => {
    const search = searchQuery.trim().toLocaleLowerCase();
    return allStories.filter((myth) => {
      if (typeFilter === 'community') {
        if (!myth.community) return false;
      } else if (typeFilter !== 'all' && myth.type !== typeFilter) {
        return false;
      }
      if (canWrite && savedOnly && !bookmarksSet.has(myth.id)) return false;
      if (!search) return true;
      return [myth.title, myth.story, myth.author, myth.region || '', kindLabel(myth)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search);
    });
  }, [allStories, searchQuery, typeFilter, savedOnly, canWrite, bookmarksSet]);

  const filteredIds = useMemo(() => filteredStories.map((s) => s.id), [filteredStories]);

  const selectedStory = useMemo(
    () => (selectedId ? allStories.find((s) => s.id === selectedId) || null : null),
    [selectedId, allStories]
  );

  // Focus the map after React mounts #details-panel so readerPadding() measures its real rect.
  useEffect(() => {
    if (!selectedStory) return undefined;
    const rafId = requestAnimationFrame(() => {
      mapRef.current?.focusOn(selectedStory.lat, selectedStory.lng);
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedStory?.id]);

  // Global Escape handler when no modal/encounter is open
  const anyModalOpen =
    authModalOpen || mythFormState.open || submissionsOpen || adminOpen || helpOpen || Boolean(encounterStory);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || anyModalOpen) return;
      if (placingPin) {
        setPlacingPin(false);
        setStatusOverride('');
      } else if (selectedId) {
        setSelectedId(null);
      } else if (window.innerWidth <= 760) {
        setMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen, placingPin, selectedId]);

  // Handlers
  const handleToggleQuality = useCallback(() => {
    setHighQuality((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('myths-map-quality', next ? 'high' : 'low');
      } catch {
        // Optional preference
      }
      return next;
    });
  }, []);

  const handleSelectStory = useCallback(
    (story) => {
      if (story.id === selectedId) {
        mapRef.current?.focusOn(story.lat, story.lng);
      } else {
        setSelectedId(story.id);
      }
      if (window.innerWidth <= 760) setMobileSidebarOpen(false);
    },
    [selectedId]
  );

  const handleMapSelectStory = useCallback(
    (story) => {
      if (story.id === selectedId) {
        mapRef.current?.focusOn(story.lat, story.lng);
      } else {
        setSelectedId(story.id);
      }
    },
    [selectedId]
  );

  const handleResetMap = useCallback(() => {
    setPlacingPin(false);
    setStatusOverride('');
    setSelectedId(null);
    mapRef.current?.fitCameraToWorld();
  }, []);

  const handleRequireAuth = useCallback((message = '') => {
    setAuthPromptMessage(message);
    setAuthModalOpen(true);
  }, []);

  const handleSignIn = async (payload) => {
    setAuthBusy(true);
    try {
      const profile = await signInWithEmail(payload);
      setUser(profile);
      setAuthModalOpen(false);
      setAuthPromptMessage('');
      showToast(`Welcome, ${profile.name}. Your journey starts here.`);
      refreshCommunityMyths();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (payload) => {
    setAuthBusy(true);
    try {
      const profile = await registerExplorer(payload);
      setUser(profile);
      setAuthModalOpen(false);
      setAuthPromptMessage('');
      showToast(`Welcome, ${profile.name}. Your Explorer account is ready.`);
      refreshCommunityMyths();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGuest = async () => {
    setAuthBusy(true);
    try {
      const guest = await signInAsGuest();
      setUser(guest);
      setAuthModalOpen(false);
      setAuthPromptMessage('');
      showToast('Welcome, guest. Explore stories and join creature discussions.');
      refreshCommunityMyths();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleQuickDemoRole = async (role) => {
    if (!isLocalDemoMode) return;
    setAuthBusy(true);
    try {
      setEncounterStory(null);
      setPlacingPin(false);
      setStatusOverride('');
      setSubmissionsOpen(false);
      setAdminOpen(false);
      setMythFormState({ open: false, location: null, editingMyth: null });
      const profile = await quickSignInDemoRole(role);
      setUser(profile);
      setAuthModalOpen(false);
      setAuthPromptMessage('');
      await refreshCommunityMyths();
      const label =
        profile.role === 'admin'
          ? 'Administrator'
          : profile.role === 'user'
          ? 'Explorer'
          : 'Guest';
      showToast(`Switched to ${label} demo account (${profile.name}).`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetDemo = async () => {
    if (!isLocalDemoMode) return;
    if (!window.confirm('Reset local demo submissions, comments, reviews, and bookmarks?')) return;
    resetLocalDemoData();
    setSelectedId(null);
    await refreshCommunityMyths();
    showToast('Local demo data restored to initial seeded state.');
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      setEncounterStory(null);
      await signOutUser();
      setUser(null);
      setSelectedId(null);
      setAuthPromptMessage('');
      setAuthModalOpen(true);
      showToast('Signed out. Sign in again or continue as a guest.');
    } catch (err) {
      showToast(err?.message || 'Could not sign out.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleSave = async (story) => {
    if (!canWrite) {
      handleRequireAuth('Sign in as an Explorer or Administrator to save stories.');
      return;
    }
    setSaveBusy(true);
    try {
      const result = await toggleBookmark(user.uid, story.id, user.bookmarks || []);
      setUser((prev) => (prev ? { ...prev, bookmarks: result.bookmarks } : prev));
      showToast(
        result.saved ? 'Story saved to your collection.' : 'Story removed from your collection.'
      );
    } catch (err) {
      showToast(err?.message || 'Could not update saved stories.');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleToggleSharePin = () => {
    if (!canWrite) return;
    if (placingPin) {
      setPlacingPin(false);
      setStatusOverride('');
      return;
    }
    if (!mapReady) {
      showToast('The interactive map is still loading. Please wait a moment.');
      return;
    }
    setPlacingPin(true);
    setSelectedId(null);
    setMobileSidebarOpen(false);
    setStatusOverride('Choose a location in the Philippines on the map. Press Escape to cancel.');
    showToast('Click or tap the map to choose your story’s location.');
  };

  const handlePinLocation = useCallback((lat, lng) => {
    setPlacingPin(false);
    setStatusOverride('');
    setMythFormState({ open: true, location: { lat, lng }, editingMyth: null });
  }, []);

  const handlePinOutOfBounds = useCallback(() => {
    setStatusOverride('Choose a location within the Philippine map area (4–22° N, 116–127° E). Press Escape to cancel.');
  }, []);

  const handleCancelPin = useCallback(() => {
    setPlacingPin(false);
    setStatusOverride('');
  }, []);

  const handleSubmitMyth = async (formData) => {
    if (formData.mythId) {
      await resubmitMyth(formData.mythId, user, formData);
      setMythFormState({ open: false, location: null, editingMyth: null });
      showToast('Your revised story was resubmitted for administrator review.');
      setSubmissionsOpen(true);
    } else {
      await submitMyth(user, formData);
      setMythFormState({ open: false, location: null, editingMyth: null });
      showToast(
        `Your story was submitted for review. ${
          user?.role === 'admin' ? 'Track it in Dashboard.' : 'Track it in My submissions.'
        }`
      );
    }
  };

  const handleEditResubmit = (myth) => {
    setSubmissionsOpen(false);
    setMythFormState({ open: true, location: null, editingMyth: myth });
  };

  return (
    <>
      <MapCanvas
        ref={mapRef}
        builtinCreatures={builtinCreatures}
        communityMyths={communityMyths}
        communityMarker={communityMarker}
        filterType={typeFilter}
        filteredIds={filteredIds}
        highQuality={highQuality}
        placingPin={placingPin}
        canWrite={canWrite}
        windSpeed={activeWeather?.windSpeed ?? null}
        encounterOpen={Boolean(encounterStory)}
        statusOverride={statusOverride}
        onToggleQuality={handleToggleQuality}
        onResetMap={handleResetMap}
        onSelectStory={handleMapSelectStory}
        onClearSelection={() => setSelectedId(null)}
        onPinLocation={handlePinLocation}
        onPinOutOfBounds={handlePinOutOfBounds}
        onCancelPin={handleCancelPin}
        onReadyChange={setMapReady}
      />

      <AppHeader
        user={user}
        busy={authBusy}
        isDemoMode={isLocalDemoMode}
        onSignOut={handleSignOut}
        onOpenAuth={() => handleRequireAuth('')}
        onQuickDemoRole={handleQuickDemoRole}
        onResetDemo={handleResetDemo}
      />

      <main>
        <DiscoverySidebar
          stories={filteredStories}
          totalCount={allStories.length}
          selectedId={selectedId}
          bookmarks={bookmarksSet}
          canWrite={canWrite}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          savedOnly={savedOnly}
          mobileOpen={mobileSidebarOpen}
          dataError={dataError}
          onSearchChange={setSearchQuery}
          onTypeFilterChange={setTypeFilter}
          onSavedOnlyChange={setSavedOnly}
          onSelectStory={handleSelectStory}
          onToggleMobile={() => setMobileSidebarOpen((open) => !open)}
          onRetryData={refreshCommunityMyths}
          onOpenHelp={() => setHelpOpen(true)}
        />

        {canWrite && (
          <div id="top-right-controls" className="map-actions">
            {user?.role === 'user' && (
              <button
                id="submissions-btn"
                type="button"
                onClick={() => setSubmissionsOpen(true)}
              >
                My submissions
              </button>
            )}
            {user?.role === 'admin' && (
              <button id="admin-btn" type="button" onClick={() => setAdminOpen(true)}>
                Dashboard
              </button>
            )}
            <button
              id="action-btn"
              type="button"
              className={`accent-button${placingPin ? ' active' : ''}`}
              onClick={handleToggleSharePin}
            >
              {placingPin ? 'Cancel pin' : '＋ Share a myth'}
            </button>
          </div>
        )}

        <StoryReader
          story={selectedStory}
          user={user}
          canWrite={canWrite}
          isSaved={Boolean(selectedStory && bookmarksSet.has(selectedStory.id))}
          saveBusy={saveBusy}
          onClose={() => setSelectedId(null)}
          onFocusMap={(story) => mapRef.current?.focusOn(story.lat, story.lng)}
          onToggleSave={handleToggleSave}
          onOpenEncounter={(story) => setEncounterStory(story)}
          onRequireAuth={handleRequireAuth}
          onWeatherChange={setActiveWeather}
          onToast={showToast}
        />
      </main>

      <AuthModal
        isOpen={authInitialized && authModalOpen}
        initialMessage={authPromptMessage}
        canDismiss={Boolean(user)}
        busy={authBusy}
        isDemoMode={isLocalDemoMode}
        onSignIn={handleSignIn}
        onRegister={handleRegister}
        onGuest={handleGuest}
        onQuickDemoRole={handleQuickDemoRole}
        onClose={() => setAuthModalOpen(false)}
      />

      <MythFormModal
        isOpen={mythFormState.open}
        location={mythFormState.location}
        editingMyth={mythFormState.editingMyth}
        defaultAuthor={user?.name || ''}
        onSubmit={handleSubmitMyth}
        onCancel={() => {
          setMythFormState({ open: false, location: null, editingMyth: null });
          setPlacingPin(false);
          setStatusOverride('');
        }}
      />

      <SubmissionsModal
        isOpen={submissionsOpen}
        user={user}
        onEditResubmit={handleEditResubmit}
        onClose={() => setSubmissionsOpen(false)}
      />

      <AdminDashboardModal
        isOpen={adminOpen}
        user={user}
        onDataChanged={refreshCommunityMyths}
        onToast={showToast}
        onClose={() => setAdminOpen(false)}
      />

      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <EncounterModal
        story={encounterStory}
        highQuality={highQuality}
        isDay={activeWeather?.isDay ?? 1}
        onClose={() => setEncounterStory(null)}
        onError={showToast}
      />

      <Toast message={toastMessage} />
    </>
  );
}
