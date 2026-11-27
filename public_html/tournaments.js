/* false = live backend API under /backend/api */
const USE_MOCK = false;

const API_BASE = '/backend/api';
const USER_KEY = 'sportshub_user';
const ADMIN_ROLES = ['admin', 'sports_admin', 'super_admin'];

const STATUS_LABELS = {
  registration_open: 'Registration open',
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const STATUS_CLASS = {
  registration_open: 'badge-open',
  upcoming: 'badge-upcoming',
  ongoing: 'badge-ongoing',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
};

const $ = (id) => document.getElementById(id);

const els = {
  tabs: document.querySelectorAll('.tab'),
  panelT: $('panel-tournaments'),
  panelR: $('panel-results'),
  grid: $('t-grid'),
  tState: $('t-state'),
  search: $('search'),
  status: $('status-filter'),
  sport: $('sport-filter'),
  dialog: $('register-dialog'),
  form: $('register-form'),
  title: $('register-title'),
  team: $('team-name'),
  cancel: $('register-cancel'),
  rTournament: $('r-tournament'),
  rSport: $('r-sport'),
  rState: $('r-state'),
  list: $('results-list'),
  hint: $('standings-hint'),
  table: $('standings-table'),
  body: $('standings-body'),
  adminPanel: $('admin-panel'),
  rForm: $('result-form'),
  fTournament: $('f-tournament'),
  fRound: $('f-round'),
  fTeamA: $('f-team-a'),
  fTeamB: $('f-team-b'),
  fScoreA: $('f-score-a'),
  fScoreB: $('f-score-b'),
  fDate: $('f-date'),
  toast: $('toast'),
};

let tournaments = [];
let pendingId = null;
let toastTimer = null;
let resultsLoaded = false;
let confirmKey = null;
let confirmTimer = null;

function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isAdmin = USE_MOCK
  ? Boolean(window.MOCK_ADMIN)
  : ADMIN_ROLES.includes(String(getUser()?.role || '').toLowerCase());

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function setBox(box, message, isError = false) {
  box.hidden = !message;
  box.textContent = message || '';
  box.classList.toggle('error', isError);
}

function armConfirm(key, rerender) {
  confirmKey = key;
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => {
    confirmKey = null;
    rerender();
  }, 4000);
  rerender();
}

function clearConfirm() {
  confirmKey = null;
  clearTimeout(confirmTimer);
}

function formatGatewayError(status, fallbackText = '') {
  if (status === 403) {
    return 'Service unavailable (HTTP 403): Edge/security policy blocked upstream API execution on this deployment.';
  }
  if (status === 404) {
    return 'Service unavailable (HTTP 404): Upstream API route was not found on the current deployment.';
  }
  if (status === 502 || status === 504) {
    return `Upstream gateway error (HTTP ${status}): Backend service timed out or is unreachable.`;
  }
  return fallbackText || `Unable to reach backend service (HTTP ${status}).`;
}

async function api(endpoint, options = {}) {
  if (USE_MOCK && typeof window.mockApi === 'function') {
    return window.mockApi(endpoint, options);
  }

  const user = getUser();
  const headers = { Accept: 'application/json' };
  if (user?.id) headers['X-User-Id'] = String(user.id);
  if (options.body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}/${endpoint}`, { credentials: 'include', ...options, headers });
  } catch {
    throw new Error('Network or CORS policy blocked the API request to the deployment origin.');
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (res.status === 401) {
    window.location.assign('login.html');
    throw new Error('Session expired or unauthorized (HTTP 401). Please sign in again.');
  }

  if (!res.ok || data.success === false) {
    const serverMsg =
      (typeof data.error === 'string' && data.error.trim()) ||
      (typeof data.message === 'string' && data.message.trim());
    throw new Error(formatGatewayError(res.status, serverMsg));
  }

  return data;
}

function setTab(name, updateHash = true) {
  const showResults = name === 'results';
  els.tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  els.panelT.hidden = showResults;
  els.panelR.hidden = !showResults;
  clearConfirm();

  if (updateHash) history.replaceState(null, '', showResults ? '#results' : '#tournaments');
  if (showResults && !resultsLoaded) loadResults();
  else if (showResults) renderStandingsOnly();
  if (!showResults) render();
}

function renderStandingsOnly() {}

els.tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

function matchesFilters(t) {
  const q = els.search.value.trim().toLowerCase();
  if (els.status.value && t.status !== els.status.value) return false;
  if (els.sport.value && t.sport !== els.sport.value) return false;
  if (q && !`${t.name} ${t.sport} ${t.format}`.toLowerCase().includes(q)) return false;
  return true;
}

function actionButton(t) {
  if (t.is_registered) {
    const canWithdraw = t.status === 'registration_open' || t.status === 'upcoming';
    if (!canWithdraw) return '<span class="badge badge-registered">Registered</span>';
    const armed = confirmKey === `withdraw:${t.id}`;
    return armed
      ? `<button class="btn btn-danger" data-action="withdraw" data-id="${t.id}">Confirm withdraw?</button>`
      : `<button class="btn btn-outline" data-action="withdraw" data-id="${t.id}">Withdraw</button>`;
  }
  if (t.status !== 'registration_open') return '<button class="btn btn-outline" disabled>Closed</button>';
  if (t.spots_left <= 0) return '<button class="btn btn-outline" disabled>Full</button>';
  return `<button class="btn btn-primary" data-action="register" data-id="${t.id}">Register</button>`;
}

function resultsLink(t) {
  if (t.status !== 'ongoing' && t.status !== 'completed') return '';
  return `<button class="btn btn-outline" data-action="view-results" data-id="${t.id}">View results</button>`;
}

function render() {
  const list = tournaments.filter(matchesFilters);
  if (!list.length) {
    els.grid.innerHTML = '';
    setBox(els.tState, tournaments.length ? 'No tournaments match your filters.' : 'No tournaments have been published yet.');
    return;
  }
  setBox(els.tState, '');

  els.grid.innerHTML = list
    .map((t) => {
      const pct = t.max_teams ? Math.min(100, Math.round((t.registered_teams / t.max_teams) * 100)) : 0;
      return `
        <article class="card t-card">
          <div class="t-head">
            <h3>${esc(t.name)}</h3>
            <span class="badge ${STATUS_CLASS[t.status] || 'badge-sport'}">${esc(STATUS_LABELS[t.status] || t.status)}</span>
          </div>
          <div class="t-meta">
            <span><span class="badge badge-sport">${esc(t.sport)}</span></span>
            <span>${esc(formatDate(t.start_date))} – ${esc(formatDate(t.end_date))}</span>
            <span>Format: ${esc(t.format)}</span>
          </div>
          <p class="t-desc">${esc(t.description)}</p>
          <div>
            <div class="progress"><span style="width:${pct}%"></span></div>
            <div class="progress-label">
              <span>${t.registered_teams} / ${t.max_teams} teams</span>
              <span>${t.spots_left} spots left</span>
            </div>
          </div>
          <div class="t-actions">${actionButton(t)}${resultsLink(t)}</div>
        </article>`;
    })
    .join('');
}

function populateTournamentFilters() {
  const sports = [...new Set(tournaments.map((t) => t.sport))].sort();
  const sportOptions =
    '<option value="">All sports</option>' + sports.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const tournamentOptions = tournaments.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

  const keep = { t: els.sport.value, rs: els.rSport.value, rt: els.rTournament.value };

  els.sport.innerHTML = sportOptions;
  els.sport.value = sports.includes(keep.t) ? keep.t : '';

  els.rSport.innerHTML = sportOptions;
  els.rSport.value = sports.includes(keep.rs) ? keep.rs : '';

  els.rTournament.innerHTML = '<option value="">All tournaments</option>' + tournamentOptions;
  els.rTournament.value = tournaments.some((t) => String(t.id) === keep.rt) ? keep.rt : '';

  els.fTournament.innerHTML = '<option value="">Select tournament</option>' + tournamentOptions;
}

async function loadTournaments() {
  setBox(els.tState, 'Loading tournaments…');
  try {
    const res = await api('tournaments.php');
    tournaments = Array.isArray(res.data) ? res.data : [];
    populateTournamentFilters();
    render();
  } catch (err) {
    els.grid.innerHTML = '';
    setBox(els.tState, err.message, true);
  }
}

async function withdraw(id) {
  clearConfirm();
  try {
    const res = await api(`tournaments.php?tournament_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast(res.message || 'Registration withdrawn.');
    loadTournaments();
  } catch (err) {
    showToast(err.message, true);
    render();
  }
}

els.grid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === 'withdraw') {
    if (confirmKey === `withdraw:${id}`) withdraw(id);
    else armConfirm(`withdraw:${id}`, render);
    return;
  }

  if (action === 'view-results') {
    els.rTournament.value = String(id);
    els.rSport.value = '';
    setTab('results');
    if (resultsLoaded) loadResults();
    return;
  }

  const t = tournaments.find((x) => x.id === id);
  if (!t) return;
  pendingId = id;
  els.title.textContent = `Register for ${t.name}`;
  els.team.value = '';
  els.dialog.showModal();
});

els.cancel.addEventListener('click', () => els.dialog.close());

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (pendingId === null) return;
  const submitBtn = els.form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const res = await api('tournaments.php', {
      method: 'POST',
      body: JSON.stringify({ tournament_id: pendingId, team_name: els.team.value.trim() }),
    });
    els.dialog.close();
    showToast(res.message || 'Registered successfully.');
    loadTournaments();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    pendingId = null;
  }
});

[els.search, els.status, els.sport].forEach((el) => el.addEventListener('input', render));

let lastResults = [];

function renderResults(results) {
  lastResults = results;
  if (!results.length) {
    els.list.innerHTML = '<p class="muted">No results recorded yet.</p>';
    return;
  }
  els.list.innerHTML = results
    .map((m) => {
      const aWin = m.score_a > m.score_b;
      const bWin = m.score_b > m.score_a;
      const sub = [m.tournament_name, m.round_label, formatDate(m.played_on)].filter(Boolean).map(esc).join(' · ');
      const armed = confirmKey === `delete:${m.id}`;
      return `
        <div class="match-row">
          <div class="match-main">
            <span class="team ${aWin ? 'win' : ''}">${esc(m.team_a)}</span>
            <span class="score">${m.score_a} – ${m.score_b}</span>
            <span class="team right ${bWin ? 'win' : ''}">${esc(m.team_b)}</span>
          </div>
          <div class="match-sub">${sub}</div>
          ${
            isAdmin
              ? `<button class="row-delete ${armed ? 'confirming' : ''}" data-id="${m.id}" type="button">${armed ? 'Confirm delete?' : 'Delete'}</button>`
              : ''
          }
        </div>`;
    })
    .join('');
}

function renderStandings(standings, tournamentSelected) {
  if (!tournamentSelected) {
    els.table.hidden = true;
    els.hint.textContent = 'Select a tournament to see its standings.';
    return;
  }
  if (!standings.length) {
    els.table.hidden = true;
    els.hint.textContent = 'No standings yet. Results will appear here once matches are recorded.';
    return;
  }
  els.hint.textContent = 'Win = 3 pts, draw = 1 pt, loss = 0.';
  els.table.hidden = false;
  els.body.innerHTML = standings
    .map(
      (s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(s.team)}</td>
        <td>${s.played}</td><td>${s.won}</td><td>${s.drawn}</td><td>${s.lost}</td>
        <td>${s.gd > 0 ? '+' : ''}${s.gd}</td>
        <td>${s.points}</td>
      </tr>`
    )
    .join('');
}

async function loadResults() {
  const params = new URLSearchParams();
  if (els.rTournament.value) params.set('tournament_id', els.rTournament.value);
  if (els.rSport.value) params.set('sport', els.rSport.value);

  clearConfirm();
  setBox(els.rState, 'Loading results…');
  try {
    const res = await api(`results.php?${params.toString()}`);
    resultsLoaded = true;
    setBox(els.rState, '');
    renderResults(res.data.results || []);
    renderStandings(res.data.standings || [], Boolean(els.rTournament.value));
  } catch (err) {
    els.list.innerHTML = '';
    renderStandings([], Boolean(els.rTournament.value));
    setBox(els.rState, err.message, true);
  }
}

els.rTournament.addEventListener('change', loadResults);
els.rSport.addEventListener('change', loadResults);

els.list.addEventListener('click', async (e) => {
  const btn = e.target.closest('.row-delete');
  if (!btn) return;
  const key = `delete:${btn.dataset.id}`;
  if (confirmKey !== key) {
    armConfirm(key, () => renderResults(lastResults));
    return;
  }
  clearConfirm();
  try {
    const res = await api(`results.php?id=${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
    showToast(res.message || 'Result deleted.');
    loadResults();
  } catch (err) {
    showToast(err.message, true);
    renderResults(lastResults);
  }
});

els.rForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = els.rForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const res = await api('results.php', {
      method: 'POST',
      body: JSON.stringify({
        tournament_id: Number(els.fTournament.value),
        round_label: els.fRound.value.trim(),
        team_a: els.fTeamA.value.trim(),
        team_b: els.fTeamB.value.trim(),
        score_a: Number(els.fScoreA.value),
        score_b: Number(els.fScoreB.value),
        played_on: els.fDate.value,
      }),
    });
    showToast(res.message || 'Result recorded.');
    els.fTeamA.value = '';
    els.fTeamB.value = '';
    els.fScoreA.value = '';
    els.fScoreB.value = '';
    loadResults();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

async function init() {
  if (isAdmin) {
    els.adminPanel.hidden = false;
    els.fDate.value = new Date().toLocaleDateString('en-CA');
  }
  await loadTournaments();
  setTab(location.hash === '#results' ? 'results' : 'tournaments', false);
}

window.addEventListener('hashchange', () => setTab(location.hash === '#results' ? 'results' : 'tournaments', false));

init();