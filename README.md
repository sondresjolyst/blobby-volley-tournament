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

Players sign up at `/join` with the event code, a nickname and a 4 digit PIN, and sign in at `/login`. `/me` shows the nickname and the Foza balance. A nickname is at most 15 bytes in UTF-8, so æ, ø and å count as 2. Nicknames are unique per event, ignoring case. After 5 wrong PINs in a row the player is locked for 15 minutes. An admin can reset a player's PIN on the event page.


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
