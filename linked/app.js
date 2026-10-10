(() => {
const $app = document.getElementById('app');
const DB = 'linked.users', SES = 'linked.session';
const THEMES = { dark: 'Dark', neon: 'Neon', club: 'Club', sunset: 'Sunset', light: 'Light' };
const PRESETS = ['Mixcloud', 'SoundCloud', 'Spotify', 'Instagram', 'TikTok', 'YouTube', 'Boek mij', 'Resident Advisor'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const users = () => load(DB, {});
const me = () => { const n = load(SES, null); return n ? users()[n] : null; };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const safeUrl = u => {
  u = String(u || '').trim();
  if (/^mailto:/i.test(u)) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; }
};
const b64e = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
const pub = u => ({ n: u.name, b: u.bio, t: u.theme, l: u.links.map(l => [l.label, l.url]) });
const unpub = p => ({ username: '', name: p.n, bio: p.b, theme: p.t, links: p.l.map(([label, url]) => ({ label, url })) });
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2200); };
const go = h => { location.hash = h; };

const shell = (inner, user) => `
<div class="wrap"><nav class="top">
  <a class="logo" href="#/"><i></i>linked</a>
  <div class="row">${user
    ? `<a class="btn" href="#/dashboard">Dashboard</a><button class="btn" data-act="logout">Uitloggen</button>`
    : `<a class="btn" href="#/login">Inloggen</a><a class="btn primary" href="#/register">Registreer</a>`}</div>
</nav>${inner}
<footer>© ${new Date().getFullYear()} <a href="/">SB Music</a> · <a href="/privacy.html">Privacy</a> · <a href="/voorwaarden.html">Voorwaarden</a></footer></div>`;

const profileHtml = u => `
<div class="prof">
  <div class="avatar">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</div>
  <h2>${esc(u.name)}</h2>
  <p class="bio">${esc(u.bio)}</p>
  <div class="links">${u.links.filter(l => l.label && l.url).map((l, i) =>
    `<a class="${i === 0 ? 'feat1' : ''}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>
</div>`;

const demo = { name: 'DJ Voorbeeld', bio: 'Resident DJ · open format\nBoekingen: open voor DMs', theme: 'dark',
  links: [{ label: '🎧 Nieuwste mix', url: 'https://mixcloud.com' }, { label: '📅 Boek mij', url: 'mailto:info@example.com' }, { label: '📸 Instagram', url: 'https://instagram.com' }] };

function home() {
  $app.innerHTML = shell(`
  <section class="hero">
    <div>
      <h1>Eén link voor al jouw <em>sets</em>.</h1>
      <p class="lead">Je mixes, boekingen, socials en volgende gig op één plek. Gemaakt voor DJ's die een link in bio nodig hebben die er goed uitziet en snel laadt.</p>
      <div class="row"><a class="btn primary big" href="#/register">Maak jouw pagina</a><a class="btn big" href="#/login">Inloggen</a></div>
    </div>
    <div class="phone">${profileHtml(demo)}</div>
  </section>
  <section class="feat">
    <div><h3>🎚️ Gebouwd voor DJ's</h3><p>Presets voor Mixcloud, SoundCloud, Spotify, Resident Advisor en een boekingsknop.</p></div>
    <div><h3>🎨 Eigen sfeer</h3><p>Kies een thema dat bij je sound past: Dark, Neon, Club, Sunset of Light.</p></div>
    <div><h3>⚡ Direct delen</h3><p>Kopieer je link, plak ze in je bio en pas je links aan wanneer je wil.</p></div>
  </section>`, me());
}

function authView(mode) {
  const reg = mode === 'register';
  $app.innerHTML = shell(`
  <form class="auth" id="auth" autocomplete="on">
    <h1>${reg ? 'Maak je account' : 'Welkom terug'}</h1>
    <p class="sub">${reg ? 'Start met je DJ link in bio.' : 'Log in om je links te beheren.'}</p>
    ${reg ? `<label class="f">Artiestennaam</label><input name="name" required maxlength="40" placeholder="DJ Naam">` : ''}
    <label class="f">Gebruikersnaam</label><input name="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" autocomplete="username" placeholder="djnaam">
    <label class="f">Wachtwoord</label><input name="password" type="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}">
    <div class="err" id="err"></div>
    <button class="btn primary">${reg ? 'Registreer' : 'Inloggen'}</button>
    <p class="alt">${reg ? 'Al een account? <a href="#/login">Inloggen</a>' : 'Nog geen account? <a href="#/register">Registreer</a>'}</p>
  </form>`, null);
  document.getElementById('auth').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), un = f.get('username').toLowerCase(), pw = f.get('password'), err = document.getElementById('err');
    const all = users();
    if (reg) {
      if (all[un]) return err.textContent = 'Deze gebruikersnaam is al bezet.';
      all[un] = { username: un, pass: await sha(un + ':' + pw), name: f.get('name').trim(), bio: '', theme: 'dark',
        links: [{ label: '🎧 Mijn nieuwste mix', url: '' }, { label: '📅 Boek mij', url: '' }] };
      save(DB, all);
    } else if (!all[un] || all[un].pass !== await sha(un + ':' + pw)) return err.textContent = 'Onjuiste gebruikersnaam of wachtwoord.';
    save(SES, un); go('#/dashboard');
  };
}

function dashboard() {
  const u = me(); if (!u) return go('#/login');
  const persist = () => { const all = users(); all[u.username] = u; save(DB, all); };
  const url = () => `${location.origin}${location.pathname}#/p/${b64e(pub(u))}`;
  const render = () => {
    $app.innerHTML = shell(`
    <div class="dash"><div>
      <div class="panel"><h3>Profiel</h3>
        <label class="f">Naam</label><input id="name" maxlength="40" value="${esc(u.name)}">
        <label class="f">Bio</label><textarea id="bio" rows="3" maxlength="160">${esc(u.bio)}</textarea>
        <label class="f">Thema</label><div class="themes">${Object.entries(THEMES).map(([k, v]) => `<button data-theme="${k}" class="${u.theme === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      </div>
      <div class="panel"><h3>Links</h3>
        ${u.links.map((l, i) => `<div class="item" data-i="${i}">
          <input data-f="label" placeholder="Titel" value="${esc(l.label)}"><input data-f="url" placeholder="https://…" value="${esc(l.url)}">
          <div class="acts"><button data-act="up" title="Omhoog">↑</button><button data-act="down" title="Omlaag">↓</button><button data-act="del" title="Verwijder">✕</button></div></div>`).join('')}
        <div class="row" style="margin-top:12px"><button class="btn sm primary" data-act="add">+ Link toevoegen</button>
        <select id="preset" style="width:auto"><option value="">Preset…</option>${PRESETS.map(p => `<option>${p}</option>`).join('')}</select></div>
      </div>
      <div class="panel"><h3>Jouw link</h3>
        <p style="color:var(--muted);font-size:.9rem;margin-bottom:10px">Deze link bevat je pagina en werkt op elk toestel. Plak ze in je bio. Wijzig je iets, kopieer dan opnieuw.</p>
        <div class="share"><input id="share" readonly><button class="btn primary sm" data-act="copy">Kopieer</button></div></div>
      <button class="btn danger sm" data-act="delete">Account verwijderen</button>
    </div>
    <div class="sticky"><div class="preview t-${u.theme}" id="prev">${profileHtml(u)}</div></div></div>`, u);
    refresh();
  };
  const refresh = () => {
    const p = document.getElementById('prev'); p.className = 'preview t-' + u.theme; p.innerHTML = profileHtml(u);
    document.getElementById('share').value = url();
  };
  render();
  $app.onclick = e => {
    const b = e.target.closest('[data-act],[data-theme]'); if (!b) return;
    const i = +b.closest('.item')?.dataset.i, a = b.dataset.act;
    if (b.dataset.theme) { u.theme = b.dataset.theme; persist(); return render(); }
    if (a === 'add') u.links.push({ label: '', url: '' });
    else if (a === 'del') u.links.splice(i, 1);
    else if (a === 'up' && i > 0) [u.links[i - 1], u.links[i]] = [u.links[i], u.links[i - 1]];
    else if (a === 'down' && i < u.links.length - 1) [u.links[i + 1], u.links[i]] = [u.links[i], u.links[i + 1]];
    else if (a === 'copy') { navigator.clipboard?.writeText(url()).then(() => toast('Link gekopieerd'), () => document.getElementById('share').select()); return; }
    else if (a === 'logout') { localStorage.removeItem(SES); return go('#/'); }
    else if (a === 'delete') { if (!confirm('Account definitief verwijderen?')) return; const all = users(); delete all[u.username]; save(DB, all); localStorage.removeItem(SES); return go('#/'); }
    else return;
    persist(); render();
  };
  $app.oninput = e => {
    const t = e.target;
    if (t.id === 'name') u.name = t.value; else if (t.id === 'bio') u.bio = t.value;
    else if (t.dataset.f) u.links[+t.closest('.item').dataset.i][t.dataset.f] = t.value;
    else return;
    persist(); refresh();
  };
  $app.onchange = e => {
    if (e.target.id !== 'preset' || !e.target.value) return;
    u.links.push({ label: e.target.value, url: '' }); persist(); render();
  };
}

function profile(u) {
  if (!u) { $app.innerHTML = shell(`<div class="auth"><h1>Pagina niet gevonden</h1><p class="sub">Deze link bestaat niet of is ongeldig.</p><a class="btn primary" href="#/">Naar home</a></div>`, me()); return; }
  document.title = `${u.name} — Linked`;
  $app.innerHTML = `<div class="page themed t-${esc(THEMES[u.theme] ? u.theme : 'dark')}"><div class="col">${profileHtml(u)}<div class="brandtag"><a href="#/register">Maak je eigen DJ link in bio</a></div></div></div>`;
}

function route() {
  $app.onclick = $app.oninput = $app.onchange = null;
  document.title = 'Linked — Link in bio voor DJ\'s';
  const h = location.hash.replace(/^#/, '') || '/';
  const user = me();
  if (h.startsWith('/p/')) { try { profile(unpub(b64d(h.slice(3)))); } catch { profile(null); } }
  else if (h.startsWith('/@')) profile(users()[h.slice(2).toLowerCase()]);
  else if (h === '/login') user ? go('#/dashboard') : authView('login');
  else if (h === '/register') user ? go('#/dashboard') : authView('register');
  else if (h === '/dashboard') dashboard();
  else home();
  if (!h.startsWith('/p/') && !h.startsWith('/@')) $app.querySelector('[data-act=logout]')?.addEventListener('click', () => { localStorage.removeItem(SES); go('#/'); });
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
})();
