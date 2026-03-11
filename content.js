// ============================================================
// PreisWächter — Content Script
// Läuft auf Amazon Warenkorb-Seiten und liest Artikel aus
// ============================================================

(function () {
  'use strict';

  // Inject floating badge button into Amazon cart page
  function injectBadge() {
    if (document.getElementById('pw-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'pw-badge';
    badge.innerHTML = `
      <div id="pw-badge-inner">
        <span id="pw-badge-icon">👁</span>
        <span id="pw-badge-label">Warenkorb importieren</span>
        <span id="pw-badge-count"></span>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #pw-badge {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #pw-badge-inner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #ff6b35, #e55a28);
        color: white;
        padding: 12px 20px;
        border-radius: 50px;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(255,107,53,0.45);
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s;
        user-select: none;
        border: 2px solid rgba(255,255,255,0.2);
      }
      #pw-badge-inner:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(255,107,53,0.6);
      }
      #pw-badge-inner:active { transform: translateY(0); }
      #pw-badge-count {
        background: white;
        color: #ff6b35;
        border-radius: 50px;
        padding: 1px 8px;
        font-size: 12px;
        font-weight: 700;
        display: none;
      }
      #pw-toast {
        position: fixed;
        bottom: 100px;
        right: 28px;
        background: #111118;
        color: #e8e8f0;
        border: 1px solid #1e1e2e;
        border-radius: 12px;
        padding: 14px 20px;
        font-size: 13px;
        z-index: 99999;
        max-width: 320px;
        line-height: 1.5;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        animation: pwSlideIn 0.3s ease;
        display: none;
      }
      @keyframes pwSlideIn {
        from { transform: translateY(10px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(badge);

    badge.addEventListener('click', extractAndSendCart);

    // Show item count
    const items = extractCartItems();
    if (items.length > 0) {
      const cnt = document.getElementById('pw-badge-count');
      cnt.textContent = items.length;
      cnt.style.display = 'inline';
    }
  }

  // ── EXTRACT CART ITEMS ───────────────────────────────────
  function extractCartItems() {
    const items = [];
    const seenAsins = new Set(); // prevent duplicates

    // ── STRATEGY 1: Only look inside the active cart container ──
    // Amazon wraps actual cart items in #sc-active-cart or .sc-your-amazon-cart-is-empty
    // "Saved for later" lives in #sc-saved-cart — we explicitly exclude it
    // Recommendation widgets live in #similarities-widget, #rhf — also excluded
    const CART_ROOTS = [
      '#sc-active-cart',
      '#activeCartViewForm',
      '.sc-list-item-content',   // fallback if no wrapper found
    ];
    const EXCLUDED_ROOTS = [
      '#sc-saved-cart',          // "Salvato per dopo" / "Für später gespeichert"
      '#similarities-widget',    // "Spesso acquistati insieme"
      '#rhf',                    // right-hand recommendations
      '.similarities-widget',
      '[data-feature-id="desktop-dpx-widget"]',
    ];

    // Build an exclusion set of all elements inside excluded roots
    const excludedEls = new Set();
    EXCLUDED_ROOTS.forEach(sel => {
      document.querySelectorAll(sel).forEach(root => {
        root.querySelectorAll('[data-asin]').forEach(el => excludedEls.add(el));
      });
    });

    // Try each cart root selector until we find items
    let cartRoot = null;
    for (const sel of CART_ROOTS) {
      cartRoot = document.querySelector(sel);
      if (cartRoot) break;
    }

    // If no specific root found, fall back to full document but still exclude
    const searchRoot = cartRoot || document;

    // ── STRATEGY 2: Look for actual cart line items ──
    // sc-list-item is the standard Amazon cart row class
    // We also require a quantity selector to confirm it's a real cart item
    const candidates = searchRoot.querySelectorAll(
      '.sc-list-item[data-asin], [data-asin][class*="sc-list-item"]'
    );

    candidates.forEach(el => {
      if (excludedEls.has(el)) return; // skip saved-for-later and recommendations

      try {
        const asin = el.getAttribute('data-asin') || '';
        if (!asin || asin.length !== 10) return;
        if (seenAsins.has(asin)) return; // skip duplicates

        // Must have a quantity control — confirms it's a real cart item, not a widget
        const qtyEl = el.querySelector(
          'select[name^="quantity"], input[name^="quantity"], .a-dropdown-container'
        );
        if (!qtyEl) return;

        const nameEl = el.querySelector(
          '.sc-product-title, [data-feature-id="title"] span, .a-truncate-full, span[id*="item-title"]'
        );
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name) return;

        let priceText = '';
        const priceSelectors = [
          '.sc-price', '.sc-product-price',
          '[data-feature-id="price"] .a-offscreen',
          '.a-price .a-offscreen', 'span.a-color-price',
        ];
        for (const sel of priceSelectors) {
          const found = el.querySelector(sel);
          if (found && found.textContent.trim()) {
            priceText = found.textContent.trim();
            break;
          }
        }
        // Fallback: split whole + fraction
        if (!priceText) {
          const whole = el.querySelector('.a-price-whole');
          const fraction = el.querySelector('.a-price-fraction');
          if (whole) priceText = whole.textContent.replace(/[^\d]/g, '') + '.' + (fraction ? fraction.textContent.trim() : '00');
        }

        const price = parsePrice(priceText);
        if (!price || price <= 0) return;

        const imgEl = el.querySelector('img.sc-product-image, img[data-a-image-name]');
        const qty = parseInt(qtyEl.value || qtyEl.textContent) || 1;

        seenAsins.add(asin);
        items.push({ asin, name, price, image: imgEl ? imgEl.src : '', qty, category: guessCategory(name) });

      } catch (e) { }
    });

    // ── STRATEGY 3: Fallback for React-based cart layout ──
    if (items.length === 0) {
      document.querySelectorAll('[id^="sc-item-"]').forEach(el => {
        // Skip if inside an excluded section
        if (EXCLUDED_ROOTS.some(sel => el.closest(sel))) return;
        try {
          const asin = el.id.replace('sc-item-', '').split('-')[0];
          if (!asin || asin.length !== 10 || seenAsins.has(asin)) return;
          const nameEl = el.querySelector('span[id*="item-title"], .a-size-medium');
          const name = nameEl ? nameEl.textContent.trim() : '';
          const priceEl = el.querySelector('.sc-price, .a-color-price');
          const price = parsePrice(priceEl ? priceEl.textContent : '');
          const qtyEl = el.querySelector('select[name^="quantity"], input[name^="quantity"]');
          if (!qtyEl) return; // must have qty control
          if (asin && name && price > 0) {
            seenAsins.add(asin);
            items.push({ asin, name, price, image: '', qty: parseInt(qtyEl.value) || 1, category: guessCategory(name) });
          }
        } catch (e) { }
      });
    }

    return items;
  }

  function parsePrice(str) {
    if (!str) return 0;
    // Handles: "1.299,99 €" (IT/DE) and "€1,299.99" (US) and "29.99"
    let s = str.replace(/[€$£\s]/g, '').trim();
    // Italian/German: dot as thousands separator, comma as decimal → "1.299,99"
    if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    // US: comma as thousands separator, dot as decimal → "1,299.99"
    else if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(s)) {
      s = s.replace(/,/g, '');
    }
    // Fallback: strip everything except digits and last separator
    else {
      s = s.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
    }
    return parseFloat(s) || 0;
  }

  function guessCategory(name) {
    const n = name.toLowerCase();
    if (/headphone|kopfhörer|cuffie|auricolare|earphone|airpod|earbud|speaker|lautsprecher|altoparlante|kindle|tablet|laptop|phone|handy|telefon|cellulare|kamera|camera|fotocamera|monitor|tv|fernseh|televisore/i.test(n)) return 'electronics';
    if (/gaming|xbox|playstation|nintendo|controller|spiel|game|gioco|videogioco/i.test(n)) return 'gaming';
    if (/sofa|stuhl|tisch|sedia|tavolo|lampada|lampe|küche|cucina|kochtopf|pentola|pfanne|padella|haushalt|casa|dyson|staubsauger|aspirapolvere/i.test(n)) return 'home';
    if (/shirt|hose|scarpe|schuhe|jacke|giacca|kleid|vestito|mode|fashion|moda/i.test(n)) return 'fashion';
    if (/buch|book|libro|roman|romanzo|ratgeber/i.test(n)) return 'books';
    if (/sport|fitness|fahrrad|bicicletta|yoga|laufschuh|scarpa da corsa/i.test(n)) return 'sports';
    if (/creme|crema|shampoo|parfum|profumo|beauty|gesicht|viso|pflege|cura/i.test(n)) return 'beauty';
    return 'other';
  }

  // ── SEND TO EXTENSION ────────────────────────────────────
  function extractAndSendCart() {
    const items = extractCartItems();

    if (items.length === 0) {
      showToast('⚠️ Keine Artikel im Warenkorb gefunden.\nStelle sicher, dass du auf der Warenkorb-Seite bist und eingeloggt bist.', false);
      return;
    }

    showToast(`⏳ Lese ${items.length} Artikel...`);

    chrome.runtime.sendMessage({
      type: 'CART_ITEMS',
      items: items,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        showToast('❌ Verbindung zum PreisWächter fehlgeschlagen.', false);
        return;
      }
      showToast(`✅ ${items.length} Artikel in PreisWächter importiert!\nÖffne das Popup, um deine Watchlist zu sehen.`);

      // Update badge count
      const cnt = document.getElementById('pw-badge-count');
      if (cnt) { cnt.textContent = items.length; cnt.style.display = 'inline'; }
    });
  }

  function showToast(msg, good = true) {
    let toast = document.getElementById('pw-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pw-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.borderColor = good ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
  }

  // ── INIT ─────────────────────────────────────────────────
  injectBadge();

  // Re-inject if Amazon does a soft navigation
  const observer = new MutationObserver(() => {
    if (!document.getElementById('pw-badge')) injectBadge();
  });
  observer.observe(document.body, { childList: true, subtree: false });

})();
