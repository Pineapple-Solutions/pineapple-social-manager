#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-permissions.sh
# Ripristina i permessi corretti per Pineapple Social Manager.
# Da eseguire come root (o con sudo) sul server di produzione ogni volta che
# le cartelle/file perdono i permessi (es. dopo git pull, npm run build, ecc.)
#
# Utilizzo:
#   sudo bash scripts/fix-permissions.sh
#   oppure con path/utente personalizzati:
#   sudo APP_DIR=/percorso/personalizzato APP_USER=myuser bash scripts/fix-permissions.sh
#
# ⚠️  APP_USER deve essere lo stesso utente con cui PM2 avvia il processo.
#     Per verificarlo: pm2 info pineapple-social-manager | grep user
#     I log PM2 in /home/UTENTE/.pm2/ indicano quale utente usa PM2.
#     Esempio: se i log sono in /home/natale/.pm2/ → APP_USER=natale
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pineapple-social-manager}"
APP_USER="${APP_USER:-natale}"
APP_GROUP="${APP_GROUP:-$APP_USER}"

echo "▶ App dir  : $APP_DIR"
echo "▶ App user : $APP_USER:$APP_GROUP"
echo ""

# ── 1. Verifica che la directory esista ───────────────────────────────────────
if [ ! -d "$APP_DIR" ]; then
  echo "❌ Directory non trovata: $APP_DIR"
  echo "   Imposta APP_DIR con il percorso corretto."
  exit 1
fi

# ── 2. Proprietà intera directory progetto ────────────────────────────────────
echo "👤 Assegno proprietà $APP_USER:$APP_GROUP all'intera directory progetto..."
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
echo "   ✓ chown -R $APP_USER:$APP_GROUP $APP_DIR"

# ── 3. Permessi file e cartelle progetto ──────────────────────────────────────
echo "🔐 Applico permessi file/cartelle..."

# Directory: 755
find "$APP_DIR" -not -path "$APP_DIR/.next/*" -not -path "$APP_DIR/node_modules/*" \
  -type d -exec chmod 755 {} \;

# File generici: 644
find "$APP_DIR" -not -path "$APP_DIR/.next/*" -not -path "$APP_DIR/node_modules/*" \
  -not -name ".env*" -type f -exec chmod 644 {} \;

# Script eseguibili: 755
find "$APP_DIR/scripts" -name "*.sh" -exec chmod 755 {} \; 2>/dev/null || true

# .env.local: solo owner può leggerlo/scriverlo
if [ -f "$APP_DIR/.env.local" ]; then
  chmod 600 "$APP_DIR/.env.local"
  echo "   ✓ .env.local: chmod=600"
fi

# .next: owner rwX, group rX, altri niente
if [ -d "$APP_DIR/.next" ]; then
  chmod -R u=rwX,g=rX,o= "$APP_DIR/.next"
  echo "   ✓ .next: chmod=u=rwX,g=rX,o="
fi

# ── 4. Crea le cartelle runtime se non esistono ───────────────────────────────
echo "📁 Creo cartelle runtime mancanti..."

mkdir -p "$APP_DIR/public/uploads/media-library"
mkdir -p "$APP_DIR/public/uploads/video-ai"
mkdir -p "$APP_DIR/public/uploads/content-studio"
mkdir -p "$APP_DIR/public/watermark-removed"

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR/public"
chmod -R 755 "$APP_DIR/public"

echo "   ✓ public/uploads/* e public/watermark-removed pronti"

# ── 5. Diagnostica finale ──────────────────────────────────────────────────────
echo ""
echo "✅ Permessi applicati correttamente."
echo ""
echo "📋 Verifica cartella public/:"
ls -la "$APP_DIR/public/"
echo ""
echo "📋 Permessi file critici:"
ls -la "$APP_DIR/.env.local" 2>/dev/null || echo "   .env.local non trovato"
ls -la "$APP_DIR/.next/BUILD_ID" 2>/dev/null || echo "   .next/BUILD_ID non trovato (esegui npm run build)"
echo ""
echo "⚠️  Ora riavvia il processo PM2:"
echo "   pm2 restart pineapple-social-manager"
echo ""
