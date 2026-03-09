#!/bin/bash
# ============================================================
# PreisWächter — GitHub Setup Script
# Führe dieses Script im Ordner "preiswaechter-extension" aus
# ============================================================

set -e

REPO_NAME="preiswaechter-extension"
GREEN="\033[32m" YELLOW="\033[33m" RED="\033[31m" CYAN="\033[36m" RESET="\033[0m"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║   PreisWächter → GitHub Setup          ║${RESET}"
echo -e "${CYAN}╚════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Check git installed ────────────────────────────────
if ! command -v git &>/dev/null; then
  echo -e "${RED}❌ Git nicht gefunden.${RESET}"
  echo "   Installiere Git: https://git-scm.com/downloads"
  exit 1
fi
echo -e "${GREEN}✅ Git gefunden: $(git --version)${RESET}"

# ── 2. Check gh CLI installed ─────────────────────────────
if ! command -v gh &>/dev/null; then
  echo ""
  echo -e "${YELLOW}⚠️  GitHub CLI (gh) nicht gefunden.${RESET}"
  echo "   Installiere gh: https://cli.github.com"
  echo ""
  echo "   Danach einmalig einloggen:"
  echo "   gh auth login"
  echo ""
  echo -e "${YELLOW}   Alternativ: manuelles Setup weiter unten.${RESET}"
  MANUAL=true
else
  echo -e "${GREEN}✅ GitHub CLI gefunden: $(gh --version | head -1)${RESET}"
  MANUAL=false
fi

# ── 3. Git init ───────────────────────────────────────────
echo ""
if [ ! -d ".git" ]; then
  git init
  echo -e "${GREEN}✅ Git Repository initialisiert${RESET}"
else
  echo -e "${GREEN}✅ Git Repository bereits vorhanden${RESET}"
fi

# ── 4. .gitignore ─────────────────────────────────────────
cat > .gitignore << 'EOF'
# API Key — niemals committen!
proxy/proxy.js

# System
.DS_Store
Thumbs.db
*.log
node_modules/
EOF
echo -e "${GREEN}✅ .gitignore erstellt (proxy.js wird NICHT gepusht)${RESET}"

# ── 5. Save proxy.js with placeholder (safe version) ─────
if [ -f "proxy/proxy.js" ]; then
  # Create a safe version with placeholder API key for GitHub
  sed 's/const API_KEY *= *'"'"'[^'"'"']*'"'"'/const API_KEY = '"'"'DEIN_API_KEY'"'"'/' proxy/proxy.js > proxy/proxy.example.js
  echo -e "${GREEN}✅ proxy/proxy.example.js erstellt (API Key entfernt)${RESET}"
fi

# ── 6. README ─────────────────────────────────────────────
cat > README.md << 'EOF'
# 👁 PreisWächter — Amazon Price Monitor

Chrome Extension die deinen Amazon.it Warenkorb überwacht und mit KI den besten Kaufzeitpunkt empfiehlt.

## Features
- 🛒 Automatischer Warenkorb-Import von Amazon.it
- 📊 90-Tage Preisverlauf mit Mini-Charts  
- 🤖 KI-Kaufempfehlung (powered by Claude)
- 🔔 Browser-Notifications bei Preisalerts
- 🌙 Dark / Light Mode
- 🎯 Individueller Zielpreis pro Artikel

## Installation

### 1. Extension laden
1. Chrome öffnen → `chrome://extensions`
2. **Entwicklermodus** einschalten
3. **„Entpackte Erweiterung laden"** → diesen Ordner auswählen

### 2. Proxy einrichten (für KI-Analyse)
```bash
cd proxy
cp proxy.example.js proxy.js
# proxy.js öffnen und API_KEY eintragen (console.anthropic.com)
node proxy.js
```

### 3. Benutzen
1. Extension-Icon klicken → **„Warenkorb öffnen"**
2. Bei Amazon.it einloggen & Warenkorb aufrufen
3. Orangenen **„Importa carrello"** Button klicken
4. Artikel erscheinen in der Watchlist

## Proxy-Autostart

### Windows
```bat
@echo off
cd /d "%~dp0proxy"
node proxy.js
```
Als `.bat` Datei speichern und in den Autostart-Ordner legen (`shell:startup`).

### Mac / Linux
```bash
# launchd / systemd service — siehe proxy/README.md
```

## Tech Stack
- Chrome Extension Manifest V3
- Vanilla JS (kein Framework)
- Claude API via lokalem CORS-Proxy
- Node.js Proxy-Server
EOF
echo -e "${GREEN}✅ README.md erstellt${RESET}"

# ── 7. Commit ─────────────────────────────────────────────
echo ""
git add --all
git commit -m "🚀 Initial commit — PreisWächter Extension v1.0" 2>/dev/null || \
git commit --allow-empty -m "🚀 Initial commit — PreisWächter Extension v1.0"
echo -e "${GREEN}✅ Committed${RESET}"

# ── 8. Push via gh CLI or manual instructions ─────────────
echo ""
if [ "$MANUAL" = false ]; then
  echo -e "${CYAN}GitHub Repository erstellen und pushen...${RESET}"
  gh repo create "$REPO_NAME" \
    --public \
    --description "Chrome Extension: Amazon Warenkorb überwachen & KI-Kaufempfehlung" \
    --source=. \
    --remote=origin \
    --push
  echo ""
  REPO_URL=$(gh repo view --json url -q .url 2>/dev/null || echo "https://github.com/$(git config user.name)/$REPO_NAME")
  echo -e "${GREEN}╔════════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}║   ✅ Erfolgreich auf GitHub gepusht!        ║${RESET}"
  echo -e "${GREEN}╚════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${CYAN}Repository:${RESET} $REPO_URL"
else
  echo -e "${YELLOW}╔═══════════════════════════════════════════════╗${RESET}"
  echo -e "${YELLOW}║  Manuelles Setup (gh CLI nicht installiert)   ║${RESET}"
  echo -e "${YELLOW}╚═══════════════════════════════════════════════╝${RESET}"
  echo ""
  echo "  1. github.com öffnen → New Repository"
  echo "     Name: $REPO_NAME"
  echo "     Visibility: Public oder Private"
  echo "     ❗ KEIN README/gitignore hinzufügen"
  echo ""
  echo "  2. Dann diese Befehle ausführen:"
  echo ""
  echo -e "  ${CYAN}git remote add origin https://github.com/DEIN-USERNAME/$REPO_NAME.git${RESET}"
  echo -e "  ${CYAN}git branch -M main${RESET}"
  echo -e "  ${CYAN}git push -u origin main${RESET}"
fi

echo ""
echo -e "${YELLOW}⚠️  Wichtig: proxy/proxy.js wurde NICHT gepusht${RESET}"
echo "   (enthält deinen API Key — bleibt lokal)"
echo ""
