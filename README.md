# blobby-volley-tournament

Tournament and fake-points betting site for Blobby Volley 2. Points are called Foza.

## Run locally

Requires Node 26.

    npm install
    cp .env.example .env.local
    npm run db:migrate
    npm run dev

The site runs on http://localhost:3000. The `/health` route returns a small JSON status.

## Database

The site uses Postgres. Set `DATABASE_URL` in `.env.local` to its connection string.

The schema lives in numbered SQL files in `migrations/`. `npm run db:migrate` applies the files that have not run yet, in order, and records each in the `schema_migrations` table. It reads `DATABASE_URL` from the shell or from `.env.local`. Run it before starting a new version of the site. The Docker image includes the files, so it can run them too:

    docker run --rm -e DATABASE_URL blobby-volley-tournament node scripts/migrate.mjs

To change the schema, add a new file with the next number. Do not edit a file that has run.

## Events and players

An admin creates an event for each LAN under `/admin/events`, with a name, dates, an event code, a starting Foza amount and a daily Foza amount. One event at a time is active. Past events stay stored.

Players sign up at `/join` with the event code, a nickname and a 4 digit PIN, and sign in at `/login`. `/me` shows the nickname and the Foza balance. A nickname is at most 15 bytes in UTF-8, so æ, ø and å count as 2. Nicknames are unique per event, ignoring case. An event code is 8 to 32 characters. An admin can reset a player's PIN on the event page.

Sign-in has these limits:

- After 5 wrong PINs in a row the player is locked for 15 minutes. The next locks last 30 and then 60 minutes, until the player signs in with the right PIN.
- One event can have 300 wrong PINs on its players per hour, across all players.
- One client address can have 100 unknown nicknames and wrong event codes per hour. Wrong PINs on real players do not count here, so players who share one address at a LAN cannot block each other. An IPv6 address counts by its /64 prefix.

`TRUSTED_PROXY_IP_HEADER` names the header in which the proxy in front of the site puts the client address, such as `x-forwarded-for` or `x-real-ip`. Set it only behind a proxy that overwrites that header with the real client address. Otherwise a client can send any address and get a fresh limit each time. For a list, the last address is used. Without the variable, all clients share one limit, and the site logs a warning at startup in production.

Form posts must come from the site itself. The browser must send `Sec-Fetch-Site` as `same-origin` or `none`, or an `Origin` that matches `NEXTAUTH_URL`.

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
    npm run test:db
    npm run build
    npx playwright install chromium
    npm run test:e2e

`npm run test:db` and `npm run test:e2e` need Docker. Each starts a throwaway Postgres container and removes it afterwards. The end-to-end test needs `npm run build` first. It runs the migrations, adds a test event, copies the static files and starts the standalone server on port 3100.

## Build

    npm run build
    npm start

Docker:

    docker build -t blobby-volley-tournament .
