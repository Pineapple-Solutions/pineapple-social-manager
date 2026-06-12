<p align="center">
  <img src="https://pineapplesolutions.it/images/logo-pineapple-social-manager-h.svg" alt="Pineapple Social Manager Logo" width="600">
</p>

# 🍍 Pineapple Social Manager

> **Multi-tenant** social media management and automation platform.
> Built with **Next.js 15**, **TypeScript**, **Tailwind CSS**, **Prisma ORM** + **MySQL**.
> Supports AI content generation (OpenAI, Anthropic, Google Gemini), automatic scheduling,
> publishing to Instagram, Facebook, and TikTok, media library management, analytics, and much more.

---

## 🚀 Main Features and User Guide

Pineapple Social Manager has been designed for agencies, freelancers, and businesses that want to scale social media management through Artificial Intelligence. Below is a detailed overview of all platform sections and features, as documented.

### ⚙️ Settings and Configuration

Application configuration management page. Configuration is **multi-tenant**, allowing both global settings (for all tenants) and tenant-specific settings.

* **Instagram, Facebook, and TikTok Accounts:** Connect your Business accounts through a step-by-step wizard that configures access to the respective social platform APIs. For Instagram, after configuring the App ID and App Secret, the token is automatically regenerated.
* **Automatic Scheduling Rules:** Configure automatic publishing frequency by selecting days, times, AI generation topics, and associating a website for content extraction.
* **General Settings:** Configure timezone, default language, communication tone, and automatic publishing enablement.

### 🏢 Clients and Plans

Each client has its own isolated workspace. From this section, you can manage clients and assign specific plans:

* **Free:** Limited functionality.
* **Pro:** Full functionality.
* **Agency:** Full functionality plus the ability to create new clients (sub-tenants).

### 👥 Users and Employees

Manage access to different tenants (clients) with specific roles:

* **Admin:** Full management (except master users).
* **Editor:** Create and edit content.
* **Viewer:** Read-only access.

### 🤖 Multi-Model AI Providers

Configure **OpenAI**, **Claude (Anthropic)**, or **Google Gemini/VEO** providers using API keys.

* **Customization:** Set daily token limits and maximum simultaneous jobs globally or per client.
* **Specialized Models:** Assign specific models for text, images (dedicated AI Image model), and videos (dedicated AI Video model).
* **Assigned Features:** Choose which specific operations each provider should handle (if not configured, the default provider will manage all tasks).

### 🧠 Prompt Rules

Rules are automatically injected into every AI generation prompt, with granular control (priority levels from Low to Critical).

* **Automatic Generation:** Click "Generate with AI" to automatically extract rules and the "Tone of Voice" by analyzing the contents of the associated client websites.
* **Manual Management and Negative Prompts:** Create custom instructions manually. "Negative" rules are sent as negative prompts to supported providers (Imagen, Veo) and as "ALWAYS AVOID" instructions for LLM models.
* **Multi-tenancy:** Define global rules for all tenants or client-specific rules that override global ones.

![Prompt Rules](https://www.pineapplesolutions.it/images/regole-prompt.jpg)

### 🖼️ Media and Connected Websites

* **Connected Websites:** Associate URLs with clients by configuring business sector and icon/logo URL (if left empty, the favicon is automatically extracted). The AI uses the constantly evolving website content as a knowledge source.
* **Media Library (Scraping):**

  * **Photo Extraction:** Extracts images from websites, stores them, generates AI descriptions, and *optimizes them for the web* (up to 40% size reduction while maintaining quality). Active media are provided as visual context to the AI during content generation.
  * **Video Extraction:** Extracts videos, automatically generates descriptions, and converts them to H264/MP4 for web compatibility.

![Media Library](https://www.pineapplesolutions.it/images/libreria-media.jpg)

### 🎬 AI Video (Google VEO Generation)

Create videos from 5 to 60 seconds by defining style, duration, and format (Portrait/Landscape). For videos longer than 8 seconds, the AI generates multiple clips and merges them seamlessly into a continuous sequence.

*Generate storyboard with AI:* The AI creates scenes with durations, narration, music, and generates continuous voice-over audio (TTS).

**Generation Form:**

![AI Video Form](https://www.pineapplesolutions.it/images/video-ai-form.jpg)

**Unified Generation Queue:**

Monitor job status in real time. From each content item, you can edit settings, change models, adjust duration, or preview the result. Supports retries and priorities.

![Video Generation Queue](https://www.pineapplesolutions.it/images/coda-generazione.jpg)

**Generated Clip Details:**

![AI Video Details](https://www.pineapplesolutions.it/images/video-ai-dettaglio.jpg)

### ✍️ Content Studio

Browse and generate content through AI providers using three main modes:

**1. New Post (Semi-Assisted):** Select platform (Instagram/Facebook/TikTok), format (Post, Story, Reel, Carousel), reference media, and watermark removal options. Enter a topic and style, and the AI automatically generates captions, hashtags, and storyboard scenes (which can also be edited manually).

![Content Studio Editor](https://www.pineapplesolutions.it/images/content-studio-editor.jpg)

**2. AI Generator:** Advanced automation starting from a topic or idea.

![AI Generator](https://www.pineapplesolutions.it/images/ai-generator.jpg)

**3. Brainstorming:** Generate 10 random content ideas (posts, stories, reels, etc.) for multiple social platforms at once. Approve them individually and send them to the media generation queue, saving AI tokens.

![AI Brainstorming](https://www.pineapplesolutions.it/images/brainstorming-ai.jpg)

*Additionally:* Improve content using enhancement prompts, edit it manually, regenerate it, and publish it.

### 📊 Analytics, Campaigns, and Dashboard

* **Dashboard:** Central monitoring page with statistics, editorial calendar, and quick actions. Keep track of scheduled posts, pending drafts, and key metrics at all times.

  ![Dashboard Overview](https://www.pineapplesolutions.it/images/dashboard-overview.jpg)

* **Analytics:** Filter statistics by client and platform. Enable *Automatic Synchronization* for each social platform by configuring a frequency (custom CRON or date/time) or start it manually using the "Sync..." button.

  ![Analytics Metrics](https://www.pineapplesolutions.it/images/analytics-metrics.jpg)

* **Campaigns:** Group posts by specific objectives, defining start and end dates. The "Create Campaign" button allows the AI to generate an entire content strategy and scheduling plan.

### 🖥️ User Interface

The interface is fully **Responsive**, optimized for all devices, and includes **Light and Dark Themes** that can be switched from the main navigation bar (which also provides scheduler and notification monitoring). The menu logically organizes sections into Content, Media, and Settings for a clean and intuitive experience.

---

## Technical Documentation Index

1. [Usage Modes](#1-usage-modes)
2. [Common Prerequisites](#2-common-prerequisites)
3. [Environment Configuration (.env.local)](#3-environment-configuration-envlocal)
4. [MySQL Database — Setup](#4-mysql-database--setup)
5. [Prisma Commands (Database Management)](#5-prisma-commands-database-management)
6. [Native Installation on Ubuntu Server](#6-native-installation-on-ubuntu-server)
7. [Docker Installation](#7-docker-installation)
8. [Docker Compose Installation (Recommended)](#8-docker-compose-installation-recommended)
9. [Nginx Reverse Proxy](#9-nginx-reverse-proxy)
10. [SSL Certificate with Certbot](#10-ssl-certificate-with-certbot)
11. [Environment Variables — Complete Reference](#11-environment-variables--complete-reference)
12. [Updates](#12-updates)
13. [Technology Stack](#13-technology-stack)
14. [License and Support](#14-license-and-support)

---





## 1. Usage Modes

The application is designed to operate in two primary scenarios:

### 🌐 SaaS / Shared Service (Multi-Tenant)

Managed by Pineapple Solutions on its own infrastructure. Customers access the platform as distinct **tenants** on the same shared server. Each tenant has completely isolated social accounts, AI providers, scheduling rules, and media libraries. Requires MySQL on a dedicated or managed server (RDS, PlanetScale, etc.).

### 🖥️ On-Premise Installation (Single Customer)

The customer installs the application on their own server (directly on Ubuntu, via Docker, or Kubernetes). In this scenario, MySQL (instead of SQLite) is still recommended for greater reliability, even with a single tenant. MySQL can run inside a Docker container alongside the application using Docker Compose.

---

## 2. Common Prerequisites

### Ubuntu Server 22.04 / 24.04 LTS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget unzip
```

### Clone the Repository

```bash
git clone https://github.com/your-org/pineapple-social-manager.git
cd pineapple-social-manager
```

---

## 3. Environment Configuration (.env.local)

Copy the example file and fill in the real values **before** starting any build:

```bash
cp .env.example .env.local
nano .env.local
```

Minimum required content:

```env
# --- MySQL Database ---
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/pineapple_social_manager"

# --- Auth ---
AUTH_SECRET=choose-a-random-string-at-least-32-characters-long
MASTER_EMAIL=admin@yourdomain.com
MASTER_PASSWORD=ChangeMeImmediately123!

# --- Timezone ---
TZ=Europe/Rome
```

> ⚠️ Never add `.env.local` to Git. It is already included in `.gitignore`.
> ⚠️ Special characters in the MySQL password (e.g. `@`, `+`, `#`) must be **URL-encoded** inside the `DATABASE_URL`.
> Example: `@` → `%40`, `+` → `%2B`, `#` → `%23`.

---

## 4. MySQL Database — Setup

The application uses **MySQL 8+** (or **MariaDB 10.6+**) as its database.

### 4.1 Native MySQL Installation (Ubuntu)

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 4.2 Create Database and Dedicated User

```sql
-- Login as root
sudo mysql -u root -p

-- Create database
CREATE DATABASE pineapple_social_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create dedicated user
CREATE USER 'pineapple_social_manager'@'localhost' IDENTIFIED BY 'secure_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON pineapple_social_manager.* TO 'pineapple_social_manager'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> For Docker Compose installations, the MySQL database is included in `docker-compose.yml` and is automatically configured — see Section 8.

### 4.3 Initial Schema Initialization

After filling in `.env.local` with the correct `DATABASE_URL`:

```bash
npm run db:push
```

This command reads `prisma/schema.prisma` and creates all database tables.

For production environments using tracked migrations, use:

```bash
npm run db:migrate
```

### 4.4 Migration from SQLite (If Migrating an Existing Installation)

If you already have data stored in an old SQLite database (`prisma/prisma/social-manager.db`), you can migrate it automatically:

```bash
npm run db:migrate-from-sqlite
```

The script transfers all records while preserving relationships (idempotent upsert).

---

## 5. Prisma Commands (Database Management)

| Command                          | Description                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run db:generate`            | Regenerates the Prisma Client (after schema changes)                                                   |
| `npm run db:push`                | Applies the schema to the database without creating migration files (dev/staging)                      |
| `npm run db:migrate`             | Creates and applies a tracked migration (production)                                                   |
| `npm run db:studio`              | Opens Prisma Studio — web GUI for exploring and editing data                                           |
| `npm run db:seed`                | Populates the database with initial data (admin, demo tenant, prompt rules)                            |
| `npm run db:migrate-from-sqlite` | Migrates all data from SQLite to MySQL                                                                 |
| `sudo npm run fix-permissions`   | Recreates and fixes permissions for runtime directories (`public/uploads`, `public/watermark-removed`) |

> All Prisma commands automatically read variables from `.env.local`.

---

## 6. Native Installation on Ubuntu Server

### 6.1 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should be v20.x.x
npm -v
```

### 6.2 Recommended Permissions

For security reasons, run the application using a dedicated user (e.g. `pineapple`) instead of `root`.

> ⚠️ **Important note about `.gitignore`:** the entire `public/` directory is excluded from Git.
>
> This means it **does not exist on the server after a clone or `git pull`**.
>
> The directories `public/uploads/` and `public/watermark-removed/` must be created manually and ownership assigned to the user running the application. Otherwise, media generation (photo/video extraction, AI processing, etc.) will fail silently.

```bash
# Create service user without login shell
sudo adduser --system --group --home /var/www/pineapple-social-manager --shell /usr/sbin/nologin pineapple

# Create project directory and assign ownership
sudo mkdir -p /var/www/pineapple-social-manager
sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager

# Create runtime directories (not tracked by Git) and assign permissions
sudo mkdir -p /var/www/pineapple-social-manager/public/uploads/media-library \
               /var/www/pineapple-social-manager/public/uploads/video-ai \
               /var/www/pineapple-social-manager/public/uploads/content-studio \
               /var/www/pineapple-social-manager/public/watermark-removed

sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager/public
sudo chmod -R 755 /var/www/pineapple-social-manager/public

# Permissions for Next.js build directory
sudo mkdir -p /var/www/pineapple-social-manager/.next
sudo chown -R pineapple:pineapple /var/www/pineapple-social-manager/.next
sudo chmod 750 /var/www/pineapple-social-manager/.next

# Protect the secrets file
sudo chmod 640 /var/www/pineapple-social-manager/.env.local
```

> 💡 Alternatively, you can use the included script (after cloning):
>
> ```bash
> sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
> ```

### 6.3 Dependencies, Schema, and Build

```bash
cd /var/www/pineapple-social-manager

npm ci
npm run db:push        # creates MySQL tables
npm run db:seed        # initial data (optional)
npm run build
```

### 6.4 Production Startup

```bash
npm run start
# The application will be available at http://localhost:3010
```














### 6.5 Automatic Startup with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application
pm2 start npm --name "pineapple-social-manager" -- start

# Save the configuration and enable automatic startup at boot
pm2 save
pm2 startup systemd
# Execute the command that PM2 prints on screen (sudo env PATH=...)

# Useful commands
pm2 logs pineapple-social-manager      # real-time logs
pm2 restart pineapple-social-manager   # restart
pm2 stop pineapple-social-manager      # stop
pm2 status                             # status of all processes
```

### 6.6 Development Mode

```bash
npm run dev
# http://localhost:3010
```

> Both development and production environments use port `3010` (as configured in `package.json`). It can be overridden using the `PORT` environment variable.

### 6.7 Permissions Diagnostics (Media Not Being Saved)

If media generation (photo extraction, video extraction, AI processing, etc.) does not save files correctly, follow this diagnostic procedure.

#### A — Verify the User Running PM2

```bash
pm2 info pineapple-social-manager | grep user
# Must show: pineapple
# If it shows root or another user, the app may be writing to the wrong path
```

#### B — Verify That Upload Directories Exist

```bash
ls -la /var/www/pineapple-social-manager/public/
# Must show uploads/ and watermark-removed/ owned by pineapple
```

If the directories do not exist or have incorrect ownership, run the fix script:

```bash
sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
```

#### C — Manual Write Test

```bash
# Test whether the pineapple user can write to the directories
sudo -u pineapple touch /var/www/pineapple-social-manager/public/uploads/test.txt

# If no errors occur → permissions are correct
sudo rm /var/www/pineapple-social-manager/public/uploads/test.txt
```

#### D — Check Application Logs for Filesystem Errors

```bash
pm2 logs pineapple-social-manager --lines 200 | grep -i "EACCES\|ENOENT\|permission\|Error"
```

Common errors and solutions:

| Error                               | Cause                                            | Solution                                         |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `EACCES: permission denied`         | Application user lacks write permissions         | `sudo bash scripts/fix-permissions.sh`           |
| `ENOENT: no such file or directory` | `public/uploads` directory does not exist        | Same solution as above                           |
| Files generated but not visible     | PM2 started as `root`, writing under `/root/...` | Restart PM2 as `pineapple`, then fix permissions |

#### E — Restart PM2 with the Correct User

```bash
# If PM2 is running as root but should run as pineapple:
pm2 delete pineapple-social-manager

sudo -u pineapple pm2 start npm \
  --name "pineapple-social-manager" \
  -- start \
  --cwd /var/www/pineapple-social-manager

sudo -u pineapple pm2 save
sudo -u pineapple pm2 startup systemd
```

---

## 7. Docker Installation

### 7.1 Install Docker on Ubuntu

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

### 7.2 Create the `Dockerfile`

```dockerfile
# ── Stage 1: Dependencies ────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: Build ───────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Runtime ─────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# FFmpeg required for video generation and processing
RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p public/uploads public/watermark-removed && \
    chown -R nextjs:nodejs public

USER nextjs

EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### 7.3 Create the `.dockerignore`

```text
node_modules
.next
.git
*.log
prisma/prisma/social-manager.db
public/uploads
public/watermark-removed
```

### 7.4 Manual Build and Run

```bash
# Build the image
docker build -t pineapple-social-manager:latest .

# Start the container
docker run -d \
  --name pineapple-social-manager \
  --restart unless-stopped \
  -p 3010:3010 \
  --env-file .env.local \
  -v /var/data/psm/uploads:/app/public/uploads \
  -v /var/data/psm/watermark-removed:/app/public/watermark-removed \
  pineapple-social-manager:latest

# Logs
docker logs -f pineapple-social-manager

# Stop and remove
docker stop pineapple-social-manager && docker rm pineapple-social-manager
```

> ⚠️ Always mount volumes for `uploads` and `watermark-removed`: uploaded and generated files must persist across container restarts.

---

## 8. Docker Compose Installation (Recommended)

This deployment mode includes **MySQL** inside the Compose stack and is ideal for customer on-premise installations.

### 8.1 Install Docker Compose

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

### 8.2 Create `docker-compose.yml`

```yaml
version: "3.9"

services:
  mysql:
    image: mysql:8.0
    container_name: pineapple-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: change_me_root_password
      MYSQL_DATABASE: pineapple_social_manager
      MYSQL_USER: pineapple_social_manager
      MYSQL_PASSWORD: change_me_password
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

  # Nginx reverse proxy (optional but recommended)
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

In `.env.local`, use the Docker service name (`mysql`) as the database host:

```env
DATABASE_URL="mysql://pineapple_social_manager:change_me_password@mysql:3306/pineapple_social_manager"
```

### 8.3 First Startup

```bash
# Build and start
docker compose up -d --build

# Initialize database schema (first startup only)
docker compose exec app npx prisma db push

# Seed initial data (optional)
docker compose exec app npx prisma db seed

# Real-time logs
docker compose logs -f app
```

### 8.4 Docker Compose Commands

```bash
# Stop services
docker compose down

# Rebuild after code updates
docker compose up -d --build --force-recreate

# Show container status
docker compose ps

# Open MySQL shell
docker compose exec mysql mysql \
  -u pineapple_social_manager \
  -p pineapple_social_manager
```

---

## 9. Reverse proxy con Nginx

### Installazione Nginx (nativa)

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/pineapple-social-manager
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name social.yourdomain.com;

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

### Enable and restart

```bash
sudo ln -s /etc/nginx/sites-available/pineapple-social-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx && sudo systemctl enable nginx
```

### Nginx Configuration for Docker Compose (`nginx/nginx.conf`)

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

## 10. SSL Certificate with Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get the certificate (replace with your domain)
sudo certbot --nginx -d social.tuodominio.it

# Verify automatic renewal
sudo certbot renew --dry-run
```

Certbot automatically updates the Nginx config with the HTTPS redirect.

---

## 11. Environment Variables — complete reference

| Variabile | Tipo | Obbligatoria | Descrizione |
|---|---|---|---|
| `DATABASE_URL` | `string` | ✅ | Connection string MySQL. Format: `mysql://user:pass@host:3306/dbname`. Special characters in the password must be URL-encoded (`@`→`%40`, `+`→`%2B`, `#`→`%23`). |
| `AUTH_SECRET` | `string` | ✅ | Secret key for signing session JWTs[cite: 5]. Minimum 32 random characters. |
| `MASTER_EMAIL` | `string` | ✅ | Email of the master administrator account (created at the first `db:seed`). |
| `MASTER_PASSWORD` | `string` | ✅ | Password of the master administrator account. |
| `TZ` | `string` | No | Server timezone (default: `Europe/Rome`). Used by the scheduler and dates. |

> **Note:** access tokens for Instagram / Facebook / TikTok, and tenant configurations are set **from the UI** → *Settings → AI Providers* / *Social Accounts* and are saved in the database, not in the environment variables.

---

## 12. Updates

### 12.1 Native update on Ubuntu + PM2

Assumptions:
- project path: `/var/www/pineapple-social-manager`
- PM2 process: `pineapple-social-manager`
- deploy branch: `main`

#### Step A — Pre-check

```bash
cd /var/www/pineapple-social-manager
pm2 status
git status
git rev-parse --short HEAD
```

#### Step B — Code + dependencies + build update

```bash
cd /var/www/pineapple-social-manager

git fetch origin
git checkout main
git pull --ff-only origin main

# Install dependencies cleanly
npm ci

# Apply any new migrations to the DB
npm run db:migrate

# Production build
npm run build
```

> If there are new environment variables, update `.env.local` before `npm run build`.

#### Step C — Zero-downtime restart with PM2

```bash
pm2 reload pineapple-social-manager || pm2 restart pineapple-social-manager
pm2 save
```

#### Step D — Restore runtime folders permissions

> ⚠️ After every `git pull` + `npm run build` it is **mandatory** to re-run this step,
> because the build can modify the ownership of some folders and `public/` is not in Git,
> so it is not recreated automatically.

```bash
sudo bash /var/www/pineapple-social-manager/scripts/fix-permissions.sh
```

#### Step E — Post-deploy check

```bash
pm2 status
pm2 logs pineapple-social-manager --lines 100
ss -ltnp | grep 3010
curl -I http://127.0.0.1:3010
```

### 12.2 Quick Rollback

```bash
cd /var/www/pineapple-social-manager

git reset --hard HEAD~1
npm ci
npm run build
pm2 restart pineapple-social-manager
pm2 save
```

### 12.3 Docker Compose Update

```bash
git pull origin main
docker compose up -d --build --force-recreate

# Applica eventuali nuove migration al DB
docker compose exec app npx prisma migrate deploy
```

### 12.4 Clean up unused Docker images

```bash
docker image prune -f
```

---

## 13. Technical Stack

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, SSR, API Routes) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Animations | Framer Motion 11 |
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

This software is distributed under the **Pineapple Open-Source License (Based on BSL/Dual-License)**:
- **✅ Free to use:** You can download, install and use the software for free to manage your socials or those of your agency.
- **✅ Modifications (with consent):** Contributions and PRs are welcome![cite: 5] Platform improvement modifications can be used prior to approval by the community or the author.
- **❌ Prohibition of Commercial Resale (SaaS):** It is not allowed to take this source code, brand it and resell it as a commercial SaaS (Software-as-a-Service) service to third parties without an explicit commercial license.

If you need **premium support, dedicated installation or a commercial license** to resell the platform white-label, contact us. 

🍍 **Support the Project:** If this platform helps you scale your business, consider making a donation to support the development! 

---


## ⚠️ Limitations, Development Status and Liability

### 🛠️ Features Not Yet Developed (Coming Soon)
Please note that the project is in active development[cite: 5]. The following features, although documented or visible in the interface, **have not yet been implemented** and will be released in future versions:

* **AI Provider Testing and Integration:** It is necessary to complete operational tests and validate full integration for **Anthropic** and **OpenAI**.
* **Campaigns Section:** Grouping posts into campaigns with start/end dates and automatically generating an entire editorial plan via AI have not been completed
* **Multi-language Support:** The interface and system are currently available **exclusively in Italian**. Support for internationalization (i18n) and localization into other languages will be added in the future.

### 🛑 Disclaimer of Liability (Disclaimer)
This software is provided "as is", without warranties of any kind, express or implied

* The author (Giovanni Buglione) and *Pineapple Solutions di Buglione Giovanni* **assume no responsibility** for the improper or illegal use of the program, nor for any violations of the Terms of Service of the social platforms (Meta/Facebook, Instagram, TikTok) caused by the use of automations, scraping or massive publishing.
* The user is solely responsible for the safekeeping of the AI provider API Keys (OpenAI, Anthropic, Google) and the costs deriving from them, as well as the management and security of their clients' (tenants) data.

*Pineapple IT Solutions di Buglione Giovanni — [pineapplesolutions.it](https://pineapplesolutions.it)*
