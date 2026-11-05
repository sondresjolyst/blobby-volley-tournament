# blobby-volley-tournament

Tournament and fake-points betting site for Blobby Volley 2. Points are called Foza.

## Run locally

Requires Node 26.

    npm install
    cp .env.example .env.local
    npm run dev

The site runs on http://localhost:3000. The `/health` route returns a small JSON status.

## Admin login

Pages under `/admin` and routes under `/api/admin` need a GitHub login. All other pages are public. Set these in `.env.local`, see `.env.example`.

- `NEXTAUTH_URL`: the public address of the site. In production it must start with `https://`. Otherwise the admin pages and sign-in return 503.
- `NEXTAUTH_SECRET`: a long random string that signs the session.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth app. Set its callback URL to `<NEXTAUTH_URL>/api/auth/callback/github`.
- `ALLOWED_GITHUB_USER_IDS`: the numeric GitHub user IDs of the admins, separated by commas. An empty value lets nobody in. Find an ID at `https://api.github.com/users/<login>`.

## Test

    npm run lint
    npm run typecheck
    npm test
    npx playwright install chromium
    npm run test:e2e

The end-to-end test builds the site, copies the static files and starts the standalone server on port 3100.

## Build

    npm run build
    npm start

Docker:

    docker build -t blobby-volley-tournament .
