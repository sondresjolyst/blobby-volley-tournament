import { matchPlayers, matchTitle } from '@/components/matches/describe';
import { betErrorMessage } from '@/lib/betting/input';
import { getPool } from '@/lib/db';
import { requireActivePlayer } from '@/lib/players/current';
import { listMatchPools, listPlayerBets } from '@/lib/store/bets';
import { getBalance } from '@/lib/store/foza';
import { listMatches } from '@/lib/store/matches';

type Search = { error?: string | string[]; bet?: string | string[] };

const STATUS_LABELS = { open: 'Open', won: 'Won', lost: 'Lost', returned: 'Stake back, nobody backed the winner', refunded: 'Refunded' } as const;

const multiplier = (value: number | null) => (value === null ? 'no bets yet' : `pays ${value.toFixed(2)}x`);

export default async function Me({ searchParams }: { searchParams: Promise<Search> }) {
    const player = await requireActivePlayer();
    const pool = getPool();
    const balance = (await getBalance(pool, player.id, new Date())) ?? player.fozaBalance;
    const [matches, pools, bets] = await Promise.all([listMatches(pool, player.eventId), listMatchPools(pool, player.eventId), listPlayerBets(pool, player.id)]);
    const poolOf = new Map(pools.map((p) => [p.matchId, p]));
    const open = matches.filter((m) => poolOf.get(m.id)?.open);
    const liveBet = new Map(bets.filter((b) => b.status !== 'refunded').map((b) => [b.matchId, b]));
    const search = await searchParams;
    const error = betErrorMessage(search.error);
    return (
        <main>
            <h1>{player.nickname}</h1>
            <p>Event: {player.eventName}</p>
            <p>Foza: {balance}</p>
            {error && <p role="alert">{error}</p>}
            {search.bet === 'placed' && <p role="status">Your bet is placed.</p>}
            {search.bet === 'raised' && <p role="status">Your bet is raised.</p>}

            <h2>Open for bets</h2>
            {open.length === 0 ? (
                <p>No matches are open for bets.</p>
            ) : (
                <ul aria-label="Open for bets">
                    {open.map((m) => {
                        const odds = poolOf.get(m.id)!;
                        const mine = liveBet.get(m.id);
                        return (
                            <li key={m.id}>
                                <form method="post" action="/api/player/bets">
                                    <fieldset>
                                        <legend>
                                            Match {m.id}: {matchTitle(m)}, {matchPlayers(m)}
                                        </legend>
                                        <p>Pool: {odds.total} Foza</p>
                                        {mine && (
                                            <p>
                                                Your bet: {mine.amount} Foza on {mine.onNickname}
                                            </p>
                                        )}
                                        <input type="hidden" name="matchId" value={m.id} />
                                        {odds.sides.map((side) => {
                                            const nickname = m.players.find((p) => p?.id === side.playerId)?.nickname ?? `Player ${side.playerId}`;
                                            return (
                                                <label key={side.playerId}>
                                                    <input type="radio" name="on" value={side.playerId} required defaultChecked={mine?.onPlayerId === side.playerId} disabled={mine !== undefined && mine.onPlayerId !== side.playerId} />{' '}
                                                    {nickname} ({side.stake} Foza, {multiplier(side.multiplier)}){' '}
                                                </label>
                                            );
                                        })}
                                        <label>
                                            Foza to bet on match {m.id} <input name="amount" type="number" min={1} max={Math.max(1, balance)} step={1} required />
                                        </label>{' '}
                                        <button type="submit">{mine ? 'Raise bet' : 'Place bet'}</button>
                                    </fieldset>
                                </form>
                            </li>
                        );
                    })}
                </ul>
            )}

            <h2>My bets</h2>
            {bets.length === 0 ? (
                <p>No bets yet.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Match</th>
                            <th>On</th>
                            <th>Stake</th>
                            <th>Result</th>
                            <th>Won or lost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bets.map((b) => (
                            <tr key={b.id}>
                                <td>{b.matchId}</td>
                                <td>{b.onNickname}</td>
                                <td>{b.amount}</td>
                                <td>{STATUS_LABELS[b.status]}</td>
                                <td>{b.net === null ? '' : b.net}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <form method="post" action="/api/player/signout">
                <button type="submit">Sign out</button>
            </form>
        </main>
    );
}
