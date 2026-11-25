import { useModalFocusTrap } from '../hooks/useModalFocusTrap.js';

export function HelpModal({ isOpen, onClose }) {
  const containerRef = useModalFocusTrap(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      id="help-panel"
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-heading"
      ref={containerRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="panel">
        <button
          id="close-help"
          className="close-button"
          type="button"
          aria-label="Close help"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">A FEW NOTES FOR THE JOURNEY</p>
        <h2 id="help-heading">Explore the atlas</h2>
        <ul className="help-list">
          <li>
            <strong>Find a tale.</strong> Search the collection or filter by land, sea, and community
            stories. Select a creature to read its story, view live local weather and cultural
            context, or choose <em>Enter 3D view</em> when a 3D habitat model is available.
          </li>
          <li>
            <strong>Explore the map.</strong> Drag to pan; scroll or pinch to zoom. With the map
            focused, use arrow keys, + / −, and Home to reset. Toggle <em>Effects</em> to switch
            ocean wakes, drifting clouds, and camera pitch on or off.
          </li>
          <li>
            <strong>Join discussions &amp; reviews.</strong> Everyone — including Guests — can post
            comments and replies in each creature’s Discussion tab. Signed-in Explorers and Admins
            can also rate stories and submit categorized feedback in the Reviews tab.
          </li>
          <li>
            <strong>Share &amp; revise myths.</strong> Sign in as an Explorer or Admin, select{' '}
            <em>Share a myth</em>, and drop a pin on the Philippines to auto-fill the region and
            optionally attach an image. Track review notes in <em>My submissions</em> and use{' '}
            <em>Edit &amp; Resubmit</em> if revisions are requested.
          </li>
          <li>
            <strong>Keep your favorites.</strong> Signed-in accounts can bookmark stories from the
            reading panel and filter by <em>Saved</em>.
          </li>
        </ul>
        <p className="help-footnote">
          Map locations are illustrative. Folklore varies across communities; credit your sources
          when sharing.
          <br />
          Live weather &amp; marine swells:{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Open-Meteo.com
          </a>{' '}
          (CC BY 4.0). Sunrise &amp; sunset times:{' '}
          <a href="https://sunrise-sunset.org/" target="_blank" rel="noopener noreferrer">
            Sunrise-Sunset.org
          </a>
          . Cultural summaries &amp; archival images via{' '}
          <a href="https://en.wikipedia.org/" target="_blank" rel="noopener noreferrer">
            Wikipedia
          </a>{' '}
          &amp;{' '}
          <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer">
            Wikimedia Commons
          </a>{' '}
          (CC BY-SA 4.0). Folklore literature via{' '}
          <a href="https://openlibrary.org/" target="_blank" rel="noopener noreferrer">
            Open Library
          </a>
          . Relief tiles: Mapzen, USGS, NOAA.
        </p>
      </section>
    </div>
  );
}
