import { kindLabel } from '../utils/format.js';

export function DiscoverySidebar({
  stories,
  totalCount,
  selectedId,
  bookmarks,
  canWrite,
  searchQuery,
  typeFilter,
  savedOnly,
  mobileOpen,
  dataError,
  onSearchChange,
  onTypeFilterChange,
  onSavedOnlyChange,
  onSelectStory,
  onToggleMobile,
  onRetryData,
  onOpenHelp,
}) {
  return (
    <>
      <button
        id="sidebar-toggle"
        className="mobile-discover"
        type="button"
        aria-controls="discovery-panel"
        aria-expanded={String(mobileOpen)}
        onClick={onToggleMobile}
      >
        Explore stories
      </button>

      <aside
        id="discovery-panel"
        className={`discovery-panel${mobileOpen ? ' mobile-open' : ''}`}
        aria-label="Discover stories"
      >
        <div className="sidebar-intro">
          <p className="eyebrow">THE STORY ATLAS</p>
          <h1>
            Every island
            <br />
            holds a story.
          </h1>
          <p>Meet the guardians, tricksters, and creatures of Philippine folklore.</p>
        </div>

        <div className="discovery-tools">
          <label htmlFor="search-input" className="sr-only">
            Search stories by name, region, or story
          </label>
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              id="search-input"
              type="search"
              placeholder="Find a creature or a tale…"
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          <div className="filter-row">
            <label htmlFor="type-filter" className="sr-only">
              Story category
            </label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(event) => onTypeFilterChange(event.target.value)}
            >
              <option value="all">All stories</option>
              <option value="land">Land spirits</option>
              <option value="sea">Sea creatures</option>
              <option value="community">Community tales</option>
            </select>

            <label
              className="saved-toggle"
              title={
                canWrite
                  ? 'Show the stories you saved'
                  : 'Sign in to filter your saved stories'
              }
            >
              <input
                id="saved-filter"
                type="checkbox"
                checked={canWrite && savedOnly}
                onChange={(event) => onSavedOnlyChange(event.target.checked)}
              />
              <span>Saved</span>
            </label>
          </div>

          <div className="result-row">
            <span id="result-count" aria-live="polite">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'} to discover
            </span>
            <span className="small-ornament" aria-hidden="true">
              ✧
            </span>
          </div>

          {dataError && (
            <button
              id="retry-data"
              className="text-button"
              type="button"
              onClick={onRetryData}
            >
              Try loading stories again
            </button>
          )}
        </div>

        <div id="story-list" className="story-list" aria-label="Stories">
          {stories.length === 0 ? (
            <p className="empty-state">
              No stories match. Try another search or change your filters.
            </p>
          ) : (
            stories.map((myth) => {
              const isSaved = bookmarks.has(myth.id);
              const isSelected = selectedId === myth.id;
              const excerpt =
                myth.story.length > 95 ? `${myth.story.slice(0, 95).trim()}…` : myth.story;

              return (
                <button
                  key={myth.id}
                  type="button"
                  className={`story-card${isSelected ? ' is-selected' : ''}`}
                  data-id={myth.id}
                  aria-pressed={String(isSelected)}
                  aria-label={`Read ${myth.title}${isSaved ? ', saved' : ''}`}
                  onClick={() => onSelectStory(myth)}
                >
                  {!myth.community && myth.marker && (
                    <img className="story-icon" src={myth.marker} alt="" loading="lazy" />
                  )}
                  {myth.community && myth.imageUrl && (
                    <img
                      className="story-icon story-icon-photo"
                      src={myth.imageUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <span className="story-card-heading">
                    {myth.title}
                    {isSaved && <span className="saved-mark"> ★</span>}
                  </span>
                  <span className="story-meta">
                    {kindLabel(myth)}
                    {myth.community ? ' · Community' : ' · Folklore'}
                  </span>
                  <span className="story-excerpt">{excerpt}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="sidebar-footer">
          <span className="live-dot" />
          <span id="status-badge">
            {totalCount} {totalCount === 1 ? 'story' : 'stories'}
          </span>
          <button
            id="help-btn"
            type="button"
            className="help-button"
            aria-label="How to use Myths Map"
            onClick={onOpenHelp}
          >
            ?
          </button>
        </div>
      </aside>
    </>
  );
}
