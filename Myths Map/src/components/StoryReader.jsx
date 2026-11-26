import { useCallback, useEffect, useState } from 'react';
import { hasEncounterModel } from '../engine/encounter-scene.js';
import { getStoryCommentCount, listStoryReviews } from '../services/api.js';
import {
  fetchLiveWeather,
  fetchMarineConditions,
  fetchOpenLibraryBooks,
  fetchSunriseSunset,
  fetchWikimediaCommonsMedia,
  fetchWikipediaLore,
  getLunarPhase,
} from '../services/externalApis.js';
import { coordinatesLabel, formatAtmosphereSummary, kindLabel } from '../utils/format.js';
import { DiscussionTab } from './DiscussionTab.jsx';
import { ReviewsTab } from './ReviewsTab.jsx';

const TABS = ['story', 'discussion', 'reviews'];

export function StoryReader({
  story,
  user,
  canWrite,
  isSaved,
  saveBusy,
  onClose,
  onFocusMap,
  onToggleSave,
  onOpenEncounter,
  onRequireAuth,
  onWeatherChange,
  onMarineChange,
  onToast,
}) {
  const [activeTab, setActiveTab] = useState('story');
  const [weather, setWeather] = useState(null);
  const [marine, setMarine] = useState(null);
  const [solar, setSolar] = useState(null);
  const [wikiLore, setWikiLore] = useState(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [commonsMedia, setCommonsMedia] = useState([]);
  const [commonsOpen, setCommonsOpen] = useState(false);
  const [books, setBooks] = useState([]);
  const [booksOpen, setBooksOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [reviewSummary, setReviewSummary] = useState({ average: 0, count: 0 });
  const [preloadedReviews, setPreloadedReviews] = useState(null);

  // Reset tab and load live weather, marine, solar, Wikipedia, Commons, Open Library, and counts.
  useEffect(() => {
    if (!story) {
      setWeather(null);
      setMarine(null);
      setSolar(null);
      setWikiLore(null);
      setWikiOpen(false);
      setCommonsMedia([]);
      setCommonsOpen(false);
      setBooks([]);
      setBooksOpen(false);
      setPreloadedReviews(null);
      onWeatherChange?.(null);
      onMarineChange?.(null);
      return undefined;
    }

    setActiveTab('story');
    setWeather(null);
    setMarine(null);
    setSolar(null);
    setWikiLore(null);
    setWikiOpen(false);
    setCommonsMedia([]);
    setCommonsOpen(false);
    setBooks([]);
    setBooksOpen(false);
    setCommentCount(0);
    setReviewSummary({ average: 0, count: 0 });
    setPreloadedReviews(null);
    onMarineChange?.(null);

    const controller = new AbortController();
    let active = true;

    fetchLiveWeather(story.lat, story.lng, { signal: controller.signal }).then((data) => {
      if (!active) return;
      setWeather(data);
      onWeatherChange?.(data);
    });

    if (story.type === 'sea') {
      fetchMarineConditions(story.lat, story.lng, { signal: controller.signal }).then((data) => {
        if (!active) return;
        setMarine(data);
        onMarineChange?.(data);
      });
    }

    fetchSunriseSunset(story.lat, story.lng, { signal: controller.signal }).then((data) => {
      if (!active) return;
      setSolar(data);
    });

    fetchWikipediaLore(story, { signal: controller.signal }).then((data) => {
      if (!active) return;
      setWikiLore(data);
    });

    fetchWikimediaCommonsMedia(story, { signal: controller.signal }).then((items) => {
      if (!active) return;
      setCommonsMedia(items);
    });

    fetchOpenLibraryBooks(story, { signal: controller.signal }).then((items) => {
      if (!active) return;
      setBooks(items);
    });

    getStoryCommentCount(story.id).then((count) => {
      if (active) setCommentCount(count);
    });

    listStoryReviews(story.id)
      .then((res) => {
        if (active) {
          setReviewSummary({ average: res.average, count: res.count });
          setPreloadedReviews(res.reviews);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      controller.abort();
    };
  }, [story?.id, story?.lat, story?.lng, story?.region, story?.type]);

  const handleCountDelta = useCallback((delta) => {
    setCommentCount((prev) => Math.max(0, prev + delta));
  }, []);

  const handleSummaryChange = useCallback((next) => {
    setReviewSummary(next);
  }, []);

  if (!story) return null;

  const displayImage = story.banner || story.imageUrl || '';
  const fullImageLink = story.illustration || story.imageUrl || displayImage;
  const showEncounterButton = !story.community && hasEncounterModel(story.id);
  const moonPhase = solar?.moonPhase || getLunarPhase();
  const atmosphereSummary = formatAtmosphereSummary({
    weather,
    marine: story.type === 'sea' ? marine : null,
    moonPhase,
  });

  const handleTabKeyDown = (event) => {
    const currentIndex = TABS.indexOf(activeTab);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveTab(TABS[(currentIndex + 1) % TABS.length]);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveTab(TABS[(currentIndex - 1 + TABS.length) % TABS.length]);
    }
  };

  return (
    <section id="details-panel" className="details-panel" aria-labelledby="detail-title">
      <button
        id="close-details"
        className="close-button"
        type="button"
        aria-label="Close story"
        onClick={onClose}
      >
        ×
      </button>

      <p id="detail-kind" className="eyebrow">
        {kindLabel(story)} · {story.community ? 'Community story' : 'Folklore collection'}
      </p>
      <h2 id="detail-title">{story.title || story.name}</h2>
      <p id="detail-location" className="location-text">
        {story.region ? `${story.region} · ` : ''}
        {coordinatesLabel(story)}
      </p>

      {atmosphereSummary && (
        <div className="weather-pill" title={atmosphereSummary.tooltip}>
          <span aria-hidden="true">{atmosphereSummary.icon}</span>
          <span>{atmosphereSummary.text}</span>
        </div>
      )}

      <div
        className="reader-tabs"
        role="tablist"
        aria-label="Story sections"
        onKeyDown={handleTabKeyDown}
      >
        <button
          id="tab-story"
          type="button"
          role="tab"
          aria-selected={String(activeTab === 'story')}
          aria-controls="panel-story"
          tabIndex={activeTab === 'story' ? 0 : -1}
          onClick={() => setActiveTab('story')}
        >
          Story
        </button>
        <button
          id="tab-discussion"
          type="button"
          role="tab"
          aria-selected={String(activeTab === 'discussion')}
          aria-controls="panel-discussion"
          tabIndex={activeTab === 'discussion' ? 0 : -1}
          onClick={() => setActiveTab('discussion')}
        >
          Discussion <span className="tab-count">{commentCount}</span>
        </button>
        <button
          id="tab-reviews"
          type="button"
          role="tab"
          aria-selected={String(activeTab === 'reviews')}
          aria-controls="panel-reviews"
          tabIndex={activeTab === 'reviews' ? 0 : -1}
          onClick={() => setActiveTab('reviews')}
        >
          Reviews{' '}
          <span className="tab-count">
            {reviewSummary.count > 0
              ? `${reviewSummary.average.toFixed(1)}★/${reviewSummary.count}`
              : '0'}
          </span>
        </button>
      </div>

      {activeTab === 'story' && (
        <div id="panel-story" role="tabpanel" aria-labelledby="tab-story">
          {displayImage && (
            <figure id="creature-plate" className="creature-plate">
              <a
                id="full-illustration"
                href={fullImageLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View full image"
              >
                <img
                  id="creature-banner"
                  src={displayImage}
                  alt={`${story.title || story.name} folklore illustration`}
                />
              </a>
              <figcaption id="creature-habitat">
                {story.habitat || (story.community ? 'Community-submitted photograph or artwork' : '')}
                {fullImageLink && (
                  <>
                    {' · '}
                    <a href={fullImageLink} target="_blank" rel="noopener noreferrer">
                      View full image ↗
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
          )}

          {showEncounterButton && (
            <button
              id="enter-creature-view"
              type="button"
              className="accent-button"
              onClick={() => onOpenEncounter?.(story)}
            >
              Enter 3D Encounter ↗
            </button>
          )}

          <div className="story-divider" aria-hidden="true">
            ✧
          </div>

          <p id="detail-story" className="detail-story">
            {story.story}
          </p>

          <div className="story-credit">
            Shared by <span id="detail-author">{story.author || 'Philippine folklore'}</span>
          </div>

          <p id="detail-source" className="source-text">
            {story.source
              ? `Source / oral tradition: ${story.source}`
              : 'Folklore varies across communities. Map locations are illustrative.'}
          </p>

          {wikiLore && (
            <div className="wiki-card">
              <button
                type="button"
                className="wiki-toggle"
                aria-expanded={String(wikiOpen)}
                onClick={() => setWikiOpen((open) => !open)}
              >
                <span>Cultural &amp; Regional Context</span>
                <span aria-hidden="true">{wikiOpen ? '−' : '+'}</span>
              </button>
              {wikiOpen && (
                <div className="wiki-body">
                  <strong>{wikiLore.title}</strong>
                  <p>{wikiLore.extract}</p>
                  <a href={wikiLore.url} target="_blank" rel="noopener noreferrer">
                    Read more on Wikipedia ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {commonsMedia.length > 0 && (
            <div className="wiki-card">
              <button
                type="button"
                className="wiki-toggle"
                aria-expanded={String(commonsOpen)}
                onClick={() => setCommonsOpen((open) => !open)}
              >
                <span>Archival Gallery ({commonsMedia.length})</span>
                <span aria-hidden="true">{commonsOpen ? '−' : '+'}</span>
              </button>
              {commonsOpen && (
                <div className="wiki-body">
                  <div className="commons-grid">
                    {commonsMedia.map((item) => (
                      <a
                        key={item.pageUrl}
                        className="commons-item"
                        href={item.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img src={item.thumbUrl} alt={item.title} loading="lazy" />
                        <span className="commons-title">{item.title}</span>
                        {(item.artist || item.license) && (
                          <span className="commons-credit">
                            {[item.artist, item.license].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {books.length > 0 && (
            <div className="wiki-card">
              <button
                type="button"
                className="wiki-toggle"
                aria-expanded={String(booksOpen)}
                onClick={() => setBooksOpen((open) => !open)}
              >
                <span>Further Reading ({books.length})</span>
                <span aria-hidden="true">{booksOpen ? '−' : '+'}</span>
              </button>
              {booksOpen && (
                <div className="wiki-body">
                  <ul className="book-list">
                    {books.map((book) => (
                      <li key={book.key} className="book-item">
                        {book.coverUrl && (
                          <img
                            className="book-cover"
                            src={book.coverUrl}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="book-info">
                          <a href={book.url} target="_blank" rel="noopener noreferrer">
                            {book.title} ↗
                          </a>
                          <span>
                            {book.author}
                            {book.year ? ` (${book.year})` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="detail-actions">
            <button
              id="detail-focus"
              type="button"
              className="accent-button"
              onClick={() => onFocusMap?.(story)}
            >
              Find on map ↗
            </button>
            <button
              id="detail-save"
              type="button"
              disabled={saveBusy}
              aria-pressed={String(Boolean(canWrite && isSaved))}
              title={!canWrite ? 'Sign in as an Explorer to save stories' : undefined}
              onClick={() => onToggleSave?.(story)}
            >
              {canWrite && isSaved ? '★ Saved to collection' : '☆ Save story'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'discussion' && (
        <div id="panel-discussion" role="tabpanel" aria-labelledby="tab-discussion">
          <DiscussionTab
            storyId={story.id}
            user={user}
            onCountChange={handleCountDelta}
            onRequireAuth={onRequireAuth}
            onToast={onToast}
          />
        </div>
      )}

      {activeTab === 'reviews' && (
        <div id="panel-reviews" role="tabpanel" aria-labelledby="tab-reviews">
          <ReviewsTab
            storyId={story.id}
            user={user}
            initialReviews={preloadedReviews}
            onSummaryChange={handleSummaryChange}
            onReviewsChange={setPreloadedReviews}
            onRequireAuth={onRequireAuth}
            onToast={onToast}
          />
        </div>
      )}
    </section>
  );
}
