import { CREATURES } from './config.js';
import { ApiClient } from './api.js';

const byId = (id) => document.getElementById(id);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const kindLabel = (myth) => myth.type === 'sea' ? 'Sea deity' : 'Land spirit';
const coordinates = (myth) => `${Number(myth.lat).toFixed(3)}° N, ${Number(myth.lng).toFixed(3)}° E`;
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function setupUI(initialWorld, mapState) {
  const api = new ApiClient();
  let world = initialWorld;
  let user = null;
  let community = [];
  let bookmarks = new Set();
  let selected = null;
  let encounter, openingEncounter = false, disposed = false;

  async function enterEncounter() {
    if (!selected || selected.community || activeModal || openingEncounter || encounter?.dialog.open) return;
    const story = selected;
    openingEncounter = true;
    try {
      const { EncounterView } = await import('./encounter-view.js');
      if (disposed || selected?.id !== story.id || activeModal) return;
      encounter ||= new EncounterView(() => world.setEncounterOpen?.(false));
      encounter.open(story, highQuality);
      world.setEncounterOpen?.(true);
    } catch (error) {
      encounter?.close();
      console.error('Creature encounter could not open', error);
      toast('The 3D view needs WebGL. The illustrated story is still available.');
    } finally {
      openingEncounter = false;
    }
  }
  let adminItems = [];
  let accounts = [];
  let dashboardRequest = 0;
  let toastTimer;
  let sessionRevision = 0;
  let activeModal = null;
  let restoreFocus = null;
  let qualityPreference;
  try { qualityPreference = localStorage.getItem('myths-map-quality'); } catch { /* optional preference */ }
  let authBusy = false;
  let highQuality = qualityPreference ? qualityPreference === 'high' : !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const builtins = CREATURES.map((myth) => ({ ...myth, title: myth.name, author: 'Philippine folklore', community: false }));
  const allStories = () => [...builtins, ...community.map((myth) => ({ ...myth, name: myth.title, community: true }))];
  const canWrite = () => user?.role === 'user' || user?.role === 'admin';

  function setError(id, message = '') {
    byId(id).textContent = message;
    byId(id).classList.toggle('hidden', !message);
  }

  function toast(message) {
    clearTimeout(toastTimer);
    byId('toast').textContent = message;
    byId('toast').classList.remove('hidden');
    toastTimer = setTimeout(() => byId('toast').classList.add('hidden'), 6000);
  }

  function openModal(id) {
    if (activeModal && activeModal.id !== id) activeModal.classList.add('hidden');
    restoreFocus = document.activeElement;
    activeModal = byId(id);
    activeModal.classList.remove('hidden');
    activeModal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      const focusable = activeModal?.querySelector('input:not([type="hidden"]), select, textarea, button');
      focusable?.focus();
    });
  }
  function closeModal(id) {
    const overlay = byId(id);
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (activeModal === overlay) activeModal = null;
    if (restoreFocus?.isConnected && !restoreFocus.closest('.hidden')) restoreFocus.focus();
  }

  function resetActionButton() {
    const wasPlacing = mapState.placingPin;
    mapState.placingPin = false;
    byId('action-btn').textContent = '＋ Share a myth';
    byId('action-btn').classList.remove('active');
    byId('map').classList.remove('placing-pin');
    if (wasPlacing) byId('map-status').textContent = 'Drag to explore · Scroll to zoom · Select a story to discover more';
  }

  function setSession(nextUser) {
    encounter?.close();
    sessionRevision++;
    user = nextUser;
    bookmarks = new Set();
    adminItems = [];
    accounts = [];
    byId('admin-accounts').replaceChildren();
    byId('admin-owner').replaceChildren();
    byId('admin-stats').textContent = '';
    byId('pending-list').replaceChildren();
    byId('submissions-list').replaceChildren();
    resetActionButton();
    byId('account-name').textContent = user?.name || 'Welcome, explorer';
    byId('account-role').textContent = user?.role === 'user' ? 'Explorer' : user?.role === 'admin' ? 'Administrator' : 'Guest';
    byId('action-btn').classList.toggle('hidden', !canWrite());
    byId('submissions-btn').classList.toggle('hidden', user?.role !== 'user');
    byId('admin-btn').classList.toggle('hidden', user?.role !== 'admin');
    byId('logout-btn').classList.toggle('hidden', !user);
    byId('logout-btn').textContent = user?.role === 'guest' ? 'Sign in' : 'Sign out';
    if (!canWrite()) byId('saved-filter').checked = false;
    byId('saved-filter').disabled = !canWrite();
    byId('saved-filter').parentElement.title = canWrite() ? 'Show the stories you saved' : 'Sign in to save stories to your collection';
    if (selected) renderDetails(selected);
    renderStories();
    if (user) closeModal('login-screen');
    else openModal('login-screen');
  }

  function sessionExpired() {
    api.csrfToken = null;
    byId('login-password').value = '';
    for (const id of ['myth-form', 'admin-panel', 'submissions-panel', 'help-panel']) closeModal(id);
    setSession(null);
    setError('login-error', 'Your session has ended. Please sign in or continue as a guest.');
  }

  async function run(button, operation, errorId) {
    if (button) button.disabled = true;
    if (errorId) setError(errorId);
    try { return await operation(); }
    catch (error) {
      if (error.status === 401 && user && errorId !== 'login-error') sessionExpired();
      else if (errorId) {
        setError(errorId, error.message);
        if (byId(errorId).closest('.hidden')) toast(error.message);
      }
      else toast(error.message);
      return undefined;
    } finally { if (button) button.disabled = false; }
  }

  function syncWorld() {
    world.setCommunityMyths?.(community);
    world.setHighQuality?.(highQuality);
    byId('quality-toggle').textContent = highQuality ? 'Effects: on' : 'Effects: off';
    byId('quality-toggle').setAttribute('aria-pressed', String(highQuality));
  }

  function filteredStories() {
    const search = byId('search-input').value.trim().toLocaleLowerCase();
    const type = byId('type-filter').value;
    const savedOnly = byId('saved-filter').checked;
    return allStories().filter((myth) => {
      if (type === 'community' ? !myth.community : type !== 'all' && myth.type !== type) return false;
      if (savedOnly && !bookmarks.has(myth.id)) return false;
      return !search || [myth.title, myth.story, myth.author, myth.region || '', kindLabel(myth)].join(' ').toLocaleLowerCase().includes(search);
    });
  }

  function renderStories() {
    const stories = filteredStories();
    byId('result-count').textContent = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'} to discover`;
    byId('status-badge').textContent = `${allStories().length} stories`;
    const list = byId('story-list');
    list.replaceChildren();
    for (const myth of stories) {
      const card = element('button', `story-card${selected?.id === myth.id ? ' is-selected' : ''}`);
      card.type = 'button';
      card.dataset.id = myth.id;
      card.setAttribute('aria-label', `Read ${myth.title}${bookmarks.has(myth.id) ? ', saved' : ''}`);
      const heading = element('span', 'story-card-heading', myth.title);
      if (bookmarks.has(myth.id)) heading.append(element('span', 'saved-mark', ' ★'));
      if (!myth.community) {
        const icon = element('img', 'story-icon');
        icon.src = myth.marker;
        icon.alt = '';
        card.append(icon);
      }
      card.append(heading,
        element('span', 'story-meta', `${kindLabel(myth)}${myth.community ? ' · Community' : ' · Folklore'}`),
        element('span', 'story-excerpt', myth.story.length > 95 ? `${myth.story.slice(0, 95).trim()}…` : myth.story));
      card.onclick = () => {
        renderDetails(myth);
        world.focusOn?.(myth.lat, myth.lng);
        if (window.innerWidth <= 760) setSidebar(false);
      };
      list.append(card);
    }
    if (!stories.length) list.append(element('p', 'empty-state', 'No stories match. Try another search or change your filters.'));
    world.setFilters?.(byId('type-filter').value, stories.map((myth) => myth.id));
  }

  function renderDetails(myth) {
    selected = myth;
    byId('detail-title').textContent = myth.title || myth.name;
    byId('creature-plate').classList.toggle('hidden', Boolean(myth.community));
    byId('enter-creature-view').classList.toggle('hidden', Boolean(myth.community));
    if (!myth.community) {
      byId('creature-banner').src = myth.banner;
      byId('creature-banner').alt = myth.name + ' folklore illustration';
      byId('full-illustration').href = myth.illustration;
      byId('creature-habitat').textContent = myth.habitat;
    }
    byId('detail-kind').textContent = `${kindLabel(myth)} · ${myth.community ? 'Community story' : 'Folklore collection'}`;
    byId('detail-story').textContent = myth.story;
    byId('detail-author').textContent = myth.author || 'Philippine folklore';
    byId('detail-location').textContent = `${myth.region ? `${myth.region} · ` : ''}${coordinates(myth)}`;
    byId('detail-source').textContent = myth.source ? `Source / oral tradition: ${myth.source}` : 'Folklore varies across communities. Map locations are illustrative.';
    byId('detail-save').textContent = canWrite() ? bookmarks.has(myth.id) ? '★ Saved to collection' : '☆ Save story' : 'Sign in to save';
    byId('detail-save').setAttribute('aria-pressed', String(bookmarks.has(myth.id)));
    byId('details-panel').classList.remove('hidden');
    document.querySelectorAll('.story-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.id === myth.id);
    });
  }

  function hidePopup() {
    byId('details-panel').classList.add('hidden');
    byId('marker-popup')?.classList.add('hidden');
    selected = null;
    document.querySelectorAll('.story-card.is-selected').forEach((card) => card.classList.remove('is-selected'));
  }

  async function refreshData() {
    const revision = sessionRevision;
    const data = await api.request('/myths');
    community = data.myths;
    if (canWrite()) {
      const saved = await api.request('/bookmarks');
      if (revision === sessionRevision) bookmarks = new Set(saved.bookmarks);
    }
    syncWorld();
    renderStories();
    if (selected) {
      const updated = allStories().find((myth) => myth.id === selected.id);
      if (updated) renderDetails(updated);
      else hidePopup();
    }
    byId('retry-data')?.classList.add('hidden');
  }

  function listError(container, message, retry) {
    container.replaceChildren(element('p', 'empty-state', message));
    const button = element('button', 'btn-secondary', 'Try again');
    button.type = 'button';
    button.onclick = retry;
    container.append(button);
  }

  async function loadAdmin() {
    if (user?.role !== 'admin') return;
    const revision = sessionRevision;
    const request = ++dashboardRequest;
    const current = () => revision === sessionRevision && request === dashboardRequest;
    const targets = [byId('pending-list'), byId('admin-accounts')];
    for (const target of targets) target.replaceChildren(element('p', 'empty-state', 'Loading…'));
    try {
      const [stories, directory] = await Promise.all([api.request('/admin/myths'), api.request('/admin/accounts')]);
      if (!current()) return;
      adminItems = stories.myths;
      accounts = directory.accounts;
      const owner = byId('admin-owner'), selectedOwner = owner.value;
      owner.replaceChildren();
      function addOption(value, name) {
        const option = element('option', '', name);
        option.value = value;
        owner.append(option);
      }
      addOption('', 'All accounts');
      for (const account of accounts) addOption(account.id, account.id === user.id ? 'My submissions' : account.name + ' · ' + account.login);
      if (adminItems.some(m => !accounts.some(a => a.id === m.ownerId))) addOption('removed', 'Removed accounts');
      owner.value = Array.from(owner.children).some(o => o.value === selectedOwner) ? selectedOwner : '';
      renderAdmin();
      renderAccounts();
    } catch (error) {
      if (!current()) return;
      if (error.status === 401) sessionExpired();
      else for (const target of targets) listError(target, error.message, loadAdmin);
    }
  }

  function removeButton(label, path, prompt) {
    const button = element('button', 'remove-record', label);
    button.type = 'button';
    button.onclick = () => {
      if (!window.confirm(prompt)) return;
      return run(button, async () => {
        await api.request(path, { method: 'DELETE' });
        await Promise.all([loadAdmin(), refreshData()]);
        toast(label === 'Remove account' ? 'Account removed.' : 'Submission removed.');
      });
    };
    return button;
  }

  function renderAccounts() {
    const list = byId('admin-accounts');
    list.replaceChildren();
    for (const a of accounts) {
      const card = element('article', 'review-card');
      const heading = element('div', 'story-card-heading');
      heading.append(element('h3', '', a.name), element('span', 'badge', a.role === 'admin' ? 'Administrator' : 'Explorer'));
      card.append(heading, element('p', 'story-meta', a.login + ' · ' + (a.signedIn ? 'Signed in' : 'Signed out')),
        element('p', '', a.submissions + (a.submissions === 1 ? ' submission' : ' submissions')));
      if (a.id === user.id) card.append(element('p', 'story-meta', 'Your account'));
      else card.append(removeButton('Remove account', '/admin/accounts/' + encodeURIComponent(a.id),
        'Remove ' + a.name + ' (' + a.login + ')? Their sessions and bookmarks will be removed. Their submissions will remain available for review.'));
      list.append(card);
    }
  }

  function showDashboardSection(accountsOpen) {
    byId('dashboard-review').classList.toggle('hidden', accountsOpen);
    byId('dashboard-accounts').classList.toggle('hidden', !accountsOpen);
    byId('dashboard-stories').setAttribute('aria-pressed', String(!accountsOpen));
    byId('dashboard-users').setAttribute('aria-pressed', String(accountsOpen));
  }

  function submissionCard(myth) {
    const card = element('article', 'review-card');
    const heading = element('div', 'story-card-heading');
    heading.append(element('h3', '', myth.title), element('span', `badge ${myth.status}`, myth.status));
    card.append(heading, element('p', 'story-meta', `${myth.author} · ${kindLabel(myth)} · ${dateLabel(myth.createdAt)}`), element('p', 'review-story', myth.story), element('p', 'story-meta', `${myth.region ? `${myth.region} · ` : ''}${coordinates(myth)}`));
    if (myth.source) card.append(element('p', 'story-meta', `Source: ${myth.source}`));
    if (myth.reviewNote) card.append(element('p', 'review-note', `Review note: ${myth.reviewNote}`));
    return card;
  }

  function renderAdmin() {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const item of adminItems) if (Object.hasOwn(counts, item.status)) counts[item.status]++;
    byId('admin-stats').textContent = `${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`;
    const status = byId('admin-filter').value;
    const owner = byId('admin-owner').value;
    const records = adminItems.filter(myth => (status === 'all' || myth.status === status) &&
      (!owner || myth.ownerId === owner || (owner === 'removed' && !accounts.some(a => a.id === myth.ownerId))));
    const list = byId('pending-list');
    list.replaceChildren();
    if (!records.length) list.append(element('p', 'empty-state', status === 'pending' ? 'All caught up. New stories will appear here for review.' : 'No submissions in this category yet.'));
    for (const myth of records) {
      const card = submissionCard(myth);
      const account = accounts.find(a => a.id === myth.ownerId);
      card.append(element('p', 'story-meta', account ? 'Account · ' + account.name + ' (' + account.login + ')' : 'Removed account'));
      const label = element('label', 'review-label', 'Review note (optional)');
      const note = element('textarea');
      note.maxLength = 500;
      note.rows = 2;
      note.value = myth.reviewNote || '';
      note.placeholder = 'Context or a reason for the contributor';
      label.append(note);
      const actions = element('div', 'record-actions');
      const approve = element('button', 'btn-primary', myth.status === 'approved' ? 'Approved' : 'Approve');
      const reject = element('button', 'btn-secondary', myth.status === 'rejected' ? 'Rejected' : 'Reject');
      approve.type = reject.type = 'button';
      approve.disabled = myth.status === 'approved';
      reject.disabled = myth.status === 'rejected';
      const review = (nextStatus, button) => run(button, async () => {
        approve.disabled = reject.disabled = true;
        try {
          await api.request(`/admin/myths/${encodeURIComponent(myth.id)}`, { method: 'PATCH', body: { status: nextStatus, reviewNote: note.value.trim() } });
          toast(nextStatus === 'approved' ? 'Story approved and added to the map.' : 'Story rejected. The contributor can see your review note.');
          await Promise.all([loadAdmin(), refreshData()]);
        } finally {
          approve.disabled = myth.status === 'approved';
          reject.disabled = myth.status === 'rejected';
        }
      });
      approve.onclick = () => review('approved', approve);
      reject.onclick = () => review('rejected', reject);
      actions.append(approve, reject, removeButton('Remove submission', '/admin/myths/' + encodeURIComponent(myth.id),
        'Permanently remove “' + myth.title + '” from the atlas, submission history and saved collections?'));
      card.append(label, actions);
      list.append(card);
    }
  }

  async function loadSubmissions() {
    if (!canWrite()) return;
    const revision = sessionRevision;
    const list = byId('submissions-list');
    list.replaceChildren(element('p', 'empty-state', 'Loading your stories…'));
    try {
      const { myths } = await api.request('/my-submissions');
      if (revision !== sessionRevision) return;
      list.replaceChildren();
      if (!myths.length) list.append(element('p', 'empty-state', 'Your story starts here. Choose “Share a myth” and pin a location on the map.'));
      for (const myth of myths) list.append(submissionCard(myth));
    } catch (error) {
      if (error.status === 401) sessionExpired();
      else listError(list, error.message, () => loadSubmissions());
    }
  }

  function setSidebar(open) {
    byId('discovery-panel').classList.toggle('mobile-open', open);
    byId('sidebar-toggle').setAttribute('aria-expanded', String(open));
  }

  function authenticate(operation) {
    if (authBusy) return;
    authBusy = true;
    byId('login-submit').disabled = byId('login-guest').disabled = true;
    return run(null, operation, 'login-error').finally(() => {
      authBusy = false;
      byId('login-submit').disabled = byId('login-guest').disabled = false;
    });
  }

  byId('login-form').onsubmit = (event) => {
    event.preventDefault();
    authenticate(async () => {
      const session = await api.request('/login', { method: 'POST', body: {
        role: byId('role-select').value,
        email: byId('login-email').value.trim(),
        password: byId('login-password').value
      } });
      byId('login-password').value = '';
      setSession(session.user);
      toast(`Welcome, ${session.user.name}. Your journey starts here.`);
      await refreshData();
    });
  };
  byId('login-guest').onclick = () => authenticate(async () => {
    const session = await api.request('/guest', { method: 'POST' });
    byId('login-password').value = '';
    setSession(session.user);
    toast('Welcome, guest. Explore every published story. Sign in to save or contribute.');
    await refreshData();
  });
  byId('toggle-password').onclick = () => {
    const input = byId('login-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    byId('toggle-password').textContent = show ? 'Hide' : 'Show';
    byId('toggle-password').setAttribute('aria-pressed', String(show));
    byId('toggle-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  byId('logout-btn').onclick = () => run(byId('logout-btn'), async () => {
    await api.request('/logout', { method: 'POST' });
    api.csrfToken = null;
    byId('login-password').value = '';
    setError('login-error');
    for (const id of ['myth-form', 'admin-panel', 'submissions-panel', 'help-panel']) closeModal(id);
    setSession(null);
    hidePopup();
    toast('Signed out. Sign in again or explore as a guest.');
  });
  byId('action-btn').onclick = () => {
    if (!canWrite()) return;
    if (mapState.placingPin) return resetActionButton();
    if (mapState.ready === false) return toast(byId('map-status').textContent);
    mapState.placingPin = true;
    byId('action-btn').textContent = 'Cancel pin';
    byId('action-btn').classList.add('active');
    byId('map').classList.add('placing-pin');
    hidePopup();
    setSidebar(false);
    byId('map-status').textContent = 'Choose a location in the Philippines on the map. Press Escape to cancel.';
    toast('Click or tap the map to choose your story’s location.');
  };
  byId('cancel-form').onclick = () => { closeModal('myth-form'); resetActionButton(); };
  byId('myth-story').oninput = () => { byId('story-count').textContent = `${byId('myth-story').value.length.toLocaleString()} / 10,000`; };
  byId('submit-form').onsubmit = (event) => {
    event.preventDefault();
    if (!canWrite()) return sessionExpired();
    run(byId('submit-myth'), async () => {
      const myth = {
        title: byId('myth-title').value.trim(), author: byId('myth-author').value.trim(),
        story: byId('myth-story').value.trim(), lat: Number(byId('myth-lat').value), lng: Number(byId('myth-lng').value),
        type: byId('myth-type').value, region: byId('myth-region').value.trim(), source: byId('myth-source').value.trim()
      };
      await api.request('/myths', { method: 'POST', body: myth });
      closeModal('myth-form');
      event.target.reset();
      byId('story-count').textContent = '0 / 10,000';
      resetActionButton();
      toast('Your story was submitted for review. ' + (user?.role === 'admin' ? 'Track it in Dashboard.' : 'Track it in My submissions.'));
    }, 'form-error');
  };
  byId('admin-btn').onclick = () => { if (user?.role === 'admin') { showDashboardSection(false); openModal('admin-panel'); loadAdmin(); } };
  byId('admin-filter').onchange = renderAdmin;
  byId('admin-owner').onchange = renderAdmin;
  byId('dashboard-stories').onclick = () => showDashboardSection(false);
  byId('dashboard-users').onclick = () => showDashboardSection(true);
  byId('submissions-btn').onclick = () => { if (canWrite()) { openModal('submissions-panel'); loadSubmissions(); } };
  for (const [button, modal] of [['close-admin', 'admin-panel'], ['close-submissions', 'submissions-panel'], ['close-help', 'help-panel']]) {
    byId(button).onclick = () => closeModal(modal);
  }
  byId('help-btn').onclick = () => openModal('help-panel');
  byId('search-input').oninput = renderStories;
  byId('type-filter').onchange = renderStories;
  byId('saved-filter').onchange = renderStories;
  byId('retry-data').onclick = () => run(byId('retry-data'), refreshData);
  byId('enter-creature-view').onclick = enterEncounter;
  byId('close-details').onclick = hidePopup;
  byId('detail-focus').onclick = () => { if (selected) world.focusOn?.(selected.lat, selected.lng); };
  byId('detail-save').onclick = () => {
    if (!selected) return;
    if (!canWrite()) {
      setError('login-error', 'Sign in as an explorer or administrator to save stories.');
      return openModal('login-screen');
    }
    const myth = selected;
    run(byId('detail-save'), async () => {
      const saved = !bookmarks.has(myth.id);
      const response = await api.request(`/bookmarks/${encodeURIComponent(myth.id)}`, { method: 'PUT', body: { saved } });
      bookmarks = new Set(response.bookmarks);
      renderStories();
      if (selected?.id === myth.id) renderDetails(myth);
      toast(saved ? 'Story saved to your collection.' : 'Story removed from your collection.');
    });
  };
  byId('quality-toggle').onclick = () => {
    highQuality = !highQuality;
    syncWorld();
    try { localStorage.setItem('myths-map-quality', highQuality ? 'high' : 'low'); } catch { /* optional preference */ }
  };
  byId('reset-map').onclick = () => { resetActionButton(); world.fitCameraToWorld?.(); hidePopup(); };
  byId('sidebar-toggle').onclick = () => setSidebar(byId('sidebar-toggle').getAttribute('aria-expanded') !== 'true');
  document.addEventListener('keydown', (event) => {
    if (encounter?.dialog.open) return; // Native dialog handles focus and Escape.
    if (event.key === 'Escape') {
      if (activeModal && activeModal.id !== 'login-screen') closeModal(activeModal.id);
      else if (!activeModal) { resetActionButton(); hidePopup(); setSidebar(false); }
      return;
    }
    if (event.key !== 'Tab' || !activeModal) return;
    const focusable = [...activeModal.querySelectorAll('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex="0"]')].filter((node) => !node.disabled && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  for (const id of ['myth-form', 'admin-panel', 'submissions-panel', 'help-panel']) {
    byId(id).addEventListener('click', (event) => { if (event.target === byId(id)) closeModal(id); });
  }

  syncWorld();
  renderStories();
  setSidebar(true);
  openModal('login-screen');
  authBusy = true;
  byId('login-submit').disabled = byId('login-guest').disabled = true;
  (async () => {
    try {
      const session = await api.request('/session');
      setSession(session.user);
      await refreshData();
    } catch (error) {
      if (error.status === 401 && user) sessionExpired();
      else {
        setError('login-error', error.message);
        byId('retry-data')?.classList.remove('hidden');
        toast(error.message);
      }
    } finally {
      authBusy = false;
      byId('login-submit').disabled = byId('login-guest').disabled = false;
    }
  })();

  return {
    dispose() { disposed = true; encounter?.dispose(); },
    setWorld(nextWorld) {
      world = nextWorld;
      if (encounter?.dialog.open) world.setEncounterOpen?.(true);
      syncWorld();
      renderStories();
    },
    refreshData,
    showMythForm(lat, lng) {
      resetActionButton();
      if (!canWrite()) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4 || lat > 22 || lng < 116 || lng > 127) {
        return toast('Choose a location within the Philippine map (4–22° N, 116–127° E).');
      }
      byId('myth-lat').value = lat.toFixed(6);
      byId('myth-lng').value = lng.toFixed(6);
      byId('location-label').textContent = `Pinned at ${coordinates({ lat, lng })}`;
      if (!byId('myth-author').value) byId('myth-author').value = user.name;
      setError('form-error');
      openModal('myth-form');
    },
    showCreaturePopup(data) {
      const myth = allStories().find((item) => item.id === data.id) || { ...data, title: data.title || data.name, author: data.author || 'Philippine folklore', community: Boolean(data.community) };
      renderDetails(myth);
      world.focusOn?.(myth.lat, myth.lng);
    },
    hidePopup,
    resetActionButton,
    getRole: () => user?.role || null
  };
}
