import { useCallback, useEffect, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap.js';
import { listMySubmissions } from '../services/api.js';
import {
  coordinatesLabel,
  dateLabel,
  dateTimeLabel,
  kindLabel,
  statusLabel,
} from '../utils/format.js';

export function SubmissionsModal({ isOpen, user, onEditResubmit, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const containerRef = useModalFocusTrap(isOpen, onClose);

  const load = useCallback(async () => {
    if (!isOpen || !user?.uid) return;
    setLoading(true);
    setError('');
    try {
      const myths = await listMySubmissions(user.uid);
      setItems(myths);
    } catch (err) {
      setError(err?.message || 'Could not load your submissions.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isOpen) return null;

  return (
    <div
      id="submissions-panel"
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submissions-heading"
      ref={containerRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="panel">
        <button
          id="close-submissions"
          type="button"
          className="close-button"
          aria-label="Close submissions"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">YOUR CONTRIBUTIONS</p>
        <h2 id="submissions-heading">Stories you’ve shared</h2>
        <p className="panel-intro">
          Follow your tales from submission to publication, review admin feedback, and revise any
          submission needing updates.
        </p>

        <div id="submissions-list" className="review-list">
          {loading ? (
            <p className="empty-state">Loading your stories…</p>
          ) : error ? (
            <div className="empty-state">
              <p>{error}</p>
              <button type="button" onClick={load}>
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="empty-state">
              Your story starts here. Choose “Share a myth” and pin a location on the map.
            </p>
          ) : (
            items.map((myth) => {
              const canResubmit =
                myth.status === 'needs_revision' || myth.status === 'rejected';
              return (
                <article key={myth.id} className="review-card">
                  <div className="story-card-heading">
                    <h3>{myth.title}</h3>
                    <span className={`badge ${myth.status}`}>{statusLabel(myth.status)}</span>
                  </div>
                  <p className="story-meta">
                    {myth.author} · {kindLabel(myth)}
                    {myth.createdAt ? ` · ${dateLabel(myth.createdAt)}` : ''}
                  </p>
                  {myth.imageUrl && (
                    <a
                      className="submission-thumb-link"
                      href={myth.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        className="submission-thumb"
                        src={myth.imageUrl}
                        alt={`${myth.title} attached illustration`}
                      />
                    </a>
                  )}
                  <p className="review-story">{myth.story}</p>
                  <p className="story-meta">
                    {myth.region ? `${myth.region} · ` : ''}
                    {coordinatesLabel(myth)}
                  </p>
                  {myth.source && <p className="story-meta">Source: {myth.source}</p>}
                  {myth.reviewNote && (
                    <p className="review-note">
                      <strong>Latest note:</strong> {myth.reviewNote}
                    </p>
                  )}

                  {myth.feedbackHistory?.length > 0 && (
                    <div className="feedback-history">
                      <p className="feedback-history-title">Feedback timeline</p>
                      <ol className="feedback-timeline">
                        {myth.feedbackHistory.map((entry, idx) => (
                          <li key={`${myth.id}-hist-${idx}`}>
                            <div className="timeline-head">
                              <span className={`badge ${entry.status}`}>
                                {statusLabel(entry.status)}
                              </span>
                              <span>{entry.reviewerName || 'Administrator'}</span>
                              {entry.createdAt && <time>{dateTimeLabel(entry.createdAt)}</time>}
                            </div>
                            {entry.note && <p className="timeline-note">{entry.note}</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {canResubmit && (
                    <div className="record-actions">
                      <button
                        type="button"
                        className="accent-button"
                        onClick={() => onEditResubmit?.(myth)}
                      >
                        Edit &amp; Resubmit
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
