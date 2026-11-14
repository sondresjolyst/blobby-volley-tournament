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

The runner only applies files forward. It never runs the files in `migrations/down/`. To roll back a migration, restore a backup of the database from before it ran.

## Events and players

An admin creates an event for each LAN under `/admin/events`, with a name, dates, an event code, a starting Foza amount and a daily Foza amount. One event at a time is active. Past events stay stored. The code field suggests a code from the name with four random characters at the end, since the name is public. Generate makes a fully random code from letters and digits that are easy to read out. Two events cannot have the same code.

A player has one account for every LAN, with a nickname and a 4 digit PIN. A new player signs up at `/join` with the event code, a nickname and a PIN. That makes the account and its player in the active event. Players sign in at `/login` with the nickname and the PIN. An account that has not joined the active event yet is sent to `/bli-med`, where it enters the event code once. That adds its player to the event with the starting Foza and a new join code. Foza, bets and matches belong to the player of one event. The nickname, the PIN, the PIN lock and the Elo rating belong to the account.

A nickname is at most 15 bytes in UTF-8, so æ, ø and å count as 2. Nicknames are unique across all accounts, ignoring case. A player can change the nickname on `/me` to one that is free, at most once an hour. Every page shows the new nickname, also for past events, and the site logs each change. An event code is 8 to 32 characters. An admin can reset a player's PIN on the event page. The new PIN works at every LAN.

The accounts came with migration `0021_accounts.sql`. It made one account for all players with the same nickname, ignoring case, with the nickname, the PIN and the PIN lock of the player in the newest event. A session from before stays signed in only when its player is that player. Everyone else signs in again with the PIN of the account.

An event can also have the host and port of the game server at the LAN. The site builds join links from them. The host is the LAN address of the PC that runs the game server, so localhost and its other names, 127.0.0.1 and web addresses with http:// are refused. A host that looks like a number must be a plain IPv4 address such as 192.168.1.50. An empty port means 1234, and a new port needs the game server container started again with the new port. An admin can change the host on the event page while the event runs, and the next load of `/me` and `/admin/game-server` shows the new address. Each player gets a secret join code at sign-up, 10 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, so 0, O, 1, I and L are never used. Codes are drawn from a cryptographic random source and are unique per event. On the event page an admin can give a player a new code, which stops the old one at the next sync of the game server. The admin page does not show codes. A player sees their own code only on their own `/me`, in the join link `blobby://join?server=<host>:<port>&code=<code>` and as text.

Sign-in has these limits:

- After 5 wrong PINs in a row the account is locked for 15 minutes. The next locks last 30 and then 60 minutes, until the player signs in with the right PIN. Wrong PINs are forgotten when the last one is more than 24 hours old.
- One client address can have 40 wrong PINs on real players per hour, across all players. Above that the address cannot try a PIN, not even the right one, until the hour is over.
- One client address can sign up 50 new accounts per hour.
- Wrong PINs are counted per event. Above 300 in an hour the site logs a warning, but it does not block sign-in. A right PIN always works unless the account is locked.
- One client address can have 100 unknown nicknames and wrong event codes per hour. Wrong PINs on real players do not count here. An IPv6 address counts by its /64 prefix in every limit.

`TRUSTED_PROXY_IP_HEADER` names the header in which the proxy in front of the site puts the client address, such as `x-forwarded-for` or `x-real-ip`. Set it only behind a proxy that overwrites that header with the real client address. Otherwise a client can send any address and get a fresh limit each time. For a list, the last address is used. Without the variable, all clients share one limit, and the site logs a warning at startup in production.

Form posts must come from the site itself. The browser must send `Sec-Fetch-Site` as `same-origin` or `none`, or an `Origin` that matches `NEXTAUTH_URL`.

## Tournaments

An admin builds tournaments for the active event under `/admin/tournaments`. A tournament has a name, a format, 2 to 32 players from the event and a list of rounds. The formats are single elimination and double elimination. In double elimination a player who loses in the winners bracket drops to the losers bracket, and the two bracket champions meet once in a grand final.

When the player count is not a power of two, the top seeds get byes and go straight to round two. Seeding is random by default. The admin can seed by hand or by Elo rating instead. Elo seeding puts the highest rating first and uses the ratings at the moment the tournament is saved. Equal ratings go in sign-up order. The random seed is shown on the form and stored with the tournament, and the same seed and players always give the same bracket.

Each round has a best-of of 1, 3, 5 or 7 and a rule file, `default.lua` unless the admin names another. The tournament sets the points that win a game, 1 to 99 and 15 by default, and the game speed in frames per second, 30 to 120 and 75 by default. Every match of the tournament gets them. A 1v1 match has its own. The tournament page also sets the pause between games of a series, from 3 to 120 seconds and 10 by default. It can change at any time, and the game server gets it in its next sync. A 1v1 match uses 10 seconds. Press Preview to see the bracket and Save tournament to store it. After a change to the players or the format, press Preview again before you save. Each stored match records the match its winner and its loser move on to.

Final places: 1st is the winner of the final and 2nd its loser. In double elimination 3rd is the loser of the losers final. There is no reset match. A single elimination tournament can have a third place match between the two semifinal losers, off by default. Without it both semifinal losers share 3rd.

In double elimination the losers of each winners round drop into the losers bracket in an order that keeps rematches as late as possible. From 5 players on, two players who met in the winners bracket can still meet again in the last rounds of the losers bracket. No order avoids that.

The bracket logic is in `src/lib/bracket`. It has no database access. A new format implements `BracketFormat` and is added to `FORMATS`.

## Matches

Each tournament match and each 1v1 match is a row in the `matches` table. A match is upcoming, called, started, finished or cancelled. People can bet on an upcoming or called match once both players are known. An admin calls one or several tournament matches under `/admin/matches` when the players should join. A 1v1 match is called by itself. A match starts when the game server reports both players connected, and bets close then.

A match is best of 1, 3, 5 or 7. Each game is stored with its own result, and the series score is stored with the match. A game that ends without a winner, such as on a disconnect, is abandoned and does not count. The admin then restarts it from 0-0 or awards it. The admin home page lists every match that waits for this decision at the top, with the event, the tournament and round, the players, the score when the game stopped and who left, and a link to the match. The match page shows the same score and who left.

On the match page an admin can restart the current game, enter or correct a game result, set the series score by hand, record a no-show, reset the match to upcoming and cancel a 1v1 match. A game result needs more points for the winner. It may be below the points to win, so an abandoned game can be awarded at the score where it stopped. A no-show gives the other player the win. A tournament match cannot be cancelled, since the bracket could not move on. Record a no-show instead. When a series is decided, the winner and the loser move on to their next matches and the tournament places are updated. A correction works out the series and the bracket again. It is refused when it would move a player out of a later match that is already called, started or finished. The page then links to that match. Reset it to upcoming, which clears its games and refunds its bets, and the correction goes through.

The game server sends each game result with a report id that is unique across all matches, a UUID. It reads the next game number again before each game. A report that comes again changes nothing. A report for a game that already has a result, such as one an admin entered, is kept but ignored. See [Game server API](#game-server-api).

A player can ask another player of the active event for a 1v1 match. It is called as soon as the other player accepts and both players are free, with no admin needed. If one of them is in another match, it is called when that match ends. The asker can withdraw it until it is accepted.

Every match change is in `src/lib/store/matches.ts`. Each change runs in one transaction and passes what happened to `handleMatchEvents` in `src/lib/store/match-events.ts` before it commits. A bet must lock the match first with `withMatchForBet` in the same transaction.

## Player pages

The public pages and the player pages are written in Norwegian, in the jokey Rogaland dialect of the LAN, and the site sets `lang="nn"`. The admin pages stay in English and set `lang="en"`.

The front page `/` is public. It shows the active event with its dates, the live and next matches with their odds, and links to `/bracket`, `/leaderboard` and `/big` without a key. A signed out visitor gets buttons to `/join` and `/login`, and a signed in player a link to `/me`. When no event is open, `/`, `/join` and `/login` say that an admin must open one first and link to `/admin`. Every public page has a small Admin link at the bottom.

`/me` and `/bracket` need a signed in player of the active event. A signed in account that has not joined the active event is sent to `/bli-med` first.

- `/me` shows the Foza balance, the matches still to play with their pools and bet forms, the player's bets and the 1v1 matches. The player's own matches are marked. When the player's match is called or started, the page shows how to join, as long as the event has a game server host and port. The main button copies the join link. A short guide says to paste it with "join link" in the main menu of the game and answer Yes. The page also shows the server and the join code for typing in by hand, and the link can be opened directly where the link type is registered.
- `/bracket` shows the bracket of each tournament of the event, with the state and series score of every match. `?t=<id>` picks a tournament. The newest is shown by default.

On `/me` a player asks another player of the event for a 1v1 match, with a best-of, the points that win a game and the game speed. They default to 1, 15 and 75 and follow the same limits as a tournament. The asked player accepts or declines on their own `/me`. Until then the asker can take the request back with Trekk tilbake. No bets exist on a 1v1 match before it is accepted, so a withdraw refunds nothing.

- `POST /api/player/challenges` asks for a 1v1 match from the form on `/me`.
- `POST /api/player/challenges/<id>` answers one, with `answer` set to `accept` or `decline` by the asked player, or `withdraw` by the asker.

Both send a signed out browser to `/login`.

## Training against a bot

On `/trening` a signed in player starts a training match against a bot that the game server runs itself. The player picks the bot, the difficulty, the rules and the points that win the game, and joins with the normal join link. The bots are the scripts of the game: `reduced`, `axji-0-2`, `com_11`, `gintonicV9`, `hyp014` and `Union`, with `reduced` by default. The difficulty is 0 to 25, where 0 is the strongest bot, and 15 by default. A training match is one game at normal speed. The rules are a fixed list of the rule files of the game for now.

A player has one live match at a time. A player in a called or started match cannot train, and a player has one open training match. When a match of a training player is called, the training ends. The player can stop the training on `/trening`. When the player leaves the game, the training ends without a result.

Training matches are in their own table, `training_matches`. They never count for Foza, bets, the leaderboards, Elo, tournaments or the bracket. Their ids come from the same sequence as the matches, so the game server never sees one id twice. The front page and `/me` show open training matches in the ring after the real matches, with the badge TRENING, the bot and the difficulty, and no pool or bet button. The 1v1 screen of the big screen shows them the same way after the real 1v1 matches. A finished training is never in its latest results.

Every finished training game is stored with the player, the bot, the difficulty, the rules, the points to win, the score, who won and when the game started and ended. `/me` and `/trening` show the training stats of the player: games, wins and losses per bot and difficulty, and the hardest bot beaten, which is the lowest difficulty the player has beaten. `/trening` also shows a public overview of the event: who trains the most, the most played bots and the wins against each bot per difficulty. The queries are in `src/lib/store/training.ts`.

- `POST /api/player/training` starts a training match from the form on `/trening`.
- `POST /api/player/training/<id>` stops the open training match of the player.

## Foza and betting

Foza has no real value. Every change to a balance is a row in the `foza_ledger` table: the starting Foza, the daily Foza, bets, payouts, refunds, reversals and admin adjustments. A trigger adds each row to the balance on the player, and a check at commit refuses a balance that does not equal the sum of its ledger. Ledger rows are never changed or removed.

Each player gets the daily Foza of the event once per calendar day in Europe/Oslo time while the event is active, from the day after sign-up. It is paid when the player next reads the balance or bets. It is paid only for days the player uses the site. Missed days are not paid later.

Signed in players bet on `/me`. Odds are parimutuel. All bets on a match form a pool, and when the match is decided, bettors on the winner share the whole pool in proportion to their stake. Payouts round down to whole Foza, and leftovers are discarded. If nobody bet on the winner, every stake comes back. A player has one bet per match, can raise it but not move it to the other side, and can bet on their own match. A no-show, a cancel and a reset refund the bets. A correction that changes the winner takes back the payouts and pays out again, even when that takes a balance below 0.

- `POST /api/player/bets` places or raises a bet from the form on `/me`.
- `GET /api/player/bets` lists the bets of the signed in player.
- `GET /api/player/balance` returns the balance of the signed in player, with the daily Foza paid.

The two GET routes answer 401 when nobody is signed in. A signed out bet post is sent to `/login`.
- `GET /api/matches/<id>/pool` is public and returns the pool of a match and the payout multiplier for each player.
- `GET /api/live?event=<id>` is public and returns `{ "stamp": "<active event id>:<live version>" }`. The front page, `/me`, `/bracket` and the leaderboards of the active event read it every 5 seconds while the tab shows, and load again without a page load when it changes. Every change to the matches, games, players, tournaments, Foza ledger or the row of the event moves the live version when it commits. The open tabs share one read for 2 seconds. It answers 400 for a bad id and 404 for an event that does not exist. Reads the shared cache cannot answer count against the limit of the client, 120 a minute, and answer 429 past it.

An admin can add or take Foza from a player with a reason on the event page.

## Leaderboards and stats

`/leaderboard` shows the leaderboards of the active event, for the whole event or one tournament. `?event=<id>` shows a past event, which keeps its own numbers. There are three boards:

- Foza ranks bettors by correct bets, then hit rate, then Foza won net. The balance does not count.
- Sigra ranks players by matches won, then win rate, then games won minus games lost.
- Elo ranks players by rating and shows the change during the event or the tournament.

Below the boards the page lists every number: bets, correct bets, hit rate, Foza won and lost, biggest win and best odds hit for bettors, and matches, games, win rate, points scored and conceded and the longest win streak for players. `/leaderboard/players/<id>` shows one player with tournament places and head to head records.

Only finished matches that were played out count for player stats and Elo. A no-show, a cancel or a reset match does not. Settled bets count for betting stats. A refunded bet does not. A returned stake, when nobody backed the winner, counts as a wrong bet. When a series score is set by hand, the points of the games it replaces no longer count.

Nothing here is stored. Every number is worked out from the stored results, bets and places when a page is read, so a correction shows up at once. The logic is in `src/lib/stats` and the queries in `src/lib/store/stats.ts`.

### Elo

Every player starts at 1000 (`ELO_START`), and K is 32 (`ELO_K`). A finished match changes Elo once for the winner of the series, so a best of 3 counts as one match and single games never count. The winner gains `32 * (1 - E)` and the loser loses the same, where `E = 1 / (1 + 10^((loser - winner) / 400))` is the chance the winner had. Equal ratings give 16. A favourite 200 above gets about 8 for a win, and an underdog 200 below gets about 24.

Only finished matches with the result `played` count, in tournaments and 1v1 alike. Matches won without being played, such as no-shows, cancelled matches and training never count. Ratings are worked out again from all results each time they are read. Ratings are played through in order: events by start date, then matches by when they started. A corrected match keeps its start time, so it keeps its place, and every later rating follows. Ratings carry over between events. Each event has its own player rows, so a player is known across events by the account. The leaderboard shows the rating, the rating before the event, the change and the number of rated matches. Admins can seed a tournament by Elo, highest first.

`/elo` explains the rating to players with the formula and a table of examples. The table is worked out from `expectedScore` and `winnerGain`, so it follows the code. The Elo board of the leaderboard links to it from its i button.

## Big screen

`/big` is a public, read-only page for the TV in the room. It fills the window at any size without scrolling and is drawn for 1920 by 1080. It shows:

- The match in the big box: the first live match with its score, sets, Elo and pool, or else the next match open for bets.
- Up to three other matches, live ones first, then the next ones open for bets with their odds.
- The bracket of the tournament on the floor. `?t=<id>` picks a tournament. A round shows at most 4 matches, the live and open ones first, and at most 4 rounds show. A double elimination bracket shows the side with the most urgent match.
- The leaderboards Flest rette (most correct bets), Flest sigra (most wins) and Elo, five players each. They take turns every 12 seconds and skip an empty board.
- A sign-up card with a QR code for `<NEXTAUTH_URL>/join` and the event code, only with the big screen key. Without it the card is left out and the leaderboards take its place. The QR code is drawn on the server with [lean-qr](https://github.com/davidje13/lean-qr).
- The sponsors of the footer, in a strip at the bottom that scrolls when they do not fit.

The page reads `GET /api/big` every 5 seconds and updates without a page load. It takes the same `?t=` and `?key=`. When another event goes active, the page loads again. With reduced motion set in the browser, nothing scrolls or fades. The page and the route hold nicknames and numbers only, and the event code only with the key.

Each event has its own big screen key. The database makes it when the event is made, 32 bytes from the strong random source of the server written as 43 URL-safe characters. The Big screen section of the event page under `/admin/events` shows the full address `<NEXTAUTH_URL>/big?key=<key>` with a button that copies it. Open the TV on that address. The link Big screen on `/admin` adds the key of the active event. The key is compared with the key of the active event in constant time, so only the active event shows its code.

New key, with the box checked to confirm, gives the event a new key at once. The old address then shows a plain info screen. Make a new key when the address has been shared with someone who should not have it.

The address holds the key, so do not share it beyond whoever sets up the TV. The key is stored in the database as it is, since admins need to see it, and shows only on the admin pages and in the address of the big screen. The page and the route send `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, so the key does not leave the browser in a referrer or stay in a cache. Without a key, or with another key, the screen is a plain info screen with no sign-up card and no code.

## Sponsors

An admin manages the sponsors of an event on its page under `/admin/events`. A sponsor has a name of at most 60 characters, an optional http or https link, a logo, a place in the order and an on or off switch. Up and Down move a sponsor one place. The footer of every page and the game server API list the sponsors of the active event that are on, in this order. An event has at most 32 sponsors, the most the game shows.

Each event also has a style for the sponsor board in the game, picked in a list above the sponsors. The styles are `off`, `led` (dark LED with a metal frame), `printed` (white printed panels), `wood` (a wooden beach bar), `slim` (slim glossy LED) and `padded` (a padded rounded board). A new event starts with `off`. While the board is off the game server gets no sponsors and the game shows no board. The footer and the logo routes are not affected.

A logo is a PNG, JPEG or WebP file of at most 1 MB and at most 2000 pixels wide and high. The site checks the first bytes of the file and decodes the whole image before it stores it. The type the browser sends is ignored. SVG is refused, since an SVG file can hold scripts. The site then writes the logo again in its own format and stores that in the database. This drops EXIF, GPS and other metadata, turns the image upright and converts its colours to sRGB.

For the game the site makes a 32-bit BMP with alpha, 32 pixels high and at most 160 wide, with the aspect ratio kept. It has a `BITMAPV4HEADER` with `BI_BITFIELDS` and the masks red `0x00FF0000`, green `0x0000FF00`, blue `0x000000FF` and alpha `0xFF000000`, and the rows are stored from the bottom up. Transparent parts stay transparent, so the board in the game shows through. A wider logo is centred on a transparent band 32 pixels high. An admin can give a sponsor its own game background for a logo that needs a backing. The logo is then put on that colour and every pixel is opaque. A changed colour makes the BMP again from the stored logo. The board style does not change the BMP.

Game logos stored before the alpha channel are 24-bit. The site makes each of them again from the stored logo the first time the game server asks for the sponsors after the update. This runs once per start of the site. A logo that fails 3 times is left as it is and logged. Sponsors that had the old white default lose it and keep their transparency. Another colour stays as their own game background.

`GET /api/sponsors/<id>/logo` is public and returns the logo of a sponsor that is on in the active event, with its own content type and `X-Content-Type-Options: nosniff`. The footer adds `?v=<hash>`, the SHA-256 of the logo, and that address may be cached for a year. Without it the browser checks the ETag each time.

Images are decoded with [sharp](https://sharp.pixelplumbing.com), which ships prebuilt libvips for Linux, macOS and Windows. Only its PNG, JPEG and WebP decoders are allowed to run. The BMP is written by `src/lib/sponsors/bmp.ts`.

## Game server API

The dedicated game server at the LAN calls these routes. It only calls out to the site. The site never calls it. If the site cannot be reached, the server keeps the last sync on disk and sends its reports later, so a report may arrive late or twice.

Every route under `/api/server` needs the header `Authorization: Bearer <token>`, where the token is the game server token made on `/admin/game-server`. The site compares its SHA-256 hash with the stored hash in constant time and never logs it. These routes do not use the admin login or the player session.

- No header, or another token: `401` with `{ "error": "unauthorized" }`.
- No token has been made yet: `503` with `{ "error": "not-configured" }` for every request.
- A body that is not valid: `400` with `{ "error": "invalid", "field": "<the first bad field>" }`. The field is `body` when the body is not a JSON object or is larger than 16 KB.

Bodies are JSON. Ids are whole numbers from 1 to 2147483647. Points are whole numbers from 0 to 1000. Times are ISO 8601 with a time zone, such as `2026-11-20T18:04:05Z`. How the server should treat an answer:

- `200`, `400` and `404` are final. Do not send the same request again. A `400` or `404` means the request itself is wrong and will never work.
- `401` and `503` mean the token is wrong or not made on the site yet. Sending again does not help. Fix the configuration first, and keep the queued reports until then.
- Any other `5xx` or a network error: try again later with the same body.

Reports for one match must be sent one at a time and in game order. Wait for the answer to game 1 before sending game 2. A report for a game past `nextGame` is refused with `game-ahead`, and that answer is final.

### Game server token

There is one token for the whole site, since the game server serves the active event. An admin makes it on `/admin/game-server`, linked from `/admin` as Game server. The token is 32 bytes from the cryptographic random source, written as 43 URL-safe characters. The site stores only its SHA-256 hash, so the token shows once, in the answer to the admin who makes it. It is never in an address or a log. Until a token is made the game server API answers 503.

Make a new token, with the box checked to confirm, replaces the token at once. The old token gets 401 from then on. The page shows when the token was made and when the game server last reported.

The page is one flow from top to bottom. The health line comes first. Under Start the game server, Make a token shows one command with this site, the token and the port filled in, with a copy button. It is the same line in PowerShell and bash. Run it on the PC at the LAN that hosts the game server, and the health line turns green within a few seconds. The command maps the game server port of the active event, or 1234 without one, to port 1234 in the container:

    docker run -d --name blobby-server --restart unless-stopped -p 1234:1234/udp -v blobby-data:/data -e BLOBBY_TOURNAMENT=1 -e BLOBBY_SITE_URL=<NEXTAUTH_URL> -e BLOBBY_SITE_TOKEN=<token> sondresjo/blobby-server:<BLOBBY_SERVER_TAG>

Three folded sections follow. First time on this PC covers Docker, the Windows firewall rule for the UDP port and a fixed IP address for the PC, which is the game server host of the event. Stop, logs and update lists `docker stop blobby-server`, `docker start blobby-server`, `docker logs -f blobby-server` and `docker pull` of the image. Other ways has the start scripts of the game repository. They ask for the site address, the token and the port once, keep them in a file only the user can read, and pass the token to Docker in a temporary env file. Their `update` gets the newest image without a new token, and `set-token` puts in a new token.

The game server reads these variables in tournament mode:

- `BLOBBY_TOURNAMENT`: `1` turns tournament mode on.
- `BLOBBY_SITE_URL`: the public address of the site, the origin of `NEXTAUTH_URL`.
- `BLOBBY_SITE_TOKEN`: the game server token, sent as `Authorization: Bearer <token>`.

### Join codes

The game sends a player's join code in its 16 byte player name field. A code is 10 ASCII characters, so it fits. The server looks the code up in the last sync, uses the nickname from the sync instead, and refuses a code it does not know.

### GET /api/server/sync

Everything the server needs: the active event, every player of it with the join code, and every match that is called or started. Matches are sorted by id. In `players` of a match, player 1 comes first.

    curl -H "Authorization: Bearer $BLOBBY_SITE_TOKEN" https://<site>/api/server/sync

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
      "nextGameDelay": 10,
      "awaitingDecision": false,
      "wins1": 0,
      "wins2": 0,
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
- `wins1` and `wins2` are the games player 1 and player 2 have won in the series so far. They are the stored series score, so they include results an admin entered or corrected and a score set by hand. An abandoned game does not count. After a restart the server continues the series from them. The site decides when a series is over, and a decided match leaves the list.
- `speed` is in frames per second. `scoreToWin` is the points that win one game.
- `nextGameDelay` is the pause in seconds before the next game of a series, which the game counts down. It comes from the tournament, from 3 to 120 and 10 by default. A 1v1 match always gets 10.
- `training` is only on a training match, as `{ "bot": "hyp014", "difficulty": 13 }`. Such a match has one player in `players`, and the game server plays the bot on the right. Its `bestOf` is 1. A server that does not know training skips it, since it has no two players.

### Training matches

The game server names its bot with player id 0. For a training match it reports `connected` with `{ "playerIds": [17, 0] }`, and the game with `"training": true` and the bot in `points` and as `winnerId` when it won. The answers are the same as for a match. A training game is never stored as a match result, and a training match has no live score.

### GET /api/server/sponsors

The sponsor board style of the active event and its sponsors that are on, in the order the admin set. Each logo is a 32-bit BMP with alpha, 32 pixels high and at most 160 wide, sent as base64.

    curl -H "Authorization: Bearer $BLOBBY_SITE_TOKEN" https://<site>/api/server/sponsors

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

- `status` is `finished` or `abandoned`. A finished game needs `winnerId`, and the winner must have more points and at least `scoreToWin` from the sync. An abandoned game, such as on a disconnect, has `winnerId` `null` or leaves it out.
- `leftPlayerId` is optional. On an abandoned game it names the player who left, so the admin can decide. It must be one of the two players of the match, or the report is refused with `players`. Leave it out or send `null` when no one left or the server does not know. A finished game that names a player who left gets `400` with the field `leftPlayerId`.
- `points` holds both players of the match, in any order.
- `endedAt` may not be before `startedAt`.

Answers:

- `200` `{ "status": "stored" }`: the game is stored. When it decides the series, the match finishes, bets settle and the bracket moves on. A report for a called match starts it first.
- `200` `{ "status": "duplicate" }`: a report with this id came before, whatever its answer was then. Nothing changed.
- `200` `{ "status": "game-closed" }`: the game already has a result, from an admin or an earlier report, or a reset cleared it. The report is kept but changes nothing.
- `200` `{ "status": "refused", "reason": "<reason>" }`: nothing changed. `not-found`: no such match. `players`: the players are not the two of the match. `state`: the match is not called or started. `game-ahead`: the game number is past `nextGame`. `score`: the points do not fit the result, such as a winner below the points to win of the match.

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

Pages under `/admin` and routes under `/api/admin` need a GitHub login. All other pages are public. There is one sign-in page, `/login`. Players sign in there with nickname and PIN, and admins with the button Admin? Logg inn med GitHub below the form. The button works also when no event is open, so an admin can sign in and open one. An admin page sends a signed out visitor to `/login?callbackUrl=<path>`. The player session and the admin session are separate cookies, so signing in or out as one does not touch the other. Set these in `.env.local`, see `.env.example`.

- `NEXTAUTH_URL`: the public address of the site. In production it must start with `https://`. Otherwise the admin pages and sign-in return 503.
- `NEXTAUTH_SECRET`: a long random string that signs the session.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth app. Set its callback URL to `<NEXTAUTH_URL>/api/auth/callback/github`.
- `ALLOWED_GITHUB_USER_IDS`: the numeric GitHub user IDs of the admins, separated by commas. An empty value lets nobody in. Find an ID at `https://api.github.com/users/<login>`.

- `BLOBBY_SERVER_TAG`: the tag of the `sondresjo/blobby-server` image in the commands on `/admin/game-server`, such as `dev` on a test site. It is `latest` when it is not set or not a valid Docker tag.

The token of the game server API is made on `/admin/game-server`, not set here. See Game server token above.

## Test

    npm run lint
    npm run typecheck
    npm test
    npm run test:db
    npm run build
    npx playwright install chromium
    npm run test:e2e

Set `BIG_SCREEN_SHOTS` to a folder and run `npm run test:e2e -- e2e/big-screen.spec.ts` to save screenshots of the big screen there. It adds sponsors, so run that spec on its own.

Set `SITE_SHOTS` to a folder and run `npm run test:e2e -- e2e/site-pages.spec.ts` to save screenshots of `/`, `/join`, `/login` and the admin pages at 1440 and 390 pixels wide.

`npm run test:db` and `npm run test:e2e` need Docker. Each starts a throwaway Postgres container and removes it afterwards. The end-to-end test needs `npm run build` first. It runs the migrations, adds a test event, copies the static files and starts the standalone server on port 3100.

## Build

    npm run build
    npm start

Docker:

    docker build -t blobby-volley-tournament .
