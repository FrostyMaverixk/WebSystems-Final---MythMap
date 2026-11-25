import { useCallback, useEffect, useState } from 'react';
import { hasEncounterModel } from '../engine/encounter-scene.js';
import { getStoryCommentCount, listStoryReviews } from '../services/api.js';
import { fetchLiveWeather, fetchWikipediaLore } from '../services/externalApis.js';
import { coordinatesLabel, kindLabel } from '../utils/format.js';
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
  onToast,
}) {
  const [activeTab, setActiveTab] = useState('story');
  const [weather, setWeather] = useState(null);
  const [wikiLore, setWikiLore] = useState(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [reviewSummary, setReviewSummary] = useState({ average: 0, count: 0 });
  const [preloadedReviews, setPreloadedReviews] = useState(null);

  // Reset tab and load live weather, Wikipedia context, and badge counts when story changes.
  useEffect(() => {
    if (!story) {
      setWeather(null);
      setWikiLore(null);
      setWikiOpen(false);
      setPreloadedReviews(null);
      onWeatherChange?.(null);
      return undefined;
    }

    setActiveTab('story');
    setWeather(null);
    setWikiLore(null);
    setWikiOpen(false);
    setCommentCount(0);
    setReviewSummary({ average: 0, count: 0 });
    setPreloadedReviews(null);

    const controller = new AbortController();
    let active = true;

    fetchLiveWeather(story.lat, story.lng, { signal: controller.signal }).then((data) => {
      if (!active) return;
      setWeather(data);
      onWeatherChange?.(data);
    });

    fetchWikipediaLore(story, { signal: controller.signal }).then((data) => {
      if (!active) return;
      setWikiLore(data);
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
  }, [story?.id, story?.lat, story?.lng, story?.region]);

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

      {weather && (
        <div
          className="weather-pill"
          title={`Live local weather (${weather.dayPeriod}, wind ${Math.round(weather.windSpeed)} km/h) · Open-Meteo.com`}
        >
          <span aria-hidden="true">{weather.icon}</span>
          <span>
            {weather.temperature}°C · {weather.label} · {weather.dayPeriod}
          </span>
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
              aria-pressed={String(isSaved)}
              onClick={() => onToggleSave?.(story)}
            >
              {canWrite
                ? isSaved
                  ? '★ Saved to collection'
                  : '☆ Save story'
                : 'Sign in to save'}
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
