// ============================================================
// PreisWächter — popup.js
// All JS separated from HTML to comply with MV3 CSP
// ============================================================
'use strict';

const ICONS = { electronics:'🔌', gaming:'🎮', home:'🏠', fashion:'👕', books:'📚', sports:'⚽', beauty:'💄', other:'📦' };
let watchlist = [];

// ── HELPERS ────────────────────────────────────────────────
//
// buyScore — realistischer Kaufzeitpunkt-Score (0–100)
//
// Faktoren und Gewichtung:
//  A) Position im Preis-Range (40 Punkte)
//     Wo liegt der aktuelle Preis zwischen Tief und Hoch?
//     100% = am Tief → volle 40 Punkte
//       0% = am Hoch  → 0 Punkte
//     Realistisch: Preise schwanken meist ±15% — auch 10% über
//     dem Tief ist noch ein guter Zeitpunkt.
//
//  B) Vergleich mit 90-Tage-Durchschnitt (25 Punkte)
//     Unter Durchschnitt → volle 25 Punkte
//     Bis 10% drüber     → anteilig bis 0
//     Weit drüber        → 0
//
//  C) Kurzzeit-Trend: letzte 14 Tage (20 Punkte)
//     Preis fällt gerade → 20 Punkte (günstiger Einstieg)
//     Preis steigt       → 0  Punkte (lieber abwarten)
//
//  D) Zielpreis erreicht (15 Punkte Bonus)
//     Harter Bonus wenn aktueller Preis ≤ Zielpreis
//
function buyScore(history, current, target) {
  if (!history || history.length === 0) return 50;

  const low  = Math.min(...history);
  const high = Math.max(...history);
  const avg  = history.reduce((a, b) => a + b, 0) / history.length;
  const range = high - low;

  // ── A) Position im Range (0–40) ──────────────────────────
  // 0 = am Hoch, 40 = am Tief
  // Mit Toleranz: bis 10% über dem Tief gibt es noch fast voll Punkte
  let scoreA = 0;
  if (range > 0) {
    // clamp handles new all-time highs outside history range
    const clampedCurrent = Math.min(Math.max(current, low), high);
    const pctFromLow = (clampedCurrent - low) / range; // 0=Tief, 1=Hoch
    scoreA = Math.round(40 * Math.pow(1 - pctFromLow, 0.6));
  } else {
    scoreA = 20; // kein Range bekannt → neutral
  }

  // ── B) vs. 90-Tage-Durchschnitt (0–25) ──────────────────
  let scoreB = 0;
  if (avg > 0) {
    const diffPct = (current - avg) / avg; // negativ = unter Durchschnitt
    if (diffPct <= 0) {
      // Unter oder am Schnitt: voll bis leicht über → interpoliert
      scoreB = Math.round(25 * Math.min(1, 1 - diffPct * 2));
    } else if (diffPct <= 0.10) {
      // Bis 10% über Schnitt → anteilig
      scoreB = Math.round(25 * (1 - diffPct / 0.10));
    } else {
      scoreB = 0;
    }
  } else {
    scoreB = 12;
  }

  // ── C) Kurzzeit-Trend letzte 14 Tage (0–20) ─────────────
  let scoreC = 0;
  if (history.length >= 7) {
    const recent = history.slice(-14);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trendPct = (current - recentAvg) / recentAvg;
    if (trendPct < -0.03)      scoreC = 20; // fällt stark  → kaufen
    else if (trendPct < 0)     scoreC = 14; // fällt leicht → gut
    else if (trendPct < 0.03)  scoreC = 8;  // stabil       → ok
    else                       scoreC = 0;  // steigt       → warten
  } else {
    scoreC = 10; // zu wenig Daten → neutral
  }

  // ── D) Zielpreis-Bonus (0–15) ────────────────────────────
  let scoreD = 0;
  if (current <= target)                    scoreD = 15;
  else if (current <= target * 1.05)        scoreD = 10; // bis 5% drüber
  else if (current <= target * 1.10)        scoreD = 5;  // bis 10% drüber

  const total = scoreA + scoreB + scoreC + scoreD;
  return Math.max(0, Math.min(100, total));
}

function calcStats(history, current) {
  if (!history || history.length === 0) return { low: current, high: current, avg: current };
  return {
    low:  Math.min(...history),
    high: Math.max(...history),
    avg:  history.reduce((a, b) => a + b, 0) / history.length,
  };
}

function saveWatchlist() {
  chrome.runtime.sendMessage({ type: 'SAVE_WATCHLIST', watchlist });
}

// ── TAB SWITCH ─────────────────────────────────────────────
function switchTab(t) {
  document.querySelectorAll('.tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === t)
  );
  ['watchlist', 'alerts', 'settings'].forEach(id => {
    document.getElementById(`tab-${id}`).style.display = id === t ? 'block' : 'none';
  });
  if (t === 'alerts') renderAlerts();
}

// ── LOAD DATA ──────────────────────────────────────────────
function loadData() {
  chrome.runtime.sendMessage({ type: 'GET_WATCHLIST' }, (res) => {
    watchlist = res.watchlist || [];
    const sync = res.lastCartSync;
    if (sync) {
      const mins = Math.round((Date.now() - sync) / 60000);
      document.getElementById('sync-text').textContent =
        `Zuletzt synchronisiert vor ${mins < 1 ? '<1' : mins} Min. — ${watchlist.length} Artikel`;
    }
    renderWatchlist();
    updateStats();
  });
}

// ── STATS ──────────────────────────────────────────────────
function updateStats() {
  let buyCount = 0, savings = 0;
  watchlist.forEach(p => {
    if (buyScore(p.history, p.price, p.target) >= 65) buyCount++;
    if (p.price > p.target) savings += p.price - p.target;
  });
  document.getElementById('s-total').textContent = watchlist.length;
  document.getElementById('s-buy').textContent   = buyCount;
  document.getElementById('s-save').textContent  = savings.toFixed(0) + '€';
}

// ── WATCHLIST RENDER ───────────────────────────────────────
function renderWatchlist() {
  const el = document.getElementById('watchlist-content');

  if (watchlist.length === 0) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">Warenkorb noch nicht importiert</div>
        <div class="empty-sub">So geht's:</div>
      </div>
      <div class="steps">
        <div class="step"><div class="step-num">1</div><div class="step-text">Klicke oben auf <strong>„Warenkorb öffnen"</strong></div></div>
        <div class="step"><div class="step-num">2</div><div class="step-text">Logge dich bei <strong>Amazon.it</strong> ein und öffne deinen Warenkorb</div></div>
        <div class="step"><div class="step-num">3</div><div class="step-text">Klicke den orangenen <strong>„Importa carrello"</strong> Button unten rechts</div></div>
        <div class="step"><div class="step-num">4</div><div class="step-text">Artikel erscheinen automatisch hier in der Watchlist</div></div>
      </div>`;
    return;
  }

  el.innerHTML = watchlist.map((p, i) => {
    const score = buyScore(p.history, p.price, p.target);
    const stats = calcStats(p.history, p.price);
    const color = score >= 65 ? '#22c55e' : score >= 42 ? '#f59e0b' : '#ef4444';
    let rec, cls;
    if      (score >= 65) { rec = '✅ ACQUISTA ORA';  cls = 'rec-buy'; }
    else if (score >= 42) { rec = '⏳ ASPETTA';       cls = 'rec-wait'; }
    else                  { rec = '❌ TROPPO CARO';   cls = 'rec-bad'; }

    const atLow    = p.price <= stats.low * 1.02;
    const onTarget = p.price <= p.target;

    return `<div class="product" data-index="${i}">
      <div class="prod-row1">
        <div class="prod-img">
          ${p.image ? `<img src="${p.image}" alt="">` : (ICONS[p.category] || '📦')}
        </div>
        <div class="prod-info">
          <div class="prod-name" title="${p.name}">${p.name}</div>
          <div class="prod-meta">
            ${p.asin} · ${p.category}
            ${atLow    ? ' · <span style="color:#22c55e">🏆 Minimo</span>' : ''}
            ${onTarget ? ' · <span style="color:#ff6b35">🎯 Obiettivo</span>' : ''}
          </div>
        </div>
        <button class="btn-remove" data-action="remove" data-index="${i}" title="Rimuovi">✕</button>
      </div>

      <div class="prod-prices">
        <div class="price-chip price-current">
          <div class="pv">${p.price.toFixed(2)}€</div><div class="pl">Attuale</div>
        </div>
        <div class="price-chip price-low">
          <div class="pv">${stats.low.toFixed(2)}€</div><div class="pl">Minimo</div>
        </div>
        <div class="price-chip price-target">
          <div class="pv">${p.target.toFixed(2)}€</div><div class="pl">Obiettivo</div>
        </div>
      </div>

      <div class="score-row">
        <div style="font-size:9px;font-family:'Inter',sans-serif;color:var(--text-muted);width:60px;">PUNTEGGIO</div>
        <div class="score-bar">
          <div class="score-fill" style="width:${score}%;background:${color};"></div>
        </div>
        <div class="score-val" style="color:${color}">${score}</div>
      </div>

      <div class="prod-actions">
        <span class="rec-badge ${cls}">${rec}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn-small" data-action="analyze" data-index="${i}">📊 Analisi</button>
          ${p.asin ? `<a href="https://www.amazon.it/dp/${p.asin}" target="_blank" style="text-decoration:none"><button class="btn-small" style="border-color:rgba(255,107,53,0.4);color:var(--accent);">→</button></a>` : ''}
        </div>
      </div>

      <div class="target-row">
        <input class="target-input" type="number" step="0.01" placeholder="Modifica prezzo obiettivo..." data-index="${i}" />
        <button class="btn-save" data-action="save-target" data-index="${i}">Salva</button>
      </div>
    </div>`;
  }).join('');

  // Attach delegated events to the watchlist container
  el.addEventListener('click', handleWatchlistClick);
}

// ── EVENT DELEGATION (replaces all onclick= attributes) ───
function handleWatchlistClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const idx    = parseInt(btn.dataset.index);

  if (action === 'remove')  removeItem(idx);
  if (action === 'analyze') openAnalysis(idx);
  if (action === 'save-target') {
    // find the input in the same .product card
    const card  = btn.closest('.product');
    const input = card.querySelector('.target-input');
    saveTarget(idx, input);
  }
}

// ── CRUD ───────────────────────────────────────────────────
function saveTarget(i, input) {
  const val = parseFloat(input.value);
  if (isNaN(val) || val <= 0) return;
  watchlist[i].target = val;
  input.value = '';
  saveWatchlist();
  renderWatchlist();
  updateStats();
}

function removeItem(i) {
  watchlist.splice(i, 1);
  saveWatchlist();
  renderWatchlist();
  updateStats();
}

function clearWatchlist() {
  if (!confirm('Rimuovere tutti gli articoli?')) return;
  watchlist = [];
  saveWatchlist();
  renderWatchlist();
  updateStats();
}

// ── ALERTS RENDER ──────────────────────────────────────────
function renderAlerts() {
  const el = document.getElementById('alerts-content');
  const alerts = [];

  watchlist.forEach(p => {
    const score = buyScore(p.history, p.price, p.target);
    const stats = calcStats(p.history, p.price);
    if (p.price <= p.target)       alerts.push({ icon:'🎯', p, msg:`Prezzo obiettivo raggiunto! ${p.price.toFixed(2)}€ ≤ ${p.target.toFixed(2)}€` });
    if (p.price <= stats.low*1.02) alerts.push({ icon:'🏆', p, msg:`Minimo storico! Prezzo più basso degli ultimi 90 giorni.` });
    if (score >= 65)               alerts.push({ icon:'✅', p, msg:`Punteggio KI ${score}/100 — Acquisto consigliato ora.` });
  });

  if (alerts.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:40px 0;">
      <div class="empty-icon">🔕</div>
      <div class="empty-title">Nessun alert attivo</div>
      <div class="empty-sub">Gli alert appariranno qui quando i prezzi scendono.</div>
    </div>`;
    return;
  }

  el.innerHTML = alerts.map(a => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <span style="font-size:18px;">${a.icon}</span>
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:3px;">${a.p.name}</div>
          <div style="font-size:11px;font-family:'Inter',sans-serif;color:var(--text-dim);">${a.msg}</div>
        </div>
      </div>
    </div>`).join('');
}

// ── OPEN AMAZON CART ───────────────────────────────────────
function openAmazonCart() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const current = tabs[0]?.url || '';
    if (current.includes('amazon.it')) {
      chrome.tabs.update(tabs[0].id, { url: 'https://www.amazon.it/gp/cart/view.html' });
    } else {
      chrome.tabs.create({ url: 'https://www.amazon.it/gp/cart/view.html' });
    }
    window.close();
  });
}

// ── ANALYSE (rein algorithmisch, kein API Key nötig) ───────

function buildAnalysis(p) {
  const stats  = calcStats(p.history, p.price);
  const score  = buyScore(p.history, p.price, p.target);
  const range  = stats.high - stats.low;

  // ── Empfehlung ──────────────────────────────────────────
  let empfehlung, empfColor, empfEmoji;
  if      (score >= 65) { empfehlung = 'ACQUISTA ORA';  empfColor = '#22c55e'; empfEmoji = '✅'; }
  else if (score >= 42) { empfehlung = 'ASPETTA';       empfColor = '#f59e0b'; empfEmoji = '⏳'; }
  else                  { empfehlung = 'TROPPO CARO';   empfColor = '#ef4444'; empfEmoji = '❌'; }

  // ── Preis-Position ──────────────────────────────────────
  const pctFromLow  = range > 0 ? ((p.price - stats.low)  / range * 100).toFixed(0) : 50;
  const pctFromHigh = range > 0 ? ((stats.high - p.price) / range * 100).toFixed(0) : 50;
  const vsAvg       = ((p.price - stats.avg) / stats.avg * 100);
  const vsAvgStr    = vsAvg <= 0
    ? `${Math.abs(vsAvg).toFixed(1)}% sotto la media`
    : `${vsAvg.toFixed(1)}% sopra la media`;

  // ── Trend ───────────────────────────────────────────────
  let trendLabel, trendColor;
  if (p.history.length >= 7) {
    const recent   = p.history.slice(-14);
    const rAvg     = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trendPct = (p.price - rAvg) / rAvg * 100;
    if      (trendPct < -3)  { trendLabel = `↘ In calo (${Math.abs(trendPct).toFixed(1)}%)`;  trendColor = '#22c55e'; }
    else if (trendPct < 0)   { trendLabel = `↘ Legg. in calo`;                                 trendColor = '#22c55e'; }
    else if (trendPct < 3)   { trendLabel = `→ Stabile`;                                       trendColor = '#f59e0b'; }
    else                     { trendLabel = `↗ In aumento (${trendPct.toFixed(1)}%)`;           trendColor = '#ef4444'; }
  } else {
    trendLabel = '→ Dati insufficienti'; trendColor = '#6b6b80';
  }

  // ── Rischio ─────────────────────────────────────────────
  const volatility = range > 0 ? (range / stats.avg * 100) : 0;
  let rischio, rischioColor;
  if      (volatility < 10) { rischio = 'BASSO';  rischioColor = '#22c55e'; }
  else if (volatility < 25) { rischio = 'MEDIO';  rischioColor = '#f59e0b'; }
  else                      { rischio = 'ALTO';   rischioColor = '#ef4444'; }

  // ── Begründung (regelbasiert) ───────────────────────────
  const reasons = [];
  if (p.price <= stats.low * 1.02)  reasons.push('vicino al minimo storico');
  if (vsAvg <= 0)                    reasons.push(`${Math.abs(vsAvg).toFixed(1)}% sotto la media`);
  if (p.price <= p.target)           reasons.push('prezzo obiettivo raggiunto');
  if (p.price >= stats.high * 0.97)  reasons.push('vicino al massimo storico');
  if (vsAvg > 10)                    reasons.push(`${vsAvg.toFixed(1)}% sopra la media`);

  let begruendung;
  if (reasons.length > 0) {
    begruendung = `Prezzo ${reasons.join(' e ')}. `;
  } else {
    begruendung = `Prezzo nella fascia media del range storico. `;
  }
  begruendung += score >= 65
    ? 'È un buon momento per acquistare.'
    : score >= 42
      ? 'Conviene attendere un ulteriore calo.'
      : 'Prezzo troppo alto rispetto alla storia.';

  // ── Kaufzeitpunkt ───────────────────────────────────────
  const month = new Date().getMonth();
  let timing;
  if      (p.price <= p.target)      timing = 'Adesso — prezzo obiettivo raggiunto!';
  else if (p.price <= stats.low*1.05) timing = 'Adesso — vicino al minimo storico';
  else if (month >= 10)               timing = 'Black Friday (nov.) o Natale';
  else if (month >= 6 && month <= 8)  timing = 'Amazon Prime Day o fine estate';
  else if (vsAvg > 5)                 timing = 'Aspetta un calo del 5–10%';
  else                                timing = 'Prossime settimane se il trend continua';

  // ── Risparmio potenziale ────────────────────────────────
  const savingToTarget = p.price > p.target ? (p.price - p.target).toFixed(2) : '0.00';
  const savingToLow    = p.price > stats.low ? (p.price - stats.low).toFixed(2) : '0.00';

  return {
    score, empfehlung, empfColor, empfEmoji, begruendung,
    timing, trendLabel, trendColor, rischio, rischioColor,
    vsAvgStr, pctFromLow, pctFromHigh, savingToTarget, savingToLow,
    stats,
  };
}

function openAnalysis(i) {
  const p   = watchlist[i];
  const a   = buildAnalysis(p);

  document.getElementById('ai-title').textContent =
    p.name.slice(0, 40) + (p.name.length > 40 ? '…' : '');

  // Hide spinner immediately — no async needed
  document.getElementById('ai-loading').style.display = 'none';
  document.getElementById('ai-result').classList.add('show');

  document.getElementById('ai-score-row').innerHTML = `
    <div class="score-circle"
         style="background:${a.empfColor}22;border:2px solid ${a.empfColor};color:${a.empfColor}">
      ${a.score}
    </div>
    <div>
      <div style="font-size:16px;font-weight:800;color:${a.empfColor};margin-bottom:6px;">
        ${a.empfEmoji} ${a.empfehlung}
      </div>
      <div style="font-size:11px;font-family:'Inter',sans-serif;color:var(--text-dim);line-height:1.6;">
        ${a.begruendung}
      </div>
    </div>`;

  // Score breakdown bar
  document.getElementById('ai-text').innerHTML = `
    <div style="margin-bottom:12px;">
      ${scoreBar('Posizione nel range', a.pctFromLow <= 30 ? 80 : a.pctFromLow <= 60 ? 50 : 20, '#ff6b35')}
      ${scoreBar('Vs. media 90 giorni', a.stats.avg > 0 ? Math.round(Math.max(0, 100 - (p.price - a.stats.avg) / a.stats.avg * 200)) : 50, '#00d4aa')}
      ${scoreBar('Trend 14 giorni',     a.trendColor === '#22c55e' ? 85 : a.trendColor === '#f59e0b' ? 50 : 15, a.trendColor)}
    </div>`;

  document.getElementById('ai-grid').innerHTML = `
    <div class="ai-fact">
      <div class="ai-fact-lbl">Momento migliore</div>
      <div class="ai-fact-val" style="font-size:10px;line-height:1.4">${a.timing}</div>
    </div>
    <div class="ai-fact">
      <div class="ai-fact-lbl">Trend attuale</div>
      <div class="ai-fact-val" style="color:${a.trendColor};font-size:11px">${a.trendLabel}</div>
    </div>
    <div class="ai-fact">
      <div class="ai-fact-lbl">Rischio volatilità</div>
      <div class="ai-fact-val" style="color:${a.rischioColor}">${a.rischio}</div>
    </div>
    <div class="ai-fact">
      <div class="ai-fact-lbl">Risparmio potenziale</div>
      <div class="ai-fact-val" style="font-size:11px">
        ${a.savingToTarget > 0 ? `vs obiettivo: <span style="color:#00d4aa">−${a.savingToTarget}€</span>` : '✅ Obiettivo raggiunto'}
      </div>
    </div>
    <div class="ai-fact" style="grid-column:1/-1">
      <div class="ai-fact-lbl">Range storico 90 giorni</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="font-family:'Inter',sans-serif;font-size:11px;color:#22c55e">${a.stats.low.toFixed(2)}€</span>
        <div style="flex:1;height:6px;background:var(--border);border-radius:3px;position:relative;">
          <div style="position:absolute;height:100%;border-radius:3px;
            left:0;width:${Math.min(100, parseInt(a.pctFromLow))}%;
            background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);"></div>
          <div style="position:absolute;top:-4px;width:14px;height:14px;border-radius:50%;
            background:white;border:2px solid #ff6b35;transform:translateX(-50%);
            left:${Math.min(100, parseInt(a.pctFromLow))}%;"></div>
        </div>
        <span style="font-family:'Inter',sans-serif;font-size:11px;color:#ef4444">${a.stats.high.toFixed(2)}€</span>
      </div>
      <div style="font-family:'Inter',sans-serif;font-size:10px;color:var(--text-muted);margin-top:4px;text-align:center;">
        Prezzo attuale ${a.vsAvgStr} · ${a.pctFromLow}% dal minimo
      </div>
    </div>`;

  document.getElementById('ai-overlay').classList.add('open');
}

function scoreBar(label, pct, color) {
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    <div style="width:120px;font-size:10px;font-family:'Inter',sans-serif;color:var(--text-muted);flex-shrink:0;">${label}</div>
    <div style="flex:1;height:4px;background:var(--border);border-radius:2px;">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;transition:width 0.6s ease;"></div>
    </div>
    <div style="width:28px;text-align:right;font-size:10px;font-family:'Inter',sans-serif;color:${color}">${pct}</div>
  </div>`;
}

// ── THEME ──────────────────────────────────────────────────
function applyTheme(isLight) {
  document.documentElement.classList.toggle('light', isLight);
  const btn = document.getElementById('btn-theme');
  const tgl = document.getElementById('tgl-theme');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
  if (tgl) tgl.classList.toggle('on', isLight);
}

function loadTheme() {
  chrome.storage.local.get(['theme'], (res) => {
    applyTheme(res.theme === 'light');
  });
}

function toggleTheme() {
  const isLight = !document.documentElement.classList.contains('light');
  applyTheme(isLight);
  chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
}

function closeAIOverlay() {
  document.getElementById('ai-overlay').classList.remove('open');
}

// ── WIRE UP ALL STATIC ELEMENTS ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Load and apply saved theme immediately
  loadTheme();

  // Header theme button
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // Settings theme toggle (synced with header button)
  document.getElementById('tgl-theme').addEventListener('click', toggleTheme);

  // Header cart button
  document.getElementById('btn-open-cart').addEventListener('click', openAmazonCart);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Other toggles in settings — skip tgl-theme (already wired above)
  document.querySelectorAll('.toggle:not(#tgl-theme)').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('on'));
  });

  // Clear watchlist button
  document.getElementById('btn-clear').addEventListener('click', clearWatchlist);

  // AI modal close button
  document.getElementById('btn-ai-close').addEventListener('click', closeAIOverlay);

  // AI overlay background click
  document.getElementById('ai-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'ai-overlay') closeAIOverlay();
  });

  // Load data
  loadData();
});
