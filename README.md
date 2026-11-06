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

An event can also have the host and port of the game server at the LAN. The site builds join links from them. Each player gets a secret join code at sign-up, 10 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, so 0, O, 1, I and L are never used. Codes are drawn from a cryptographic random source and are unique per event. On the event page an admin can give a player a new code, which stops the old one at the next sync of the game server. The admin page does not show codes. A player sees their own code only in the join link, `blobby://join?server=<host>:<port>&code=<code>`.

Sign-in has these limits:

- After 5 wrong PINs in a row the player is locked for 15 minutes. The next locks last 30 and then 60 minutes, until the player signs in with the right PIN.
- Wrong PINs are counted per event. Above 300 in an hour the site logs a warning, but it does not block sign-in. A right PIN always works unless the player is locked.
- One client address can have 100 unknown nicknames and wrong event codes per hour. Wrong PINs on real players do not count here, so players who share one address at a LAN cannot block each other. An IPv6 address counts by its /64 prefix.

`TRUSTED_PROXY_IP_HEADER` names the header in which the proxy in front of the site puts the client address, such as `x-forwarded-for` or `x-real-ip`. Set it only behind a proxy that overwrites that header with the real client address. Otherwise a client can send any address and get a fresh limit each time. For a list, the last address is used. Without the variable, all clients share one limit, and the site logs a warning at startup in production.

Form posts must come from the site itself. The browser must send `Sec-Fetch-Site` as `same-origin` or `none`, or an `Origin` that matches `NEXTAUTH_URL`.

## Tournaments

An admin builds tournaments for the active event under `/admin/tournaments`. A tournament has a name, a format, 2 to 32 players from the event and a list of rounds. The formats are single elimination and double elimination. In double elimination a player who loses in the winners bracket drops to the losers bracket, and the two bracket champions meet once in a grand final.

When the player count is not a power of two, the top seeds get byes and go straight to round two. Seeding is random by default. The admin can seed by hand or by Elo rating instead. Elo ratings come later, so for now every player counts as 1000. The random seed is shown on the form and stored with the tournament, and the same seed and players always give the same bracket.

Each round has a best-of of 1, 3, 5 or 7 and a rule file, `default.lua` unless the admin names another. The tournament sets the points that win a game, 1 to 99 and 15 by default, and the game speed in frames per second, 30 to 120 and 75 by default. Every match of the tournament gets them. A 1v1 match has its own. Press Preview to see the bracket and Save tournament to store it. After a change to the players or the format, press Preview again before you save. Each stored match records the match its winner and its loser move on to.

Final places: 1st is the winner of the final and 2nd its loser. In double elimination 3rd is the loser of the losers final. There is no reset match. A single elimination tournament can have a third place match between the two semifinal losers, off by default. Without it both semifinal losers share 3rd.

In double elimination the losers of each winners round drop into the losers bracket in an order that keeps rematches as late as possible. From 5 players on, two players who met in the winners bracket can still meet again in the last rounds of the losers bracket. No order avoids that.

The bracket logic is in `src/lib/bracket`. It has no database access. A new format implements `BracketFormat` and is added to `FORMATS`.

## Matches

Each tournament match and each 1v1 match is a row in the `matches` table. A match is upcoming, called, started, finished or cancelled. People can bet on an upcoming or called match once both players are known. An admin calls one or several matches under `/admin/matches` when the players should join. A match starts when the game server reports both players connected, and bets close then.

A match is best of 1, 3, 5 or 7. Each game is stored with its own result, and the series score is stored with the match. A game that ends without a winner, such as on a disconnect, is abandoned and does not count. The admin then restarts it from 0-0 or awards it.

On the match page an admin can restart the current game, enter or correct a game result, set the series score by hand, record a no-show, reset the match to upcoming and cancel a 1v1 match. A game result needs more points for the winner. A no-show gives the other player the win. A tournament match cannot be cancelled, since the bracket could not move on. Record a no-show instead. When a series is decided, the winner and the loser move on to their next matches and the tournament places are updated. A correction works out the series and the bracket again. It is refused when it would move a player out of a later match that is already called, started or finished. The page then links to that match. Reset it to upcoming, which clears its games and refunds its bets, and the correction goes through.

The game server sends each game result with a report id that is unique across all matches, a UUID. It reads the next game number again before each game. A report that comes again changes nothing. A report for a game that already has a result, such as one an admin entered, is kept but ignored. See [Game server API](#game-server-api).

A player can ask another player of the active event for a 1v1 match. It can be called once the other player accepts. The pages for this come later.

Every match change is in `src/lib/store/matches.ts`. Each change runs in one transaction and passes what happened to `handleMatchEvents` in `src/lib/store/match-events.ts` before it commits. A bet must lock the match first with `withMatchForBet` in the same transaction.

## Foza and betting

Foza has no real value. Every change to a balance is a row in the `foza_ledger` table: the starting Foza, the daily Foza, bets, payouts, refunds, reversals and admin adjustments. A trigger adds each row to the balance on the player, and a check at commit refuses a balance that does not equal the sum of its ledger. Ledger rows are never changed or removed.

Each player gets the daily Foza of the event once per calendar day in Europe/Oslo time while the event is active, from the day after sign-up. It is paid when the player next reads the balance or bets. It is paid only for days the player uses the site. Missed days are not paid later.

Signed in players bet on `/me`. Odds are parimutuel. All bets on a match form a pool, and when the match is decided, bettors on the winner share the whole pool in proportion to their stake. Payouts round down to whole Foza, and leftovers are discarded. If nobody bet on the winner, every stake comes back. A player has one bet per match, can raise it but not move it to the other side, and can bet on their own match. A no-show, a cancel and a reset refund the bets. A correction that changes the winner takes back the payouts and pays out again, even when that takes a balance below 0.

- `POST /api/player/bets` places or raises a bet from the form on `/me`.
- `GET /api/player/bets` lists the bets of the signed in player.
- `GET /api/player/balance` returns the balance of the signed in player, with the daily Foza paid.

The two GET routes answer 401 when nobody is signed in. A signed out bet post is sent to `/login`.
- `GET /api/matches/<id>/pool` is public and returns the pool of a match and the payout multiplier for each player.

An admin can add or take Foza from a player with a reason on the event page.

## Sponsors

An admin manages the sponsors of an event on its page under `/admin/events`. A sponsor has a name of at most 60 characters, an optional http or https link, a logo, a place in the order and an on or off switch. Up and Down move a sponsor one place. The footer of every page and the game server API list the sponsors of the active event that are on, in this order. An event has at most 50 sponsors.

Each event also has a style for the sponsor board in the game, picked in a list above the sponsors. The styles are `off`, `led` (dark LED with a metal frame), `printed` (white printed panels), `wood` (a wooden beach bar), `slim` (slim glossy LED) and `padded` (a padded rounded board). A new event starts with `off`. While the board is off the game server gets no sponsors and the game shows no board. The footer and the logo routes are not affected.

A logo is a PNG, JPEG or WebP file of at most 1 MB and at most 2000 pixels wide and high. The site checks the first bytes of the file and decodes the whole image before it stores it. The type the browser sends is ignored. SVG is refused, since an SVG file can hold scripts. The site then writes the logo again in its own format and stores that in the database. This drops EXIF, GPS and other metadata, turns the image upright and converts its colours to sRGB.

For the game the site makes a 32-bit BMP with alpha, 32 pixels high and at most 160 wide, with the aspect ratio kept. It has a `BITMAPV4HEADER` with `BI_BITFIELDS` and the masks red `0x00FF0000`, green `0x0000FF00`, blue `0x000000FF` and alpha `0xFF000000`, and the rows are stored from the bottom up. Transparent parts stay transparent, so the board in the game shows through. A wider logo is centred on a transparent band 32 pixels high. An admin can give a sponsor its own game background for a logo that needs a backing. The logo is then put on that colour and every pixel is opaque. A changed colour makes the BMP again from the stored logo. The board style does not change the BMP.

Game logos stored before the alpha channel are 24-bit. The site makes each of them again from the stored logo the first time the game server asks for the sponsors after the update. Sponsors that had the old white default lose it and keep their transparency. Another colour stays as their own game background.

`GET /api/sponsors/<id>/logo` is public and returns the logo of a sponsor that is on in the active event, with its own content type and `X-Content-Type-Options: nosniff`. The footer adds `?v=<hash>`, the SHA-256 of the logo, and that address may be cached for a year. Without it the browser checks the ETag each time.

Images are decoded with [sharp](https://sharp.pixelplumbing.com), which ships prebuilt libvips for Linux, macOS and Windows. Only its PNG, JPEG and WebP decoders are allowed to run. The BMP is written by `src/lib/sponsors/bmp.ts`.

## Game server API

The dedicated game server at the LAN calls these routes. It only calls out to the site. The site never calls it. If the site cannot be reached, the server keeps the last sync on disk and sends its reports later, so a report may arrive late or twice.

Every route under `/api/server` needs the header `Authorization: Bearer <token>`, where the token is the value of `GAME_SERVER_TOKEN`. The site compares it in constant time and never logs it. These routes do not use the admin login or the player session.

- No header, or another token: `401` with `{ "error": "unauthorized" }`.
- `GAME_SERVER_TOKEN` is not set or empty: `503` with `{ "error": "not-configured" }` for every request.
- A body that is not valid: `400` with `{ "error": "invalid", "field": "<the first bad field>" }`. The field is `body` when the body is not a JSON object or is larger than 16 KB.

Bodies are JSON. Ids are whole numbers from 1 to 2147483647. Points are whole numbers from 0 to 1000. Times are ISO 8601 with a time zone, such as `2026-11-20T18:04:05Z`. How the server should treat an answer:

- `200`, `400` and `404` are final. Do not send the same request again. A `400` or `404` means the request itself is wrong and will never work.
- `401` and `503` mean the token is wrong or not set on the site. Sending again does not help. Fix the configuration first, and keep the queued reports until then.
- Any other `5xx` or a network error: try again later with the same body.

Reports for one match must be sent one at a time and in game order. Wait for the answer to game 1 before sending game 2. A report for a game past `nextGame` is refused with `game-ahead`, and that answer is final.

### Join codes

The game sends a player's join code in its 16 byte player name field. A code is 10 ASCII characters, so it fits. The server looks the code up in the last sync, uses the nickname from the sync instead, and refuses a code it does not know.

### GET /api/server/sync

Everything the server needs: the active event, every player of it with the join code, and every match that is called or started. Matches are sorted by id. In `players` of a match, player 1 comes first.

    curl -H "Authorization: Bearer $GAME_SERVER_TOKEN" https://<site>/api/server/sync

```json
{
  "serverTime": "2026-11-20T18:00:00.000Z",
  "syncVersion": "3f9a1c0d5e7b2a44",
  "eventId": 1,
  "players": [
    { "playerId": 12, "nickname": "Ola", "code": "K7QM2XPR4T" },
    { "playerId": 17, "nickname": "Kari", "code": "B9HNZ3WD6F" }
  ],
  "matches": [
    {
      "matchId": 7,
      "state": "called",
      "bestOf": 3,
      "nextGame": 1,
      "ruleFile": "default.lua",
      "scoreToWin": 15,
      "speed": 75,
      "awaitingDecision": false,
      "players": [
        { "playerId": 12, "code": "K7QM2XPR4T" },
        { "playerId": 17, "code": "B9HNZ3WD6F" }
      ]
    }
  ]
}
```

- `syncVersion` changes whenever anything else in the answer changes, apart from `serverTime`. The same content always gives the same version.
- `eventId` is `null` and both lists are empty when no event is active.
- `state` is `called` until both players connect, then `started`. A finished, cancelled or reset match leaves the list.
- `nextGame` is the number the next game must be reported with. An admin restart or reset moves it on, so read it again before each game.
- `awaitingDecision` is `true` when the last game was abandoned and the admin has not restarted or awarded it yet. The server should wait.
- `speed` is in frames per second. `scoreToWin` is the points that win one game.

### GET /api/server/sponsors

The sponsor board style of the active event and its sponsors that are on, in the order the admin set. Each logo is a 32-bit BMP with alpha, 32 pixels high and at most 160 wide, sent as base64.

    curl -H "Authorization: Bearer $GAME_SERVER_TOKEN" https://<site>/api/server/sponsors

```json
{
  "eventId": 1,
  "gameBoard": "led",
  "sponsorsVersion": "9c1e44b07a2d3f58",
  "sponsors": [
    {
      "sponsorId": 3,
      "name": "Acme",
      "logo": {
        "format": "bmp",
        "width": 96,
        "height": 32,
        "bitsPerPixel": 32,
        "hash": "<SHA-256 of the BMP bytes, 64 hex characters>",
        "data": "Qk16MAAAAAAAAHoAAABsAAAAYAAAACAAAAABACAAAwAAAAAw..."
      }
    }
  ]
}
```

- `gameBoard` is the style of the board: `off`, `led`, `printed`, `wood`, `slim` or `padded`. When it is `off` the list is empty and the game shows no board.
- `sponsorsVersion` changes whenever the board style, the list, a name or a logo changes. When it is the same as last time, nothing changed.
- `bitsPerPixel` is 32. Transparent pixels have an alpha of 0, and a sponsor with its own game background has an alpha of 255 everywhere.
- `hash` is the SHA-256 of the BMP. The server can keep logos by hash and skip one it already has.
- `eventId` is `null`, `gameBoard` is `off` and the list is empty when no event is active.

### POST /api/server/matches/{id}/connected

Both players of the match are connected. A called match starts, and bets on it close. A repeat call changes nothing.

```json
{ "playerIds": [12, 17] }
```

- `200` `{ "status": "started" }`: the match started now.
- `200` `{ "status": "already-started" }`: it had started already.
- `200` `{ "status": "refused", "reason": "players" }`: the ids are not the two players of the match, in any order.
- `200` `{ "status": "refused", "reason": "state" }`: the match is not called or started.
- `200` `{ "status": "refused", "reason": "not-found" }`: there is no such match.
- `400` `{ "error": "invalid", "field": "id" }`: the id in the address is not a match id.

### POST /api/server/games

One game ended. Send it once per game, with a new UUID as `reportId`. Send the same body again only when no final answer came back. Send the reports of one match one at a time, in game order.

```json
{
  "reportId": "0b6f2f4e-8a51-4d4c-9a0e-5d2b8c3f1a77",
  "matchId": 7,
  "game": 1,
  "status": "finished",
  "winnerId": 17,
  "points": [
    { "playerId": 12, "points": 11 },
    { "playerId": 17, "points": 15 }
  ],
  "startedAt": "2026-11-20T18:00:00Z",
  "endedAt": "2026-11-20T18:05:12Z"
}
```

- `status` is `finished` or `abandoned`. A finished game needs `winnerId`, and the winner must have more points. An abandoned game, such as on a disconnect, has `winnerId` `null` or leaves it out.
- `points` holds both players of the match, in any order.
- `endedAt` may not be before `startedAt`.

Answers:

- `200` `{ "status": "stored" }`: the game is stored. When it decides the series, the match finishes, bets settle and the bracket moves on. A report for a called match starts it first.
- `200` `{ "status": "duplicate" }`: a report with this id came before, whatever its answer was then. Nothing changed.
- `200` `{ "status": "game-closed" }`: the game already has a result, from an admin or an earlier report, or a reset cleared it. The report is kept but changes nothing.
- `200` `{ "status": "refused", "reason": "<reason>" }`: nothing changed. `not-found`: no such match. `players`: the players are not the two of the match. `state`: the match is not called or started. `game-ahead`: the game number is past `nextGame`. `score`: the points do not fit the result.

### POST /api/server/live

The score of the game being played, for the big screen. Send it as often as is useful. It is best effort and never changes a result.

```json
{
  "matchId": 7,
  "game": 2,
  "points": [
    { "playerId": 12, "points": 4 },
    { "playerId": 17, "points": 6 }
  ]
}
```

- `200` `{ "status": "stored" }`
- `200` `{ "status": "ignored", "reason": "<reason>" }`: `not-found`, `state` when the match is not called or started, `players`, `game-closed` when the game already has a result, or `game-ahead` when the game number is past `nextGame`. Only the next game is stored, so one wrong number does not block later updates.

### GET /api/matches/{id}/live

Public, for the big screen. No token. `live` is `null` when no game is being played or no score has come in for it. Player 1 comes first. `404` when there is no such match.

```json
{
  "matchId": 7,
  "state": "started",
  "live": {
    "game": 2,
    "points": [
      { "playerId": 12, "points": 4 },
      { "playerId": 17, "points": 6 }
    ],
    "updatedAt": "2026-11-20T18:09:41.000Z"
  }
}
```

## Admin login

Pages under `/admin` and routes under `/api/admin` need a GitHub login. All other pages are public. Set these in `.env.local`, see `.env.example`.

- `NEXTAUTH_URL`: the public address of the site. In production it must start with `https://`. Otherwise the admin pages and sign-in return 503.
- `NEXTAUTH_SECRET`: a long random string that signs the session.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth app. Set its callback URL to `<NEXTAUTH_URL>/api/auth/callback/github`.
- `ALLOWED_GITHUB_USER_IDS`: the numeric GitHub user IDs of the admins, separated by commas. An empty value lets nobody in. Find an ID at `https://api.github.com/users/<login>`.

`GAME_SERVER_TOKEN` is the token of the game server API. Set it to a long random string, such as the output of `openssl rand -hex 32`, and give the same value to the game server. Without it that API answers 503.

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
