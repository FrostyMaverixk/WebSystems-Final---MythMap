export function AppHeader({
  user,
  busy,
  onSignOut,
  onOpenAuth,
}) {
  const roleCopy =
    user?.role === 'user'
      ? 'Explorer'
      : user?.role === 'admin'
      ? 'Administrator'
      : 'Guest mode';

  return (
    <header className="app-header">
      <a href="/" className="brand" aria-label="Myths Map home" onClick={(e) => e.preventDefault()}>
        <span className="brand-symbol" aria-hidden="true">✧</span>
        <span>
          <strong>Myths Map</strong>
          <small>TALES OF THE PHILIPPINE ISLES</small>
        </span>
      </a>

      <div className="header-center">
        <span className="live-dot" /> A living atlas of folklore
      </div>

      <nav className="account-controls" aria-label="Account">
        <span className="account-copy">
          <strong id="account-name">{user?.name || 'Guest'}</strong>
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
