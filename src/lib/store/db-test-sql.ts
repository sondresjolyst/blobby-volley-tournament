// For the DB tests only. A player row needs an account, so a test that adds players by hand starts
// its insert with this. It finds or makes the account for the nickname and key in the given
// parameters and names it `account`.
export const withAccount = (nickname = '$2', key = '$3') =>
    `WITH account AS (
         INSERT INTO accounts (nickname, nickname_key, pin_hash, pin_salt) VALUES (${nickname}, ${key}, '\\x00', '\\x00')
         ON CONFLICT (nickname_key) DO UPDATE SET nickname_key = EXCLUDED.nickname_key RETURNING id
     )`;
