import { useCallback, useEffect, useState } from 'react';
import {
  createComment,
  deleteComment,
  listStoryComments,
  togglePinComment,
  updateComment,
} from '../services/api.js';
import { isBackendReady } from '../services/firebase.js';
import { dateTimeLabel, roleLabel } from '../utils/format.js';

const COOLDOWN_SECONDS = 10;
const GUEST_NAME_KEY = 'myths-map-guest-name';
const MAX_COMMENT_LENGTH = 1000;

function readSavedGuestName() {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) || 'Guest Explorer';
  } catch {
    return 'Guest Explorer';
  }
}

export function DiscussionTab({
  storyId,
  user,
  onCountChange,
  onRequireAuth,
  onToast,
}) {
  const [comments, setComments] = useState([]);
  const [repliesByParent, setRepliesByParent] = useState({});
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Top-level composer
  const [guestName, setGuestName] = useState(readSavedGuestName);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Inline reply state
  const [replyTargetId, setReplyTargetId] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const loadInitial = useCallback(async () => {
    if (!storyId || !isBackendReady) {
      setComments([]);
      setRepliesByParent({});
      setHasMore(false);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const page = await listStoryComments(storyId, { pageSize: 20 });
      setComments(page.comments);
      setRepliesByParent(page.repliesByParent);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err.message || 'Could not load discussion.');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    setReplyTargetId(null);
    setEditingId(null);
    setBody('');
    setReplyBody('');
    loadInitial();
  }, [loadInitial]);

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listStoryComments(storyId, { pageSize: 20, cursor: nextCursor });
      setComments((prev) => [...prev, ...page.comments]);
      setRepliesByParent((prev) => {
        const merged = { ...prev };
        for (const [parentId, items] of Object.entries(page.repliesByParent)) {
          merged[parentId] = [...(merged[parentId] || []), ...items];
        }
        return merged;
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      onToast?.(err.message || 'Could not load more comments.');
    } finally {
      setLoadingMore(false);
    }
  };

  const persistGuestName = (value) => {
    setGuestName(value);
    try {
      localStorage.setItem(GUEST_NAME_KEY, value);
    } catch {
      // Optional preference
    }
  };

  const handlePostTopLevel = async (event) => {
    event.preventDefault();
    if (!user?.uid) {
      onRequireAuth?.('Continue as a Guest or sign in to post in the discussion.');
      return;
    }
    if (cooldown > 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await createComment({
        storyId,
        parentId: null,
        user,
        authorName: user.role === 'guest' ? guestName : user.name,
        body,
      });
      setComments((prev) => {
        const pinned = prev.filter((c) => c.pinned);
        const regular = prev.filter((c) => !c.pinned);
        return [...pinned, created, ...regular];
      });
      setBody('');
      setCooldown(COOLDOWN_SECONDS);
      onCountChange?.(1);
      onToast?.('Comment posted to the discussion.');
    } catch (err) {
      setError(err.message || 'Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostReply = async (event, parentId) => {
    event.preventDefault();
    if (!user?.uid) {
      onRequireAuth?.('Continue as a Guest or sign in to reply.');
      return;
    }
    if (cooldown > 0 || replySubmitting) return;
    setReplySubmitting(true);
    setError('');
    try {
      const created = await createComment({
        storyId,
        parentId,
        user,
        authorName: user.role === 'guest' ? guestName : user.name,
        body: replyBody,
      });
      setRepliesByParent((prev) => ({
        ...prev,
        [parentId]: [...(prev[parentId] || []), created],
      }));
      setReplyBody('');
      setReplyTargetId(null);
      setCooldown(COOLDOWN_SECONDS);
      onCountChange?.(1);
      onToast?.('Reply posted.');
    } catch (err) {
      setError(err.message || 'Could not post reply.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleSaveEdit = async (event, comment) => {
    event.preventDefault();
    if (editSubmitting) return;
    setEditSubmitting(true);
    setError('');
    try {
      const trimmed = editBody.trim();
      await updateComment({ storyId, commentId: comment.id, body: trimmed });
      const now = new Date().toISOString();
      if (!comment.parentId) {
        setComments((prev) =>
          prev.map((c) => (c.id === comment.id ? { ...c, body: trimmed, updatedAt: now } : c))
        );
      } else {
        setRepliesByParent((prev) => ({
          ...prev,
          [comment.parentId]: (prev[comment.parentId] || []).map((r) =>
            r.id === comment.id ? { ...r, body: trimmed, updatedAt: now } : r
          ),
        }));
      }
      setEditingId(null);
      setEditBody('');
      onToast?.('Comment updated.');
    } catch (err) {
      setError(err.message || 'Could not update comment.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleTogglePin = async (comment) => {
    if (!isAdmin) return;
    const nextPinned = !comment.pinned;
    try {
      await togglePinComment({ storyId, commentId: comment.id, pinned: nextPinned });
      setComments((prev) => {
        const updated = prev.map((c) =>
          c.id === comment.id ? { ...c, pinned: nextPinned } : c
        );
        return updated.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
      });
      onToast?.(nextPinned ? 'Comment pinned to top.' : 'Comment unpinned.');
    } catch (err) {
      onToast?.(err.message || 'Could not update pin state.');
    }
  };

  const handleDelete = async (comment) => {
    const isTopLevel = !comment.parentId;
    const childCount = isTopLevel ? (repliesByParent[comment.id]?.length || 0) : 0;
    const prompt = isTopLevel && childCount > 0 && isAdmin
      ? `Delete this comment and its ${childCount} ${childCount === 1 ? 'reply' : 'replies'}?`
      : 'Delete this comment?';
    if (!window.confirm(prompt)) return;

    try {
      await deleteComment({
        storyId,
        commentId: comment.id,
        isTopLevel,
        isAdmin,
        currentUid: user?.uid || '',
      });
      if (isTopLevel) {
        const removedReplies = isAdmin
          ? childCount
          : (repliesByParent[comment.id] || []).filter((r) => r.authorUid === user?.uid).length;
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
        setRepliesByParent((prev) => {
          const next = { ...prev };
          delete next[comment.id];
          return next;
        });
        onCountChange?.(-(1 + removedReplies));
      } else {
        setRepliesByParent((prev) => ({
          ...prev,
          [comment.parentId]: (prev[comment.parentId] || []).filter((r) => r.id !== comment.id),
        }));
        onCountChange?.(-1);
      }
      onToast?.('Comment deleted.');
    } catch (err) {
      onToast?.(err.message || 'Could not delete comment.');
    }
  };

  if (!isBackendReady) {
    return (
      <div className="reader-tab-section">
        <p className="empty-state">
          Community discussions require Cloud Firestore. Add your Firebase Spark project keys in{' '}
          <code>.env</code> to enable live threads.
        </p>
      </div>
    );
  }

  return (
    <div className="reader-tab-section">
      {user?.uid ? (
        <form className="thread-composer" onSubmit={handlePostTopLevel}>
          {user.role === 'guest' && (
            <div className="guest-nickname-row">
              <label htmlFor="guest-comment-name">Guest nickname</label>
              <input
                id="guest-comment-name"
                type="text"
                minLength={2}
                maxLength={40}
                value={guestName}
                onChange={(event) => persistGuestName(event.target.value)}
                placeholder="Guest Explorer"
                required
              />
            </div>
          )}
          <div className="label-row">
            <label htmlFor="new-comment-body">Add to the discussion</label>
            <span>
              {body.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            id="new-comment-body"
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share a local memory, sighting, or regional detail about this creature…"
            required
          />
          <div className="composer-actions">
            <span className="composer-role-hint">
              Posting as <strong>{user.role === 'guest' ? guestName.trim() || 'Guest Explorer' : user.name}</strong>{' '}
              <span className={`role-pill role-${user.role}`}>{roleLabel(user.role)}</span>
            </span>
            <button
              type="submit"
              className="accent-button"
              disabled={submitting || cooldown > 0 || body.trim().length < 1}
            >
              {submitting
                ? 'Posting…'
                : cooldown > 0
                ? `Wait ${cooldown}s`
                : 'Post comment'}
            </button>
          </div>
        </form>
      ) : (
        <div className="auth-prompt-card">
          <p>Join the conversation — even Guests can post comments and replies.</p>
          <button
            type="button"
            className="accent-button"
            onClick={() => onRequireAuth?.('Continue as a Guest or sign in to join discussions.')}
          >
            Sign in or continue as Guest
          </button>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="empty-state">Loading discussion…</p>
      ) : comments.length === 0 ? (
        <p className="empty-state">
          No comments yet. Start the thread with your thoughts or local folklore variants.
        </p>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => {
            const replies = repliesByParent[comment.id] || [];
            const isAuthor = Boolean(user?.uid && comment.authorUid === user.uid);
            const isEditing = editingId === comment.id;

            return (
              <article
                key={comment.id}
                className={`comment-card${comment.pinned ? ' is-pinned' : ''}`}
              >
                <header className="comment-header">
                  <div className="comment-author-line">
                    <strong>{comment.authorName}</strong>
                    <span className={`role-pill role-${comment.authorRole}`}>
                      {roleLabel(comment.authorRole)}
                    </span>
                    {comment.pinned && <span className="badge pinned-badge">Pinned</span>}
                  </div>
                  <time className="comment-time">{dateTimeLabel(comment.createdAt)}</time>
                </header>

                {isEditing ? (
                  <form className="inline-edit-form" onSubmit={(e) => handleSaveEdit(e, comment)}>
                    <textarea
                      rows={3}
                      maxLength={MAX_COMMENT_LENGTH}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      required
                    />
                    <div className="inline-actions">
                      <span className="char-hint">
                        {editBody.length} / {MAX_COMMENT_LENGTH}
                      </span>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="accent-button"
                        disabled={editSubmitting || editBody.trim().length < 1}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="comment-body">{comment.body}</p>
                )}

                <div className="comment-actions">
                  {user?.uid && (
                    <button
                      type="button"
                      className="link-action"
                      onClick={() => {
                        setReplyTargetId(replyTargetId === comment.id ? null : comment.id);
                        setReplyBody('');
                      }}
                    >
                      {replyTargetId === comment.id ? 'Cancel reply' : 'Reply'}
                    </button>
                  )}
                  {isAuthor && !isEditing && (
                    <button
                      type="button"
                      className="link-action"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditBody(comment.body);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="link-action"
                      onClick={() => handleTogglePin(comment)}
                    >
                      {comment.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {(isAuthor || isAdmin) && (
                    <button
                      type="button"
                      className="link-action remove-record"
                      onClick={() => handleDelete(comment)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {replyTargetId === comment.id && (
                  <form
                    className="reply-composer"
                    onSubmit={(e) => handlePostReply(e, comment.id)}
                  >
                    <div className="label-row">
                      <label htmlFor={`reply-input-${comment.id}`}>
                        Reply to {comment.authorName}
                      </label>
                      <span>
                        {replyBody.length} / {MAX_COMMENT_LENGTH}
                      </span>
                    </div>
                    <textarea
                      id={`reply-input-${comment.id}`}
                      rows={2}
                      maxLength={MAX_COMMENT_LENGTH}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write a reply…"
                      required
                    />
                    <div className="inline-actions">
                      <button type="button" onClick={() => setReplyTargetId(null)}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="accent-button"
                        disabled={replySubmitting || cooldown > 0 || replyBody.trim().length < 1}
                      >
                        {replySubmitting
                          ? 'Replying…'
                          : cooldown > 0
                          ? `Wait ${cooldown}s`
                          : 'Post reply'}
                      </button>
                    </div>
                  </form>
                )}

                {replies.length > 0 && (
                  <div className="reply-list" aria-label="Replies">
                    {replies.map((reply) => {
                      const isReplyAuthor = Boolean(user?.uid && reply.authorUid === user.uid);
                      const isReplyEditing = editingId === reply.id;
                      return (
                        <div key={reply.id} className="reply-card">
                          <header className="comment-header">
                            <div className="comment-author-line">
                              <strong>{reply.authorName}</strong>
                              <span className={`role-pill role-${reply.authorRole}`}>
                                {roleLabel(reply.authorRole)}
                              </span>
                            </div>
                            <time className="comment-time">{dateTimeLabel(reply.createdAt)}</time>
                          </header>

                          {isReplyEditing ? (
                            <form
                              className="inline-edit-form"
                              onSubmit={(e) => handleSaveEdit(e, reply)}
                            >
                              <textarea
                                rows={2}
                                maxLength={MAX_COMMENT_LENGTH}
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                required
                              />
                              <div className="inline-actions">
                                <span className="char-hint">
                                  {editBody.length} / {MAX_COMMENT_LENGTH}
                                </span>
                                <button type="button" onClick={() => setEditingId(null)}>
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="accent-button"
                                  disabled={editSubmitting || editBody.trim().length < 1}
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          ) : (
                            <p className="comment-body">{reply.body}</p>
                          )}

                          {(isReplyAuthor || isAdmin) && (
                            <div className="comment-actions">
                              {isReplyAuthor && !isReplyEditing && (
                                <button
                                  type="button"
                                  className="link-action"
                                  onClick={() => {
                                    setEditingId(reply.id);
                                    setEditBody(reply.body);
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                className="link-action remove-record"
                                onClick={() => handleDelete(reply)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}

          {hasMore && (
            <button
              type="button"
              className="full-button load-more-btn"
              disabled={loadingMore}
              onClick={handleLoadMore}
            >
              {loadingMore ? 'Loading more…' : 'Load more comments'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
