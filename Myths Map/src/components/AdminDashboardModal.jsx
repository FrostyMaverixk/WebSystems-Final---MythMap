import { useCallback, useEffect, useMemo, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap.js';
import {
  deleteAccountProfile,
  deleteMyth,
  listAccountsForAdmin,
  listAllMythsForAdmin,
  reviewMyth,
} from '../services/api.js';
import {
  coordinatesLabel,
  dateLabel,
  dateTimeLabel,
  kindLabel,
  statusLabel,
} from '../utils/format.js';

export function AdminDashboardModal({ isOpen, user, onDataChanged, onToast, onClose }) {
  const [section, setSection] = useState('stories'); // 'stories' | 'accounts'
  const [myths, setMyths] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const containerRef = useModalFocusTrap(isOpen, onClose);

  const loadAll = useCallback(async () => {
    if (!isOpen || user?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const allMyths = await listAllMythsForAdmin();
      const allAccounts = await listAccountsForAdmin(allMyths);
      setMyths(allMyths);
      setAccounts(allAccounts);
      setNotes((prev) => {
        const next = { ...prev };
        for (const myth of allMyths) {
          if (next[myth.id] === undefined) next[myth.id] = myth.reviewNote || '';
        }
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, user?.role]);

  useEffect(() => {
    if (isOpen) {
      setSection('stories');
      loadAll();
    }
  }, [isOpen, loadAll]);

  const counts = useMemo(() => {
    const c = { pending: 0, needs_revision: 0, approved: 0, rejected: 0 };
    for (const item of myths) {
      if (Object.hasOwn(c, item.status)) c[item.status]++;
    }
    return c;
  }, [myths]);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.uid, a])),
    [accounts]
  );

  const hasRemovedOwners = useMemo(
    () => myths.some((m) => m.ownerId && !accountById.has(m.ownerId)),
    [myths, accountById]
  );

  const filteredMyths = useMemo(() => {
    return myths.filter((myth) => {
      if (statusFilter !== 'all' && myth.status !== statusFilter) return false;
      if (!ownerFilter) return true;
      if (ownerFilter === 'removed') return !accountById.has(myth.ownerId);
      return myth.ownerId === ownerFilter;
    });
  }, [myths, statusFilter, ownerFilter, accountById]);

  if (!isOpen) return null;

  const handleDecision = async (myth, nextStatus) => {
    const note = (notes[myth.id] ?? myth.reviewNote ?? '').trim();
    if (nextStatus === 'needs_revision' && !note) {
      onToast?.('Add a review note explaining what the contributor should revise.');
      return;
    }
    setBusyId(myth.id);
    try {
      await reviewMyth({
        mythId: myth.id,
        status: nextStatus,
        reviewNote: note,
        adminUser: user,
      });
      const feedbackMsg =
        nextStatus === 'approved'
          ? 'Story approved and added to the map.'
          : nextStatus === 'needs_revision'
          ? 'Marked as needs revision. The contributor can edit and resubmit.'
          : 'Story declined. The contributor can see your review note.';
      onToast?.(feedbackMsg);
      await Promise.all([loadAll(), onDataChanged?.()]);
    } catch (err) {
      onToast?.(err?.message || 'Could not update submission.');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteMyth = async (myth) => {
    if (
      !window.confirm(
        `Permanently remove “${myth.title}” from the atlas and submission history?`
      )
    ) {
      return;
    }
    setBusyId(myth.id);
    try {
      await deleteMyth(myth.id);
      onToast?.('Submission removed.');
      await Promise.all([loadAll(), onDataChanged?.()]);
    } catch (err) {
      onToast?.(err?.message || 'Could not remove submission.');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteAccount = async (account) => {
    if (
      !window.confirm(
        `Remove profile record for ${account.name} (${account.email || account.uid})? Their submitted myths will remain preserved for moderation.`
      )
    ) {
      return;
    }
    setBusyId(account.uid);
    try {
      await deleteAccountProfile(account.uid, user.uid);
      onToast?.('Account profile removed. Submitted myths preserved.');
      await loadAll();
    } catch (err) {
      onToast?.(err?.message || 'Could not remove account.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div
      id="admin-panel"
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-heading"
      ref={containerRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="panel admin-panel-content">
        <button
          id="close-admin"
          className="close-button"
          type="button"
          aria-label="Close dashboard"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">THE KEEPER’S DESK</p>
        <h2 id="admin-heading">Dashboard</h2>

        <div className="dashboard-nav" aria-label="Dashboard sections">
          <button
            type="button"
            id="dashboard-stories"
            aria-controls="dashboard-review"
            aria-pressed={String(section === 'stories')}
            onClick={() => setSection('stories')}
          >
            Submissions
          </button>
          <button
            type="button"
            id="dashboard-users"
            aria-controls="dashboard-accounts"
            aria-pressed={String(section === 'accounts')}
            onClick={() => setSection('accounts')}
          >
            Accounts ({accounts.length})
          </button>
        </div>

        {section === 'stories' ? (
          <section id="dashboard-review" aria-label="Submission review">
            <div id="admin-stats" className="admin-stats">
              <div>
                <strong>{counts.pending}</strong>
                <span>Pending</span>
              </div>
              <div>
                <strong>{counts.needs_revision}</strong>
                <span>Needs revision</span>
              </div>
              <div>
                <strong>{counts.approved}</strong>
                <span>Published</span>
              </div>
              <div>
                <strong>{counts.rejected}</strong>
                <span>Declined</span>
              </div>
            </div>

            <div className="dashboard-filters">
              <label>
                Show submissions
                <select
                  id="admin-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="pending">Awaiting review</option>
                  <option value="needs_revision">Needs revision</option>
                  <option value="approved">Published</option>
                  <option value="rejected">Declined</option>
                  <option value="all">All statuses</option>
                </select>
              </label>
              <label>
                Submitted by
                <select
                  id="admin-owner"
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.uid} value={account.uid}>
                      {account.uid === user?.uid
                        ? 'My submissions'
                        : `${account.name}${account.email ? ` · ${account.email}` : ''}`}
                    </option>
                  ))}
                  {hasRemovedOwners && <option value="removed">Removed accounts</option>}
                </select>
              </label>
            </div>

            <div id="pending-list" className="review-list">
              {loading ? (
                <p className="empty-state">Loading submissions…</p>
              ) : error ? (
                <div className="empty-state">
                  <p>{error}</p>
                  <button type="button" onClick={loadAll}>
                    Try again
                  </button>
                </div>
              ) : filteredMyths.length === 0 ? (
                <p className="empty-state">
                  {statusFilter === 'pending'
                    ? 'All caught up. New stories will appear here for review.'
                    : 'No submissions in this category yet.'}
                </p>
              ) : (
                filteredMyths.map((myth) => {
                  const owner = accountById.get(myth.ownerId);
                  const isBusy = busyId === myth.id;
                  const noteValue = notes[myth.id] ?? myth.reviewNote ?? '';

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
                          title="Inspect full uploaded image"
                        >
                          <img
                            className="submission-thumb"
                            src={myth.imageUrl}
                            alt={`Uploaded preview for ${myth.title}`}
                          />
                        </a>
                      )}

                      <p className="review-story">{myth.story}</p>
                      <p className="story-meta">
                        {myth.region ? `${myth.region} · ` : ''}
                        {coordinatesLabel(myth)}
                      </p>
                      {myth.source && <p className="story-meta">Source: {myth.source}</p>}
                      <p className="story-meta">
                        {owner
                          ? `Account · ${owner.name}${owner.email ? ` (${owner.email})` : ''}`
                          : 'Removed account'}
                      </p>

                      {myth.feedbackHistory?.length > 0 && (
                        <div className="feedback-history">
                          <p className="feedback-history-title">Moderation history</p>
                          <ol className="feedback-timeline">
                            {myth.feedbackHistory.map((entry, idx) => (
                              <li key={`${myth.id}-adm-hist-${idx}`}>
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

                      <label className="review-label">
                        Review note (max 500 chars)
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={noteValue}
                          placeholder="Context, requested edits, or reason for the contributor"
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [myth.id]: e.target.value }))
                          }
                        />
                      </label>

                      <div className="record-actions">
                        <button
                          type="button"
                          className="accent-button"
                          disabled={isBusy || myth.status === 'approved'}
                          onClick={() => handleDecision(myth, 'approved')}
                        >
                          {myth.status === 'approved' ? 'Approved' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(myth, 'needs_revision')}
                        >
                          Request revision
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || myth.status === 'rejected'}
                          onClick={() => handleDecision(myth, 'rejected')}
                        >
                          {myth.status === 'rejected' ? 'Rejected' : 'Reject'}
                        </button>
                        <button
                          type="button"
                          className="remove-record"
                          disabled={isBusy}
                          onClick={() => handleDeleteMyth(myth)}
                        >
                          Remove submission
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : (
          <section id="dashboard-accounts" aria-label="Account directory">
            <div id="admin-accounts" className="review-list">
              {loading ? (
                <p className="empty-state">Loading accounts…</p>
              ) : error ? (
                <div className="empty-state">
                  <p>{error}</p>
                  <button type="button" onClick={loadAll}>
                    Try again
                  </button>
                </div>
              ) : accounts.length === 0 ? (
                <p className="empty-state">No registered accounts found yet.</p>
              ) : (
                accounts.map((account) => (
                  <article key={account.uid} className="review-card">
                    <div className="story-card-heading">
                      <h3>{account.name}</h3>
                      <span className={`badge ${account.role === 'admin' ? 'approved' : ''}`}>
                        {account.role === 'admin' ? 'Administrator' : 'Explorer'}
                      </span>
                    </div>
                    <p className="story-meta">
                      {account.email || account.uid}
                      {account.lastActiveAt ? ` · Active ${dateLabel(account.lastActiveAt)}` : ''}
                    </p>
                    <p>
                      {account.submissions}{' '}
                      {account.submissions === 1 ? 'submission' : 'submissions'}
                    </p>
                    {account.uid === user?.uid ? (
                      <p className="story-meta">Your account</p>
                    ) : (
                      <div className="record-actions">
                        <button
                          type="button"
                          className="remove-record"
                          disabled={busyId === account.uid}
                          onClick={() => handleDeleteAccount(account)}
                        >
                          Remove account
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
