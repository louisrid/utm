(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = Object.fromEntries([
    'loginPanel', 'loginForm', 'password', 'loginError', 'dashboard',
    'headerDot', 'headerStatus', 'pageTitle',
    'viewDashboard', 'viewPlacements', 'overviewView', 'placementsView',
    'statClicks', 'statPosted', 'statSpend', 'statCpc',
    'overviewCount', 'topPublishers', 'sourceLink', 'refreshButton',
    'searchInput', 'articleFilter', 'resultCount', 'publisherTable',
    'tableLastUpdated', 'toast'
  ].map(id => [id, $(id)]));

  let placements = [];
  let key = sessionStorage.getItem('fanvue-dashboard-password') || '';
  let activeOwner = 'ALL';
  let activeView = 'dashboard';
  let toastTimer;

  const fmt = n => new Intl.NumberFormat('en-GB').format(Number(n) || 0);
  const dollars = n => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(Number(n) || 0);
  const cpcFormat = n => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(n) || 0);
  const escapeHtml = x => String(x ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const safeUrl = x => {
    try {
      const url = new URL(x);
      return url.protocol === 'https:' ? url.href : '#';
    } catch {
      return '#';
    }
  };
  const formatTime = x => {
    if (!x) return 'Awaiting sync';
    const date = new Date(x);
    if (Number.isNaN(date.getTime())) return 'Awaiting sync';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London'
    }).format(date) + ' UK';
  };

  const toast = message => {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2700);
  };

  function selectTheme(theme) {
    const selected = ['mono', 'blue', 'red'].includes(theme) ? theme : 'mono';
    document.body.dataset.theme = selected;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      const active = button.dataset.themeChoice === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    try { localStorage.setItem('automatic-x-theme', selected); } catch (_) {}
  }

  function selectView(view) {
    activeView = view === 'placements' ? 'placements' : 'dashboard';
    const placementsView = activeView === 'placements';
    els.overviewView.hidden = placementsView;
    els.placementsView.hidden = !placementsView;
    els.pageTitle.textContent = placementsView ? 'PLACEMENTS' : 'DASHBOARD';
    els.viewDashboard.classList.toggle('selected', !placementsView);
    els.viewPlacements.classList.toggle('selected', placementsView);
    els.viewDashboard.setAttribute('aria-selected', String(!placementsView));
    els.viewPlacements.setAttribute('aria-selected', String(placementsView));
  }

  function selectOwner(owner) {
    activeOwner = ['ALL', 'LOUIS', 'CONNOR'].includes(owner) ? owner : 'ALL';
    document.querySelectorAll('[data-owner]').forEach(button => {
      const active = button.dataset.owner === activeOwner;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderOverview();
    renderTable();
  }

  const ownerPlacements = () => placements.filter(p =>
    activeOwner === 'ALL' || String(p.owner || '').toUpperCase() === activeOwner
  );

  function setStatus(message, ready) {
    els.headerStatus.textContent = message;
    els.headerDot.classList.toggle('ready', Boolean(ready));
  }

  function showLogin(message) {
    els.dashboard.hidden = true;
    els.loginPanel.hidden = false;
    setStatus('LOG IN', false);
    els.loginError.textContent = message || '';
  }

  function showDashboard() {
    els.loginPanel.hidden = true;
    els.dashboard.hidden = false;
    setStatus('CONNECTED', true);
  }

  async function load() {
    setStatus('SYNCING', false);
    els.refreshButton.disabled = true;
    try {
      const response = await fetch('/.netlify/functions/dashboard', {
        headers: { 'x-dashboard-key': key },
        cache: 'no-store'
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem('fanvue-dashboard-password');
        key = '';
        showLogin(result.error || 'Incorrect password');
        return;
      }
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Google Sheets connection failed');
      }
      sessionStorage.setItem('fanvue-dashboard-password', key);
      placements = Array.isArray(result.placements) ? result.placements : [];
      render(result);
      showDashboard();
    } catch (error) {
      if (els.dashboard.hidden) {
        showLogin(error.message || 'Connection problem');
      } else {
        setStatus('CONNECTION ERROR', false);
        toast('Could not refresh Google Sheets');
      }
    } finally {
      els.refreshButton.disabled = false;
    }
  }

  function render(result) {
    els.tableLastUpdated.textContent =
      'UPDATED: ' + formatTime(result.lastReportRefresh).toUpperCase();
    els.sourceLink.href = safeUrl(result.sourceSheetUrl);

    const articleOptions = [...new Set(
      placements.map(p => p.article).filter(Boolean)
    )].sort();
    const oldArticle = els.articleFilter.value;
    els.articleFilter.innerHTML =
      '<option value="ALL">ALL ARTICLES</option>' +
      articleOptions.map(value =>
        '<option value="' + escapeHtml(value) + '">' +
        escapeHtml(value) + '</option>'
      ).join('');
    if (articleOptions.includes(oldArticle)) els.articleFilter.value = oldArticle;

    renderOverview();
    renderTable();
  }

  function renderOverview() {
    const rows = ownerPlacements();
    const clicks = rows.reduce((sum, p) => sum + Number(p.clicks || 0), 0);
    const published = rows.filter(p => p.posted).length;
    const paidSpend = rows.filter(p => p.paid)
      .reduce((sum, p) => sum + Number(p.cost || 0), 0);
    els.statClicks.textContent = fmt(clicks);
    els.statPosted.textContent = fmt(published);
    els.statSpend.textContent = dollars(paidSpend);
    els.statCpc.textContent = clicks ? cpcFormat(paidSpend / clicks) : '—';

    const top = rows.filter(p => Number(p.clicks) > 0)
      .sort((a, b) => Number(b.clicks) - Number(a.clicks))
      .slice(0, 5);
    els.overviewCount.textContent = fmt(rows.length) + ' PLACEMENTS';
    if (!top.length) {
      els.topPublishers.innerHTML =
        '<p class="empty">No clicks recorded yet.</p>';
      return;
    }
    const maximum = Math.max(1, Number(top[0].clicks));
    els.topPublishers.innerHTML = top.map(p => {
      const width = Math.max(0, Math.min(100, Number(p.clicks) / maximum * 100));
      return '<div class="publisher-rank">' +
        '<div class="publisher-label" title="' + escapeHtml(p.publisher) + '">' +
        escapeHtml(p.publisher) + '</div>' +
        '<div class="publisher-track"><div class="publisher-fill" style="width:' +
        width + '%"></div></div>' +
        '<div class="publisher-total">' + fmt(p.clicks) + '</div></div>';
    }).join('');
  }

  function renderTable() {
    const query = els.searchInput.value.trim().toLowerCase();
    const article = els.articleFilter.value;
    const filtered = ownerPlacements().filter(p => {
      if (article !== 'ALL' && p.article !== article) return false;
      const search = String(p.publisher || '') + ' ' + String(p.code || '') +
        ' ' + String(p.sourceTab || '');
      return !query || search.toLowerCase().includes(query);
    });

    els.resultCount.textContent = fmt(filtered.length) + ' TOTAL';
    if (!filtered.length) {
      els.publisherTable.innerHTML =
        '<tr><td colspan="8" class="empty">No matching placements.</td></tr>';
      return;
    }

    els.publisherTable.innerHTML = filtered.map(p => {
      const state = p.posted ? ['posted', 'PUBLISHED'] :
        p.paid ? ['paid', 'PAID'] : ['planned', 'PLANNED'];
      const link = safeUrl(p.trackingUrl);
      const post = safeUrl(p.postUrl);
      const postCell = post === '#'
        ? '<span class="dash">—</span>'
        : '<a class="post-link" href="' + escapeHtml(post) +
          '" rel="noopener noreferrer" target="_blank">VIEW ↗</a>';

      return '<tr>' +
        '<td data-label="ID">' + escapeHtml(p.code) + '</td>' +
        '<td data-label="PUBLISHER"><span class="publisher-name">' + escapeHtml(p.publisher) + '</span></td>' +
        '<td data-label="OWNER"><span class="owner-tag">' + escapeHtml(p.owner) + '</span></td>' +
        '<td data-label="STATUS"><span class="chip ' + state[0] + '">' + state[1] + '</span></td>' +
        '<td data-label="COST" class="num">' + dollars(p.cost) + '</td>' +
        '<td data-label="CLICKS" class="num">' + fmt(p.clicks) + '</td>' +
        '<td data-label="UTM LINK"><button type="button" class="copy-btn" data-url="' +
        escapeHtml(link) + '" ' + (link === '#' ? 'disabled' : '') +
        '>COPY</button></td>' +
        '<td data-label="POST">' + postCell + '</td></tr>';
    }).join('');
  }

  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.addEventListener('click', () =>
      selectTheme(button.dataset.themeChoice)
    );
  });
  document.querySelectorAll('[data-owner]').forEach(button => {
    button.addEventListener('click', () => selectOwner(button.dataset.owner));
  });
  els.viewDashboard.addEventListener('click', () => selectView('dashboard'));
  els.viewPlacements.addEventListener('click', () => selectView('placements'));

  els.publisherTable.addEventListener('click', async event => {
    const button = event.target.closest('button[data-url]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.url);
      toast('Tracking link copied');
    } catch (_) {
      toast('Copy the UTM link from Google Sheets');
    }
  });
  els.loginForm.addEventListener('submit', event => {
    event.preventDefault();
    key = els.password.value;
    els.loginError.textContent = '';
    load();
  });
  els.refreshButton.addEventListener('click', load);
  els.searchInput.addEventListener('input', renderTable);
  els.articleFilter.addEventListener('change', renderTable);

  let initialTheme = 'mono';
  try { initialTheme = localStorage.getItem('automatic-x-theme') || 'mono'; }
  catch (_) {}
  selectTheme(initialTheme);
  selectView('dashboard');
  selectOwner('ALL');
  if (key) load();
  else showLogin('');
})();