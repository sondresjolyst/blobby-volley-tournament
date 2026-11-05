# blobby-volley-tournament

Tournament and fake-points betting site for Blobby Volley 2. Points are called Foza.

## Run locally

Requires Node 24.

    npm install
    cp .env.example .env.local
    npm run dev

The site runs on http://localhost:3000. The `/health` route returns a small JSON status.

## Test

    npm run lint
    npm run typecheck
    npm test
    npx playwright install chromium
    npm run test:e2e

The end-to-end test builds the site and starts it on port 3100.

## Build

    npm run build
    npm start

Docker:

    docker build -t blobby-volley-tournament .
