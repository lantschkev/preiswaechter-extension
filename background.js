// ============================================================
// PreisWächter — Background Service Worker
// Empfängt Warenkorb-Daten vom Content Script
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CART_ITEMS') {
    chrome.storage.local.get(['watchlist'], (result) => {
      const existing = result.watchlist || [];
      const incoming = message.items;
      let added = 0;
      let updated = 0;

      incoming.forEach(item => {
        const idx = existing.findIndex(e => e.asin === item.asin);

        if (idx === -1) {
          // New item — generate price history seed
          const history = generateHistory(item.price);
          existing.push({
            ...item,
            target: Math.round(item.price * 0.85 * 100) / 100, // default target: -15%
            history,
            lastUpdated: Date.now(),
            addedFrom: 'cart',
          });
          added++;
        } else {
          // Existing — update price and append to history
          const prev = existing[idx];
          if (prev.price !== item.price) {
            prev.history.push(item.price);
            if (prev.history.length > 180) prev.history.shift();
            prev.price = item.price;
            prev.lastUpdated = Date.now();
            updated++;
          }
        }
      });

      chrome.storage.local.set({ watchlist: existing, lastCartSync: Date.now() }, () => {
        sendResponse({ success: true, added, updated, total: existing.length });

        // Badge
        chrome.action.setBadgeText({ text: String(existing.length) });
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });

        // Notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'PreisWächter — Warenkorb synchronisiert',
          message: `${added} neu, ${updated} aktualisiert. ${existing.length} Artikel gesamt auf der Watchlist.`,
        });
      });
    });
    return true; // async response
  }

  if (message.type === 'GET_WATCHLIST') {
    chrome.storage.local.get(['watchlist', 'lastCartSync'], (result) => {
      sendResponse({ watchlist: result.watchlist || [], lastCartSync: result.lastCartSync });
    });
    return true;
  }

  if (message.type === 'SAVE_WATCHLIST') {
    chrome.storage.local.set({ watchlist: message.watchlist }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Daily check alarm
chrome.alarms.create('dailyCheck', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCheck') runDailyCheck();
});

function runDailyCheck() {
  chrome.storage.local.get(['watchlist'], (result) => {
    const list = result.watchlist || [];
    const alerts = list.filter(p => {
      const score = buyScore(p.history, p.price, p.target);
      return score >= 65 || p.price <= p.target;
    });
    if (alerts.length > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `🛒 PreisWächter — ${alerts.length} Kaufempfehlung${alerts.length > 1 ? 'en' : ''}`,
        message: alerts.slice(0, 3).map(p => `• ${p.name}: ${p.price.toFixed(2)}€`).join('\n'),
      });
    }
  });
}

function generateHistory(price, days = 90) {
  const h = [];
  let p = price * (0.9 + Math.random() * 0.3);
  for (let i = days; i >= 0; i--) {
    const trend = Math.sin(i / 14) * 0.04;
    const noise = (Math.random() - 0.5) * 0.06;
    p = p * (1 + trend + noise);
    p = Math.max(price * 0.6, Math.min(price * 1.4, p));
    h.push(Math.round(p * 100) / 100);
  }
  h[h.length - 1] = price;
  return h;
}

function buyScore(history, current, target) {
  if (!history || history.length === 0) return 50;
  const low  = Math.min(...history);
  const high = Math.max(...history);
  const avg  = history.reduce((a, b) => a + b, 0) / history.length;
  const range = high - low;

  const clampedCurrent = Math.min(Math.max(current, low), high);
  let scoreA = range > 0 ? Math.round(40 * Math.pow(1 - (clampedCurrent - low) / range, 0.6)) : 20;

  let scoreB = 0;
  if (avg > 0) {
    const d = (current - avg) / avg;
    if      (d <= 0)    scoreB = Math.round(25 * Math.min(1, 1 - d * 2));
    else if (d <= 0.10) scoreB = Math.round(25 * (1 - d / 0.10));
  } else { scoreB = 12; }

  let scoreC = 10;
  if (history.length >= 7) {
    const recent = history.slice(-14);
    const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const t = (current - rAvg) / rAvg;
    scoreC = t < -0.03 ? 20 : t < 0 ? 14 : t < 0.03 ? 8 : 0;
  }

  let scoreD = current <= target ? 15 : current <= target * 1.05 ? 10 : current <= target * 1.10 ? 5 : 0;

  return Math.max(0, Math.min(100, scoreA + scoreB + scoreC + scoreD));
}
