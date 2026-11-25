export function AppHeader({
  user,
  busy,
  isDemoMode,
  onSignOut,
  onOpenAuth,
  onQuickDemoRole,
  onResetDemo,
}) {
  const roleCopy =
    user?.role === 'user'
      ? 'Explorer'
      : user?.role === 'admin'
      ? 'Administrator'
      : user?.role === 'guest'
      ? 'Guest'
      : 'Choose your path';

  return (
    <header className="app-header">
      <a href="/" className="brand" aria-label="Myths Map home" onClick={(e) => e.preventDefault()}>
        <span className="brand-symbol" aria-hidden="true">✧</span>
        <span>
          <strong>Myths Map</strong>
          <small>TALES OF THE PHILIPPINE ISLES</small>
        </span>
      </a>

      {isDemoMode ? (
        <div className="demo-switcher" role="group" aria-label="Local demo role switcher">
          <span className="demo-switcher-tag">DEMO</span>
          <button
            type="button"
            disabled={busy}
            aria-pressed={String(user?.role === 'admin')}
            onClick={() => onQuickDemoRole?.('admin')}
          >
            Admin
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={String(user?.role === 'user')}
            onClick={() => onQuickDemoRole?.('user')}
          >
            Explorer
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={String(user?.role === 'guest')}
            onClick={() => onQuickDemoRole?.('guest')}
          >
            Guest
          </button>
          <button
            type="button"
            className="demo-reset-btn"
            disabled={busy}
            title="Reset local demo submissions, comments, and reviews"
            onClick={() => onResetDemo?.()}
          >
            Reset
          </button>
        </div>
      ) : (
        <div className="header-center">
          <span className="live-dot" /> A living atlas of folklore
        </div>
      )}

      <nav className="account-controls" aria-label="Account">
        <span className="account-copy">
          <strong id="account-name">{user?.name || 'Welcome, explorer'}</strong>
          <span id="account-role">{roleCopy}</span>
        </span>
        {user ? (
          user.role === 'guest' ? (
            <button
              id="logout-btn"
              className="quiet-button"
              type="button"
              disabled={busy}
              onClick={onOpenAuth}
            >
              Sign in
            </button>
          ) : (
            <button
              id="logout-btn"
              className="quiet-button"
              type="button"
              disabled={busy}
              onClick={onSignOut}
            >
              Sign out
            </button>
          )
        ) : (
          <button
            id="logout-btn"
            className="quiet-button"
            type="button"
            disabled={busy}
            onClick={onOpenAuth}
          >
            Sign in
          </button>
        )}
      </nav>
    </header>
  );
}
