<p align="center">
  <img src="https://pineapplesolutions.it/images/logo-pineapple-social-manager-h.svg" alt="Pineapple Social Manager Logo" width="600">
</p>

# 🍍 Pineapple Social Manager

> Piattaforma **multi-tenant** di gestione e automazione dei social media.  
> Realizzata con **Next.js 15**, **TypeScript**, **Tailwind CSS**, **Prisma ORM** + **MySQL**.  
> Supporta generazione contenuti AI (OpenAI, Anthropic, Google Gemini), scheduling automatico,  
> pubblicazione su Instagram, Facebook e TikTok, media library, analisi e molto altro.

---

## 🌐 Live Demo

Puoi testare le funzionalità della piattaforma attraverso la nostra live demo:
**Link:** [https://socialmanager.pineapplesolutions.it/](https://socialmanager.pineapplesolutions.it/)

---

## ☕ Supporta lo Sviluppo

Se questo progetto ti è stato utile e condividi la filosofia di uno sviluppo indipendente, incentrato sulla privacy e costruito "su misura", puoi sostenere il mio lavoro. Ogni caffè offerto mi aiuta a coprire i costi di infrastruttura e a dedicare più tempo alla scrittura di codice libero da logiche commerciali.

<a href="https://buymeacoffee.com/pineapplesolutions" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

---

**Master Account (con gestione clienti):**
* **Email:** `master@demo.it`
* **Password:** `password`

**Admin Account (senza gestione clienti):**
* **Email:** `demo@demo.it`
* **Password:** `password`

## 🚀 Funzionalità Principali e Guida all'Uso

Pineapple Social Manager è stato progettato per agenzie, freelance e aziende che vogliono scalare la gestione dei social media sfruttando l'Intelligenza Artificiale. Di seguito il dettaglio di tutte le sezioni e funzionalità della piattaforma, come documentato.

### ⚙️ Impostazioni e Configurazione
Pagina di gestione delle configurazioni dell’applicazione. La configurazione è **multi-tenant**, permette di configurare impostazioni globali (per tutti i tenant) o per singolo Cliente (tenant).

* **Account Instagram, Facebook e TikTok:** Associa i tuoi account Business tramite una procedura guidata passo-passo che configura l'accesso alle API dei rispettivi social. Per Instagram, configurando App ID e App Secret, il token viene rigenerato automaticamente.
* **Regole di Schedulazione Automatica:** Programma la frequenza di pubblicazione automatica, scegliendo giorni, orari, topic di generazione AI e associando un sito per l'estrazione dei contenuti.
* **Impostazioni Generali:** Configura fuso orario, lingua predefinita, tono comunicativo e l'abilitazione della pubblicazione automatica.

### 🏢 Clienti e Piani
Ogni cliente ha il proprio spazio isolato. Da questa sezione puoi gestire i clienti e assegnare loro specifici piani:
* **Free:** Funzionalità limitate.
* **Pro:** Funzionalità complete.
* **Agency:** Funzionalità complete e possibilità di creare nuovi clienti (sotto-tenant).

### 👥 Utenti e Dipendenti
Gestisci gli accessi ai vari tenant (clienti) con ruoli specifici:
* **Admin:** Gestione completa (tranne utenti master).
* **Editor:** Crea e modifica contenuti.
* **Viewer:** Solo visualizzazione.

### 🤖 Provider AI Multi-Modello
Configura tramite API Key i provider **Open AI**, **Claude (Anthropic)** o **Google Gemini/VEO**.
* **Personalizzazione:** Imposta limiti di token giornalieri e job simultanei massimi per cliente o globalmente.
* **Modelli Specializzati:** Assegna modelli specifici per testo, immagini (modello Immagini AI separato) e video (Modello Video AI separato).
* **Funzionalità Assegnate:** Scegli quali specifiche operazioni far eseguire a ciascun provider (se non impostato, il provider predefinito farà tutto).

### 🧠 Regole Prompt
Le regole vengono iniettate automaticamente nel prompt di ogni generazione AI, con controllo granulare (priorità da Bassa a Critica).
* **Generazione Automatica:** Premi "Genera con AI" per estrarre automaticamente le regole e il "Tono di Voce" analizzando i contenuti dei siti web del cliente associato.
* **Gestione Manuale e Prompt Negativi:** Crea istruzioni manuali. Le regole "Negative" sono inviate come negative prompt ai provider che lo supportano (Imagen, Veo) e come istruzione "EVITA SEMPRE" per i modelli LLM.
* **Multi-tenancy:** Regole globali per tutti, o regole specifiche per cliente che sovrascrivono quelle globali.

![Regole Prompt](https://www.pineapplesolutions.it/images/regole-prompt.jpg)

### 🖼️ Media e Siti Collegati
* **Siti Collegati:** Associa gli URL ai clienti impostando settore e URL icona/Logo (se vuoto estrarrà la favicon in automatico). L'AI userà i contenuti in continua evoluzione del sito.
* **Libreria Media (Scraping):** * **Estrazione Foto:** Estrae immagini dal sito, le persiste nello storage, genera descrizioni AI e le *ottimizza per il web* (compressione dimensioni fino al 40% a parità di qualità). I media attivi vengono forniti come contesto visivo all'AI durante la generazione.
    * **Estrazione Video:** Estrae video, autogenera descrizioni e converte in H264/MP4 per compatibilità web.

![Libreria Media](https://www.pineapplesolutions.it/images/libreria-media.jpg)

### 🎬 Video AI (Generazione con Google VEO)
Crea video da 5 a 60 secondi definendo stile, durata e formato (Portrait/Landscape). Per video più lunghi di 8 secondi, l'AI genera più clip e le unisce con effetto continuo.
* *Genera storyboard con AI:* L'AI crea scene con durate, narrazione, musica e genera l'audio vocale continuo (TTS).

**Form di Generazione:**
![Video AI Form](https://www.pineapplesolutions.it/images/video-ai-form.jpg)

**Coda di Generazione Unificata:**
Monitora in tempo reale lo stato dei job. Dal singolo contenuto puoi effettuare modifiche, cambio modello, cambio durata o anteprima. Gestisce retry e priorità.
![Coda Generazione Video](https://www.pineapplesolutions.it/images/coda-generazione.jpg)

**Dettaglio Clip Generata:**
![Video AI Dettaglio](https://www.pineapplesolutions.it/images/video-ai-dettaglio.jpg)

### ✍️ Content Studio (Contenuti)
Consulta e genera i contenuti tramite i provider AI in tre modalità principali:

**1. Nuovo post (semi-assistita):** Seleziona piattaforma (Instagram/Facebook/TikTok), formato (Post, Story, Reel, Carousel), media di riferimento e impostazioni rimozione filigrana. Inserisci topic e stile: l'AI genera in automatico Caption, Hashtag e le scene dello storyboard (gestibili anche manualmente).
![Content Studio Editor](https://www.pineapplesolutions.it/images/content-studio-editor.jpg)

**2. AI Generator:** Automazione spinta a partire da un topic o da un’idea.
![AI Generator](https://www.pineapplesolutions.it/images/ai-generator.jpg)

**3. Brainstorming:** Genera 10 idee di contenuti casuali (post, story, reel, ecc.) per vari Social differenziati alla volta. Approvali singolarmente per inviarli in coda di generazione media (risparmiando token).
![Brainstorming AI](https://www.pineapplesolutions.it/images/brainstorming-ai.jpg)

*Inoltre:* Migliora il contenuto tramite prompt migliorativo, modificalo manualmente, rigeneralo e pubblicalo.

### 📊 Analytics, Campagne e Dashboard
* **Dashboard:** Pagina generale di monitoraggio statistiche, calendario editoriale e azioni rapide. Hai sempre sotto controllo i post schedulati, le bozze pendenti e le metriche chiave.
  ![Dashboard Overview](https://www.pineapplesolutions.it/images/dashboard-overview.jpg)

* **Analytics:** Filtra le statistiche per cliente e piattaforma. Attiva la *Sincronizzazione automatica* per ogni Social impostando la frequenza (CRON personalizzato o data/ora) o avviala manualmente tramite il tasto "Sync...".
  ![Analytics Metrics](https://www.pineapplesolutions.it/images/analytics-metrics.jpg)

* **Campagne:** Raggruppa i post per scopi specifici definendo data di inizio e fine. Il tasto "Crea campagna" permette all'AI di generare un'intera pianificazione e schedulazione.

### 🖥️ UI del Sito
L’interfaccia è **Responsive**, ottimizzata per tutti i dispositivi, con **Tema Light e Dark** gestibile dalla barra di navigazione principale (da cui monitori anche lo scheduler e le notifiche). Il menù raggruppa le sezioni in Contenuti, Media e Impostazioni in modo logico e pulito.

---

## Indice Documentazione Tecnica

1. [Modalità di utilizzo](#1-modalità-di-utilizzo)
2. [Prerequisiti comuni](#2-prerequisiti-comuni)
3. [Configurazione ambiente (.env.local)](#3-configurazione-ambiente-envlocal)
4. [Database MySQL — setup](#4-database-mysql--setup)
5. [Comandi Prisma (gestione DB)](#5-comandi-prisma-gestione-db)
6. [Installazione nativa su Ubuntu Server](#6-installazione-nativa-su-ubuntu-server)
7. [Installazione con Docker](#7-installazione-con-docker)
8. [Installazione con Docker Compose (consigliata)](#8-installazione-con-docker-compose-consigliata)
9. [Reverse proxy con Nginx](#9-reverse-proxy-con-nginx)
10. [Certificato SSL con Certbot](#10-certificato-ssl-con-certbot)
11. [Variabili d'ambiente — riferimento completo](#11-variabili-dambiente--riferimento-completo)
12. [Aggiornamenti](#12-aggiornamenti)
13. [Stack tecnico](#13-stack-tecnico)
14. [Licenza e Supporto](#14-licenza-e-supporto)

---

## 1. Modalità di utilizzo

L'app è progettata per funzionare in due scenari principali:

### 🌐 SaaS / Service condiviso (multi-tenant)
Gestito da Pineapple Solutions su infrastruttura propria. I clienti accedono come **tenant** distinti sullo stesso server condiviso. Ogni tenant ha i propri account social, provider AI, regole di scheduling e media library completamente isolati. Richiede MySQL su un server dedicato o managed (RDS, PlanetScale, ecc.).

### 🖥️ Installazione on-premise (cliente singolo)
Il cliente installa l'app sul proprio server (direttamente su Ubuntu, via Docker o Kubernetes). In questo caso si consiglia comunque MySQL (non SQLite) per robustezza, anche con un singolo tenant. MySQL può girare in un container Docker insieme all'app tramite Docker Compose.

---

## 2. Prerequisiti comuni

### Ubuntu Server 22.04 / 24.04 LTS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget unzip
```

### Clonare il repository

```bash
git clone https://github.com/tuo-org/pineapple-social-manager.git
cd pineapple-social-manager
```

---

## 3. Configurazione ambiente (.env.local)

Copia il file di esempio e compila i valori reali **prima** di avviare qualsiasi build:

```bash
cp .env.example .env.local
nano .env.local
```

Contenuto minimo richiesto:

```env
# --- Database MySQL ---
DATABASE_URL="mysql://UTENTE:PASSWORD@localhost:3306/pineapple_social_manager"

# --- Auth ---
AUTH_SECRET=scegli-una-stringa-casuale-lunga-almeno-32-caratteri
MASTER_EMAIL=admin@tuodominio.it
MASTER_PASSWORD=CambiamiSubito123!

# --- Timezone ---
TZ=Europe/Rome
```

> ⚠️ Non aggiungere mai `.env.local` a Git. È già incluso nel `.gitignore`.  
> ⚠️ I caratteri speciali nella password MySQL (es. `@`, `+`, `#`) devono essere **URL-encoded** nel `DATABASE_URL`.  
> Esempio: `@` → `%40`, `+` → `%2B`, `#` → `%23`.

---

## 4. Database MySQL — setup

L'app usa **MySQL 8+** (oppure **MariaDB 10.6+**) come database.

### 4.1 Installazione MySQL nativa (Ubuntu)

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 4.2 Creazione database e utente dedicato

```sql
-- Accedi come root
sudo mysql -u root -p

-- Crea il database
CREATE DATABASE pineapple_social_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Crea l'utente dedicato
CREATE USER 'pineapple_social_manager'@'localhost' IDENTIFIED BY 'password_sicura';

-- Assegna i permessi
GRANT ALL PRIVILEGES ON pineapple_social_manager.* TO 'pineapple_social_manager'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> Per installazioni Docker Compose il database MySQL è incluso nel `docker-compose.yml` e si autoconfigura — vedi sezione 8.

### 4.3 Prima inizializzazione schema

Dopo aver compilato `.env.local` con la `DATABASE_URL` corretta:

```bash
npm run db:push
```

Questo comando legge `prisma/schema.prisma` e crea tutte le tabelle nel database.  
Per ambienti di produzione con migrazioni tracciate usare invece `npm run db:migrate`.

### 4.4 Migrazione da SQLite (se si parte da un'installazione esistente)

Se hai dati su un vecchio database SQLite (`prisma/prisma/social-manager.db`), puoi migrarli automaticamente:

```bash
npm run db:migrate-from-sqlite
```

Lo script trasferisce tutti i record mantenendo le relazioni intatte (upsert idempotente).

---

## 5. Comandi Prisma (gestione DB)

| Comando | Descrizione |
|---|---|
| `npm run db:generate` | Rigenera il Prisma Client (dopo modifiche allo schema) |
| `npm run db:push` | Applica lo schema al DB senza creare migration files (dev/staging) |
| `npm run db:migrate` | Crea e applica una migration tracciata (produzione) |
| `npm run db:studio` | Apre Prisma Studio — GUI web per esplorare/modificare i dati |
| `npm run db:seed` | Popola il DB con dati iniziali (admin, tenant demo, prompt rules) |
| `npm run db:migrate-from-sqlite` | Migra tutti i dati da SQLite a MySQL |
| `sudo npm run fix-permissions` | Ricrea e corregge i permessi delle cartelle runtime (`public/uploads`, `public/watermark-removed`) |

> Tutti i comandi Prisma leggono automaticamente le variabili da `.env.local`.

---

## 6. Installazione nativa su Ubuntu Server

### 6.1 Installa Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # deve essere v20.x.x
npm -v
```

### 6.2 Permessi consigliati

Per sicurezza, esegui l'app con un utente dedicato (es. `pineapple`) e non come `root`.

> ⚠️ **Nota importante sul `.gitignore`:** l'intera cartella `public/` è esclusa da Git.
> Questo significa che **non esiste sul server dopo un clone o un `git pull`**.
> Le cartelle `public/uploads/` e `public/watermark-removed/` devono essere create manualmente
> e la loro proprietà assegnata all'utente che esegue l'app, altrimenti la generazione media
> (estrazione foto/video, AI, ecc.) fallirà silenziosamente.

```bash
# Crea utente di servizio senza login shell
sudo adduser --system --group --home /var/www/pineapple-social-manager --shell /usr/sbin/nologin pineapple

# Crea directory progetto e assegna proprietà
sudo mkdir -p /var/www/pineapple-social-manager
sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager

# Crea le cartelle runtime (non tracciate da git) e assegna permessi
sudo mkdir -p /var/www/pineapple-social-manager/public/uploads/media-library               /var/www/pineapple-social-manager/public/uploads/video-ai               /var/www/pineapple-social-manager/public/uploads/content-studio               /var/www/pineapple-social-manager/public/watermark-removed

sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager/public
sudo chmod -R 755 /var/www/pineapple-social-manager/public

# Permessi cartella build Next.js
sudo mkdir -p /var/www/pineapple-social-manager/.next
sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager/.next
sudo chmod 750 /var/www/pineapple-social-manager/.next

# Proteggi il file con i segreti
sudo chmod 640 /var/www/pineapple-social-manager/.env.local
```

> 💡 In alternativa puoi usare lo script incluso (dopo il clone):
> ```bash
> sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
> ```

### 6.3 Dipendenze, schema e build

```bash
cd /var/www/pineapple-social-manager

npm ci
npm run db:push        # crea le tabelle MySQL
npm run db:seed        # dati iniziali (opzionale)
npm run build
```

### 6.4 Avvio in produzione

```bash
npm run start
# L'app sarà disponibile su http://localhost:3010
```

### 6.5 Avvio automatico con PM2

```bash
# Installa PM2 globalmente
sudo npm install -g pm2

# Avvia l'app
pm2 start npm --name "pineapple-social-manager" -- start

# Salva la config e abilita l'avvio automatico al boot
pm2 save
pm2 startup systemd
# Esegui il comando che PM2 stampa a schermo (sudo env PATH=...)

# Comandi utili
pm2 logs pineapple-social-manager      # log in tempo reale
pm2 restart pineapple-social-manager   # riavvio
pm2 stop pineapple-social-manager      # stop
pm2 status                             # stato di tutti i processi
```

### 6.6 Modalità sviluppo

```bash
npm run dev
# http://localhost:3010
```

> Sia in sviluppo che in produzione la porta è `3010` (come da `package.json`). Può essere sovrascritta con la variabile `PORT`.

### 6.7 Diagnostica permessi (media non salvati)

Se la generazione media (estrai foto, estrai video, AI, ecc.) non salva i file, segui questa diagnostica:

#### A — Verifica l'utente con cui gira PM2

```bash
pm2 info pineapple-social-manager | grep user
# Deve mostrare: pineapple
# Se mostra root o un altro utente, l'app scrive in un percorso errato
```

#### B — Verifica che le cartelle uploads esistano

```bash
ls -la /var/www/pineapple-social-manager/public/
# Deve mostrare uploads/ e watermark-removed/ di proprietà di pineapple
```

Se le cartelle non esistono o hanno proprietà errata, esegui lo script di fix:

```bash
sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
```

#### C — Test di scrittura manuale

```bash
# Testa che l'utente pineapple possa scrivere nelle cartelle
sudo -u pineapple touch /var/www/pineapple-social-manager/public/uploads/test.txt
# Se non dà errori → i permessi sono corretti
sudo rm /var/www/pineapple-social-manager/public/uploads/test.txt
```

#### D — Controlla i log dell'app per errori filesystem

```bash
pm2 logs pineapple-social-manager --lines 200 | grep -i "EACCES\|ENOENT\|permission\|Error"
```

Errori comuni e soluzione:
| Errore | Causa | Soluzione |
|---|---|---|
| `EACCES: permission denied` | L'utente app non ha accesso in scrittura | `sudo bash scripts/fix-permissions.sh` |
| `ENOENT: no such file or directory` | La cartella `public/uploads` non esiste | Stessa soluzione sopra |
| File generati ma non visibili | PM2 avviato come `root`, scrive in `/root/...` | Riavvia PM2 come `pineapple`, poi fix permissions |

#### E — Riavvio PM2 con utente corretto

```bash
# Se PM2 gira come root ma deve girare come pineapple:
pm2 delete pineapple-social-manager
sudo -u pineapple pm2 start npm --name "pineapple-social-manager" -- start --cwd /var/www/pineapple-social-manager
sudo -u pineapple pm2 save
sudo -u pineapple pm2 startup systemd
```

---

## 7. Installazione con Docker

### 7.1 Installa Docker su Ubuntu

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

### 7.2 Crea il `Dockerfile`

```dockerfile
# ── Stage 1: dipendenze ────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: runtime ───────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg richiesto per la generazione e processing video
RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs &&     adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p public/uploads public/watermark-removed &&     chown -R nextjs:nodejs public

USER nextjs
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### 7.3 Crea il `.dockerignore`

```
node_modules
.next
.git
*.log
prisma/prisma/social-manager.db
public/uploads
public/watermark-removed
```

### 7.4 Build e run manuale

```bash
# Build dell'immagine
docker build -t pineapple-social-manager:latest .

# Avvio del container
docker run -d   --name pineapple-social-manager   --restart unless-stopped   -p 3010:3010   --env-file .env.local   -v /var/data/psm/uploads:/app/public/uploads   -v /var/data/psm/watermark-removed:/app/public/watermark-removed   pineapple-social-manager:latest

# Log
docker logs -f pineapple-social-manager

# Stop e rimozione
docker stop pineapple-social-manager && docker rm pineapple-social-manager
```

> ⚠️ Monta sempre i volumi per `uploads` e `watermark-removed`: i file generati/caricati devono persistere tra i riavvii del container.

---

## 8. Installazione con Docker Compose (consigliata)

Questa modalità include **MySQL** nel compose, ideale per installazioni on-premise del cliente.

### 8.1 Installa Docker Compose

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

### 8.2 Crea `docker-compose.yml`

```yaml
version: "3.9"

services:
  mysql:
    image: mysql:8.0
    container_name: pineapple-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password_cambiami
      MYSQL_DATABASE: pineapple_social_manager
      MYSQL_USER: pineapple_social_manager
      MYSQL_PASSWORD: password_cambiami
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: pineapple-social-manager:latest
    container_name: pineapple-social-manager
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    ports:
      - "3010:3010"
    env_file:
      - .env.local
    volumes:
      - uploads_data:/app/public/uploads
      - watermark_data:/app/public/watermark-removed

  # Nginx reverse proxy (opzionale ma consigliato)
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app

volumes:
  mysql_data:
  uploads_data:
  watermark_data:
```

In `.env.local` usa il nome del servizio Docker (`mysql`) come host:

```env
DATABASE_URL="mysql://pineapple_social_manager:password_cambiami@mysql:3306/pineapple_social_manager"
```

### 8.3 Primo avvio

```bash
# Build + avvio
docker compose up -d --build

# Inizializza lo schema nel database (solo al primo avvio)
docker compose exec app npx prisma db push

# Dati iniziali (opzionale)
docker compose exec app npx prisma db seed

# Log in tempo reale
docker compose logs -f app
```

### 8.4 Comandi Docker Compose

```bash
# Stop
docker compose down

# Rebuild dopo aggiornamenti del codice
docker compose up -d --build --force-recreate

# Stato dei container
docker compose ps

# Accesso shell MySQL
docker compose exec mysql mysql -u pineapple_social_manager -p pineapple_social_manager
```

---

## 9. Reverse proxy con Nginx

### Installazione Nginx (nativa)

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/pineapple-social-manager
```

### Configurazione Nginx

```nginx
server {
    listen 80;
    server_name social.tuodominio.it;

    # Decommentare dopo aver configurato SSL con Certbot:
    # return 301 https://$host$request_uri;

    # Limite upload (media library, video AI)
    client_max_body_size 500M;

    # ── File statici generati a runtime (uploads e watermark) ──────────────
    # Serviti direttamente da nginx senza passare per Next.js.
    # Evita problemi di proxy/timeout e aumenta le performance.
    location /uploads/ {
        alias /var/www/pineapple-social-manager/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
        try_files $uri =404;
    }

    location /watermark-removed/ {
        alias /var/www/pineapple-social-manager/public/watermark-removed/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ── Tutto il resto → Next.js ───────────────────────────────────────────
    location / {
        proxy_pass         http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        # Timeout estesi per le chiamate AI (generazione video/immagini)
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

> ⚠️ `client_max_body_size 500M` è importante: la media library e il generatore video gestiscono file pesanti.

### Abilita e riavvia

```bash
sudo ln -s /etc/nginx/sites-available/pineapple-social-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx && sudo systemctl enable nginx
```

### Configurazione Nginx per Docker Compose (`nginx/nginx.conf`)

```nginx
upstream pineapple_app {
    server app:3010;
}

server {
    listen 80;
    server_name social.tuodominio.it;

    client_max_body_size 500M;

    # ── File statici generati a runtime ────────────────────────────────────
    location /uploads/ {
        alias /app/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /watermark-removed/ {
        alias /app/public/watermark-removed/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ── Tutto il resto → Next.js ────────────────────────────────────────────
    location / {
        proxy_pass         http://pineapple_app;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

---

## 10. Certificato SSL con Certbot

```bash
# Installa Certbot
sudo apt install -y certbot python3-certbot-nginx

# Ottieni il certificato (sostituisci con il tuo dominio)
sudo certbot --nginx -d social.tuodominio.it

# Verifica il rinnovo automatico
sudo certbot renew --dry-run
```

Certbot aggiorna automaticamente la config Nginx con il redirect HTTPS.

---

## 11. Variabili d'ambiente — riferimento completo

| Variabile | Tipo | Obbligatoria | Descrizione |
|---|---|---|---|
| `DATABASE_URL` | `string` | ✅ | Connection string MySQL. Formato: `mysql://user:pass@host:3306/dbname`. Caratteri speciali nella password vanno URL-encoded (`@`→`%40`, `+`→`%2B`, `#`→`%23`). |
| `AUTH_SECRET` | `string` | ✅ | Chiave segreta per la firma dei JWT di sessione. Minimo 32 caratteri casuali. |
| `MASTER_EMAIL` | `string` | ✅ | Email dell'account amministratore master (creato al primo `db:seed`). |
| `MASTER_PASSWORD` | `string` | ✅ | Password dell'account amministratore master. |
| `TZ` | `string` | No | Timezone del server (default: `Europe/Rome`). Usato dallo scheduler e dalle date. |

> **Nota:** le chiavi API per i provider AI (OpenAI, Anthropic, Google Gemini), gli access token di Instagram / Facebook / TikTok e le configurazioni per tenant si impostano **dalla UI** → *Impostazioni → Provider AI* / *Account Social* e vengono salvate nel database, non nelle variabili d'ambiente.

---

## 12. Aggiornamenti

### 12.1 Aggiornamento nativo su Ubuntu + PM2

Assunzioni:
- path progetto: `/var/www/pineapple-social-manager`
- processo PM2: `pineapple-social-manager`
- branch deploy: `main`

#### Step A — Pre-check

```bash
cd /var/www/pineapple-social-manager
pm2 status
git status
git rev-parse --short HEAD
```

#### Step B — Aggiornamento codice + dipendenze + build

```bash
cd /var/www/pineapple-social-manager

git fetch origin
git checkout main
git pull --ff-only origin main

# Installa dipendenze in modo pulito
npm ci

# Applica eventuali nuove migration al DB
npm run db:migrate

# Build produzione
npm run build
```

> Se ci sono nuove variabili d'ambiente, aggiorna `.env.local` prima di `npm run build`.

#### Step C — Riavvio zero-downtime con PM2

```bash
pm2 reload pineapple-social-manager || pm2 restart pineapple-social-manager
pm2 save
```

#### Step D — Ripristina permessi cartelle runtime

> ⚠️ Dopo ogni `git pull` + `npm run build` è **obbligatorio** rieseguire questo step,
> perché la build può modificare la proprietà di alcune cartelle e `public/` non è in Git,
> quindi non viene ricreata automaticamente.

```bash
sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
```

#### Step E — Verifica post-deploy

```bash
pm2 status
pm2 logs pineapple-social-manager --lines 100
ss -ltnp | grep 3010
curl -I http://127.0.0.1:3010
```

### 12.2 Rollback rapido

```bash
cd /var/www/pineapple-social-manager

git reset --hard HEAD~1
npm ci
npm run build
pm2 restart pineapple-social-manager
pm2 save
```

### 12.3 Aggiornamento Docker Compose

```bash
git pull origin main
docker compose up -d --build --force-recreate

# Applica eventuali nuove migration al DB
docker compose exec app npx prisma migrate deploy
```

### 12.4 Pulizia immagini Docker inutilizzate

```bash
docker image prune -f
```

---

## 13. Stack tecnico

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, SSR, API Routes) |
| Linguaggio | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Animazioni | Framer Motion 11 |
| ORM | Prisma 5 |
| Database | MySQL 8 / MariaDB 10.6+ |
| AI — Testo | OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini 2.0 |
| AI — Immagini | DALL-E 3 (OpenAI) |
| AI — Video | Google Veo 2 (Google AI) |
| Social | Instagram Graph API, Facebook Graph API, TikTok API |
| Scheduling | node-cron (scheduler interno) |
| Media processing | Sharp (immagini), FFmpeg (video), Cheerio (web scraping) |
| Auth | JWT (jose) + bcrypt + TOTP 2FA (otplib / speakeasy) |
| UI Components | Lucide React, Recharts, React Hot Toast |
| State management | Zustand, TanStack Query v5 |
| Runtime | Node.js 20 LTS |

---

## 14. Licenza e Supporto

Questo software è distribuito sotto licenza **Pineapple Open-Source License (Basata su BSL/Dual-License)**:
- **✅ Gratuito per l'uso:** Puoi scaricare, installare e utilizzare il software gratuitamente per gestire i tuoi social o quelli della tua agenzia.
- **✅ Modifiche (con consenso):** I contributi e le PR sono benvenuti! Le modifiche migliorative della piattaforma possono essere usate previa approvazione della community o dell'autore.
- **❌ Divieto di Rivendita Commerciale (SaaS):** Non è consentito prendere questo codice sorgente, brandizzarlo e rivenderlo come servizio SaaS (Software-as-a-Service) commerciale a terzi senza una licenza commerciale esplicita.

Se hai bisogno di **supporto premium, installazione dedicata o una licenza commerciale** per rivendere la piattaforma white-label, contattaci. 

🍍 **Sostieni il Progetto:** Se questa piattaforma ti aiuta a scalare il tuo business, considera l'idea di fare una donazione per supportare lo sviluppo! 

---


## ⚠️ Limitazioni, Stato dello Sviluppo e Responsabilità

### 🛠️ Funzionalità Non Ancora Sviluppate (In Arrivo)
Si prega di notare che il progetto è in fase di sviluppo attivo. Le seguenti funzionalità, sebbene documentate o visibili nell'interfaccia, **non sono ancora state implementate** e verranno rilasciate nelle prossime versioni:

* **Test e Integrazione Provider AI:** È necessario completare i test operativi e validare l'integrazione completa per i provider **Anthropic** e **OpenAI**.
* **Sezione Campagne:** Il raggruppamento dei post in campagne con date di inizio/fine e la generazione automatica di un'intera pianificazione editoriale tramite AI non sono stati completati.
* **Supporto Multi-lingua:** L'interfaccia e il sistema sono attualmente disponibili **esclusivamente in lingua Italiana**. Il supporto per l'internazionalizzazione (i18n) e la localizzazione in altre lingue verrà aggiunto in futuro.

### 🛑 Esclusione di Responsabilità (Disclaimer)
Questo software viene fornito "così com'è", senza garanzie di alcun tipo, espresse o implicite.

* L'autore (Giovanni Buglione) e *Pineapple Solutions di Buglione Giovanni* **non si assumono alcuna responsabilità** per l'uso improprio o illegale del programma, né per eventuali violazioni dei Termini di Servizio delle piattaforme social (Meta/Facebook, Instagram, TikTok) causate dall'uso di automatismi, scraping o pubblicazione massiva.
* L'utente è l'unico responsabile della custodia delle API Key dei provider AI (OpenAI, Anthropic, Google) e dei costi da esse derivanti, nonché della gestione e della sicurezza dei dati dei propri clienti (tenant).

*Pineapple IT Solutions di Buglione Giovanni — [pineapplesolutions.it](https://pineapplesolutions.it)*
