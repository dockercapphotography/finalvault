# FinalVault

Beautiful client gallery delivery for photographers. Built on the same stack as PoseVault.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4 |
| Build | Vite 7, vite-plugin-pwa |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Image Storage | Cloudflare R2 |
| R2 Proxy | Cloudflare Worker (`finalvault-worker`) |
| ZIP Downloads | JSZip |
| Image Viewer | Swiper + react-zoom-pan-pinch |
| Icons | Lucide React |
| Testing | Playwright |

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/dockercapphotography/finalvault.git
cd finalvault
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your Supabase and Cloudflare R2 Worker credentials in `.env`.

### 3. Run database migrations

In your Supabase project, run the SQL files in `/sql` in order (001 → 010).

### 4. Deploy the R2 Worker

```bash
cd r2-worker
npm install
npx wrangler deploy
```

### 5. Start the dev server

```bash
npm run dev
```

## Testing

```bash
# Run all Playwright tests
npm test

# Run with UI
npm run test:ui

# View last report
npm run test:report
```

Tests run against a dedicated test Supabase project. Configure `PLAYWRIGHT_SUPABASE_URL` and `PLAYWRIGHT_SUPABASE_SERVICE_KEY` in your `.env`.

## Deployment

Deployed to Cloudflare Pages at `finalvault.dockercapphotography.com`.

```bash
npm run build
```

## License

Copyright © 2025–2026 Docker Cap Photography. All rights reserved.
