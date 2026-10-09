(() => {
  'use strict';
  const els = Object.fromEntries([
    'loginPanel','loginForm','password','loginError','dashboard','headerStatus','headerDot',
    'statClicks','statPosted','postedSubtitle','statSpend','statCpc',
    'publisherChart','sourceRows','sheetSynced','reportSynced','sourceLink',
    'refreshButton','searchInput','ownerFilter','articleFilter','statusFilter',
    'resultCount','publisherTable','tableLastUpdated','toast'
  ].map(id => [id, document.getElementById(id)]));
  let placements = [];
  let toastTimer;
  let key = sessionStorage.getItem('fanvue-dashboard-password') || '';
  const fmt = n => new Intl.NumberFormat('en-GB').format(n || 0);
  const dollars = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
  const cpcFormat = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const escapeHtml = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = x => {try{const url = new URL(x);return url.protocol==='https:'?url.href:'#'}catch{return '#'}};
  const formatTime = x => {if(!x)return 'Awaiting first sync';const d=new Date(x);return Number.isNaN(d.getTime())?'Awaiting first sync':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(d)+' UK';};
  const toast = message => {clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.add('show');toastTimer=setTimeout(()=>els.toast.classList.remove('show'),2700)};
  const status = (text,ready) => {els.headerStatus.textContent=text;els.headerDot.classList.toggle('ready',Boolean(ready));};
  const showLogin = message => {els.dashboard.hidden=true;els.loginPanel.hidden=false;status('CONNECTION REQUIRED',false);els.loginError.textContent=message||'';};
  const showDashboard = () => {els.loginPanel.hidden=true;els.dashboard.hidden=false;status('SHEET CONNECTED',true);};

  async function load() {
    status('SYNCING GOOGLE SHEETS…',false);
    els.refreshButton.disabled=true;
    try {
      const resp = await fetch('/.netlify/functions/dashboard', {headers:{'x-dashboard-key':key},cache:'no-store'});
      const result = await resp.json();
      if (resp.status===401) {sessionStorage.removeItem('fanvue-dashboard-password');key='';showLogin(result.error||'Incorrect dashboard password');return;}
      if(!resp.ok||!result.ok)throw new Error(result.error||'Connection failed');
      sessionStorage.setItem('fanvue-dashboard-password',key);
      placements=Array.isArray(result.placements)?result.placements:[];
      render(result);
      showDashboard();
    } catch(error) {
      if (els.dashboard.hidden) showLogin(error.message||'Connection problem');
      else {status('SHEET CONNECTION ERROR',false);toast('Could not refresh Google Sheets.');}
    } finally {els.refreshButton.disabled=false;}
  }

  function render(result) {
    const clicks=placements.reduce((sum,p)=>sum+Number(p.clicks||0),0);
    const posted=placements.filter(p=>p.posted).length;
    const paidSpend=placements.filter(p=>p.paid).reduce((sum,p)=>sum+Number(p.cost||0),0);
    els.statClicks.textContent=fmt(clicks);
    els.statPosted.textContent=fmt(posted);
    els.postedSubtitle.textContent=`${fmt(placements.length)} total publisher placements`;
    els.statSpend.textContent=dollars(paidSpend);
    els.statCpc.textContent=clicks?cpcFormat(paidSpend/clicks):'—';
    els.sourceRows.textContent=`${fmt(placements.length)} publisher rows detected`;
    els.sheetSynced.textContent=formatTime(result.lastSheetSync);
    els.reportSynced.textContent=formatTime(result.lastReportRefresh);
    els.tableLastUpdated.textContent='REPORT: '+formatTime(result.lastReportRefresh).toUpperCase();
    els.sourceLink.href=safeUrl(result.sourceSheetUrl);
    renderChart();
    populateOptions(els.ownerFilter,[...new Set(placements.map(p=>p.owner))].filter(Boolean).sort());
    populateOptions(els.articleFilter,[...new Set(placements.map(p=>p.article))].filter(Boolean).sort());
    renderTable();
  }

  function renderChart() {
    const top=placements.filter(p=>Number(p.clicks)>0).sort((a,b)=>b.clicks-a.clicks).slice(0,8);
    if (!top.length) {els.publisherChart.innerHTML='<div class="empty">No tracked clicks yet. Publisher links are ready as soon as you publish.</div>';return;}
    const max=Number(top[0].clicks)||1;
    els.publisherChart.innerHTML=top.map(p=>`<div class="bar-row"><div class="bar-name" title="${escapeHtml(p.publisher)}">${escapeHtml(p.publisher)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,(p.clicks/max)*100))}%"></div></div><div class="bar-number">${fmt(p.clicks)}</div></div>`).join('');
  }

  function populateOptions(select,list) {
    const previous=select.value;
    const label=select.id==='ownerFilter'?'owner':'article';
    select.innerHTML=`<option value="ALL">All ${label}s</option>`+list.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    if (list.includes(previous))select.value=previous;
  }

  function renderTable() {
    const q=els.searchInput.value.trim().toLowerCase();
    const owner=els.ownerFilter.value;
    const article=els.articleFilter.value;
    const kind=els.statusFilter.value;
    const filtered=placements.filter(p=>{
      if(q && !(`${p.publisher} ${p.code} ${p.sourceTab}`.toLowerCase().includes(q)))return false;
      if(owner!=='ALL'&&p.owner!==owner)return false;
      if(article!=='ALL'&&p.article!==article)return false;
      if(kind==='POSTED'&&!p.posted)return false;
      if(kind==='PAID'&&!p.paid)return false;
      if(kind==='PLANNED'&&(p.paid||p.posted))return false;
      return true;
    });
    els.resultCount.textContent=`${fmt(filtered.length)} RESULTS`;
    if(!filtered.length){els.publisherTable.innerHTML='<tr><td colspan="9" class="empty">No matching publisher rows in your Sheet.</td></tr>';return;}
    els.publisherTable.innerHTML=filtered.map(p=>{
      const status=p.posted?['posted','PUBLISHED']:p.paid?['paid-unposted','PAID / WAITING']:['planned','PLANNED'];
      const cpc=p.clicks?cpcFormat(p.cost/p.clicks):'—';
      const link=safeUrl(p.trackingUrl);
      const postedLink=safeUrl(p.postUrl);
      return `<tr><td>${escapeHtml(p.code)}</td><td><span class="publisher-name">${escapeHtml(p.publisher)}</span></td><td><span class="owner-tag">${escapeHtml(p.owner)}</span></td><td><span class="chip ${status[0]}">${status[1]}</span></td><td class="num">${dollars(p.cost)}</td><td class="num"><strong>${fmt(p.clicks)}</strong></td><td class="num">${cpc}</td><td><button type="button" class="copy-btn" data-url="${escapeHtml(link)}" ${link==='#'?'disabled':''}>↗ COPY LINK</button></td><td>${postedLink==='#'?'<span class="dash">—</span>':`<a class="post-link" href="${escapeHtml(postedLink)}" rel="noopener noreferrer" target="_blank">VIEW ↗</a>`}</td></tr>`;
    }).join('');
  }

  els.publisherTable.addEventListener('click',async e=>{
    const button=e.target.closest('button[data-url]');
    if(!button)return;
    try{await navigator.clipboard.writeText(button.dataset.url);toast('Tracking link copied');}
    catch {toast('Could not copy automatically. Use the sheet UTM LINK column.');}
  });
  els.loginForm.addEventListener('submit',e=>{e.preventDefault();key=els.password.value;els.loginError.textContent='';load();});
  els.refreshButton.addEventListener('click',()=>load());
  for(const id of ['searchInput','ownerFilter','articleFilter','statusFilter'])els[id].addEventListener(id==='searchInput'?'input':'change',renderTable);
  if (key)load();else showLogin('');
})();
