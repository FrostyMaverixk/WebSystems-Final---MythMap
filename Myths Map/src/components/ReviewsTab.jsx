import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  REVIEW_CATEGORIES,
  deleteReview,
  listStoryReviews,
  saveReview,
  summarizeReviews,
  toggleHighlightReview,
} from '../services/api.js';
import { firebaseReady } from '../services/firebase.js';
import { dateLabel, roleLabel } from '../utils/format.js';

const MAX_FEEDBACK_LENGTH = 1000;

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Admin Feedback' },
  { id: 'regional_variant', label: 'Regional Variants' },
  { id: 'correction', label: 'Corrections' },
];

const CATEGORY_LABELS = Object.fromEntries(REVIEW_CATEGORIES.map((c) => [c.value, c.label]));

export function ReviewsTab({
  storyId,
  user,
  initialReviews = null,
  onSummaryChange,
  onReviewsChange,
  onRequireAuth,
  onToast,
}) {
  const [reviews, setReviews] = useState(initialReviews || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterChip, setFilterChip] = useState('all');

  // Own review form
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState('appreciation');
  const [feedback, setFeedback] = useState('');
  const [editingOwn, setEditingOwn] = useState(false);
  const [saving, setSaving] = useState(false);

  const canWrite = Boolean(user && !user.isAnonymous && ['user', 'admin'].includes(user.role));
  const isAdmin = user?.role === 'admin';

  const loadReviews = useCallback(async () => {
    if (!storyId || !firebaseReady) {
      setReviews([]);
      onSummaryChange?.({ average: 0, count: 0 });
      return;
    }
    if (Array.isArray(initialReviews)) {
      setReviews(initialReviews);
      const s = summarizeReviews(initialReviews);
      onSummaryChange?.({ average: s.average, count: s.count });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await listStoryReviews(storyId);
      setReviews(result.reviews);
      onReviewsChange?.(result.reviews);
      onSummaryChange?.({ average: result.average, count: result.count });
    } catch (err) {
      setError(err.message || 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [storyId, initialReviews, onSummaryChange, onReviewsChange]);

  useEffect(() => {
    setFilterChip('all');
    setEditingOwn(false);
    loadReviews();
  }, [loadReviews]);

  const ownReview = useMemo(
    () => (canWrite ? reviews.find((r) => r.authorUid === user.uid) || null : null),
    [canWrite, reviews, user?.uid]
  );

  // Sync form fields when switching stories or opening edit mode
  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating);
      setCategory(ownReview.category);
      setFeedback(ownReview.feedback);
    } else {
      setRating(5);
      setCategory('appreciation');
      setFeedback('');
    }
  }, [ownReview, storyId]);

  const summary = useMemo(() => summarizeReviews(reviews), [reviews]);

  const visibleReviews = useMemo(() => {
    const filtered = reviews.filter((review) => {
      if (filterChip === 'admin') return review.authorRole === 'admin';
      if (filterChip === 'regional_variant') return review.category === 'regional_variant';
      if (filterChip === 'correction') return review.category === 'correction';
      return true;
    });
    // Sort Admin & Highlighted reviews to top while keeping newest first within tiers.
    return [...filtered].sort((a, b) => {
      const rankA = (a.authorRole === 'admin' ? 2 : 0) + (a.highlighted ? 1 : 0);
      const rankB = (b.authorRole === 'admin' ? 2 : 0) + (b.highlighted ? 1 : 0);
      if (rankA !== rankB) return rankB - rankA;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [reviews, filterChip]);

  const updateList = (nextReviews) => {
    setReviews(nextReviews);
    onReviewsChange?.(nextReviews);
    const nextSummary = summarizeReviews(nextReviews);
    onSummaryChange?.({ average: nextSummary.average, count: nextSummary.count });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canWrite || saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveReview({
        storyId,
        user,
        rating,
        category,
        feedback,
        existingReview: ownReview,
      });
      const next = ownReview
        ? reviews.map((r) => (r.authorUid === user.uid ? saved : r))
        : [saved, ...reviews];
      updateList(next);
      setEditingOwn(false);
      onToast?.(ownReview ? 'Your review was updated.' : 'Thank you — your review is published.');
    } catch (err) {
      setError(err.message || 'Could not save review.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (review) => {
    const label = review.authorUid === user?.uid ? 'Delete your review?' : `Remove review by ${review.authorName}?`;
    if (!window.confirm(label)) return;
    try {
      await deleteReview({ storyId, reviewUid: review.authorUid });
      updateList(reviews.filter((r) => r.authorUid !== review.authorUid));
      setEditingOwn(false);
      onToast?.('Review removed.');
    } catch (err) {
      onToast?.(err.message || 'Could not remove review.');
    }
  };

  const handleToggleHighlight = async (review) => {
    if (!isAdmin) return;
    const nextVal = !review.highlighted;
    try {
      await toggleHighlightReview({
        storyId,
        reviewUid: review.authorUid,
        highlighted: nextVal,
      });
      updateList(
        reviews.map((r) =>
          r.authorUid === review.authorUid ? { ...r, highlighted: nextVal } : r
        )
      );
      onToast?.(nextVal ? 'Feedback highlighted.' : 'Highlight removed.');
    } catch (err) {
      onToast?.(err.message || 'Could not update highlight.');
    }
  };

  if (!firebaseReady) {
    return (
      <div className="reader-tab-section">
        <p className="empty-state">
          Myth reviews require Cloud Firestore. Add your Firebase Spark project keys in{' '}
          <code>.env</code> to enable ratings and feedback.
        </p>
      </div>
    );
  }

  return (
    <div className="reader-tab-section">
      <div className="review-summary-header">
        <div className="review-score-block">
          <strong className="review-avg">
            {summary.count > 0 ? `${summary.average.toFixed(1)} ★` : 'No ratings yet'}
          </strong>
          <span className="review-count">
            {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        <div className="filter-chips" role="group" aria-label="Filter reviews">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`filter-chip${filterChip === chip.id ? ' is-active' : ''}`}
              aria-pressed={String(filterChip === chip.id)}
              onClick={() => setFilterChip(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {!canWrite ? (
        <div className="auth-prompt-card">
          <p>Sign in as an Explorer or Administrator to rate this story and share structured feedback.</p>
          <button
            type="button"
            className="accent-button"
            onClick={() =>
              onRequireAuth?.(
                'Sign in or create an Explorer account to rate stories and submit a review.'
              )
            }
          >
            Sign in to review
          </button>
        </div>
      ) : !ownReview || editingOwn ? (
        <form className="review-form" onSubmit={handleSubmit}>
          <div className="star-selector-row">
            <span className="star-label">Your rating</span>
            <div className="star-buttons" role="radiogroup" aria-label="Rating out of 5 stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={String(rating === value)}
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                  className={`star-btn${value <= rating ? ' is-filled' : ''}`}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="review-category">Feedback category</label>
          <select
            id="review-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {REVIEW_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="label-row">
            <label htmlFor="review-feedback">Your feedback</label>
            <span>
              {feedback.length.toLocaleString()} / {MAX_FEEDBACK_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            id="review-feedback"
            rows={3}
            minLength={5}
            maxLength={MAX_FEEDBACK_LENGTH}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Share a regional variant, historical context, source reference, or appreciation…"
            required
          />

          <div className="inline-actions">
            {ownReview && (
              <button type="button" onClick={() => setEditingOwn(false)}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="accent-button"
              disabled={saving || feedback.trim().length < 5}
            >
              {saving ? 'Saving…' : ownReview ? 'Update review' : 'Submit review'}
            </button>
          </div>
        </form>
      ) : (
        <div className="own-review-banner">
          <span>
            You rated this <strong>{ownReview.rating} ★</strong> ({CATEGORY_LABELS[ownReview.category] || ownReview.category}).
          </span>
          <div className="inline-actions">
            <button type="button" onClick={() => setEditingOwn(true)}>
              Edit
            </button>
            <button
              type="button"
              className="remove-record"
              onClick={() => handleDelete(ownReview)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="empty-state">Loading reviews…</p>
      ) : visibleReviews.length === 0 ? (
        <p className="empty-state">
          {reviews.length === 0
            ? 'No reviews yet. Be the first Explorer to share feedback on this legend.'
            : 'No reviews match this filter.'}
        </p>
      ) : (
        <div className="reviews-list">
          {visibleReviews.map((review) => {
            const isOfficialAdmin = review.authorRole === 'admin';
            const isOwn = canWrite && review.authorUid === user?.uid;

            return (
              <article
                key={review.authorUid}
                className={`feedback-card${isOfficialAdmin ? ' is-admin-feedback' : ''}${
                  review.highlighted ? ' is-highlighted' : ''
                }`}
              >
                <header className="comment-header">
                  <div className="comment-author-line">
                    <strong>{review.authorName}</strong>
                    {isOfficialAdmin ? (
                      <span className="badge official-admin-badge">Official Admin Feedback</span>
                    ) : (
                      <span className={`role-pill role-${review.authorRole}`}>
                        {roleLabel(review.authorRole)}
                      </span>
                    )}
                    {review.highlighted && (
                      <span className="badge highlighted-badge">Highlighted</span>
                    )}
                  </div>
                  <span className="rating-stars" aria-label={`${review.rating} out of 5 stars`}>
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(Math.max(0, 5 - review.rating))}
                  </span>
                </header>

                <div className="feedback-meta">
                  <span className="category-tag">
                    {CATEGORY_LABELS[review.category] || review.category}
                  </span>
                  {review.createdAt && <time>{dateLabel(review.createdAt)}</time>}
                </div>

                <p className="comment-body">{review.feedback}</p>

                {(isAdmin || isOwn) && (
                  <div className="comment-actions">
                    {isOwn && (
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => setEditingOwn(true)}
                      >
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => handleToggleHighlight(review)}
                      >
                        {review.highlighted ? 'Remove highlight' : 'Highlight'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-action remove-record"
                      onClick={() => handleDelete(review)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
