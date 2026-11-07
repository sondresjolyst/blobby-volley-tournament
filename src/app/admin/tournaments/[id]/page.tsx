import { AdminShell } from '@/components/admin/AdminShell';
import { notFound } from 'next/navigation';
import { BracketView } from '@/components/tournaments/BracketView';
import { requireAdmin } from '@/lib/auth/options';
import { FORMATS } from '@/lib/bracket';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { MAX_NEXT_GAME_DELAY, MIN_NEXT_GAME_DELAY } from '@/lib/matches/settings';
import { getPlacings } from '@/lib/store/matches';
import { getTournament } from '@/lib/store/tournaments';
import { SEEDING_LABELS } from '@/lib/tournaments/input';
import { describeBracket } from '@/lib/tournaments/view';

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string | string[]; error?: string | string[] }> }) {
    await requireAdmin();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const tournament = await getTournament(pool, id);
    if (!tournament) notFound();
    const placings = await getPlacings(pool, id);
    const { saved, error } = await searchParams;
    const nickname = new Map(tournament.players.map((p) => [p.playerId, p.nickname]));
    return (
        <AdminShell section="tournaments">
            <h1>{tournament.name}</h1>
            {saved === '1' && <p role="status">Saved.</p>}
            {error === 'next-game-delay' && (
                <p role="alert">
                    The pause between games must be a whole number of seconds from {MIN_NEXT_GAME_DELAY} to {MAX_NEXT_GAME_DELAY}.
                </p>
            )}
            <p>Format: {FORMATS[tournament.format].name}</p>
            {tournament.format === 'single_elimination' && <p>Third place match: {tournament.thirdPlaceMatch ? 'Yes' : 'No, both semifinal losers share 3rd'}</p>}
            <p>
                Seeding: {SEEDING_LABELS[tournament.seeding]}
                {tournament.randomSeed !== null && `, random seed ${tournament.randomSeed}`}
            </p>
            <form method="post" action={`/api/admin/tournaments/${tournament.id}/next-game-delay`}>
                <label>
                    Pause between games in seconds{' '}
                    <input name="nextGameDelay" type="number" min={MIN_NEXT_GAME_DELAY} max={MAX_NEXT_GAME_DELAY} step={1} required defaultValue={tournament.nextGameDelay} />
                </label>{' '}
                <button type="submit">Save pause</button>
            </form>
            <p>The game counts down this pause before the next game of a series. The game server gets a change in its next sync.</p>
            <h2>Seeds</h2>
            <ol>
                {tournament.players.map((p) => (
                    <li key={p.playerId}>{p.nickname}</li>
                ))}
            </ol>
            <h2>Placings</h2>
            {placings.length === 0 ? (
                <p>No places decided yet.</p>
            ) : (
                <ul aria-label="Placings">
                    {placings.map((p) => (
                        <li key={p.playerId}>
                            {p.place}. {nickname.get(p.playerId) ?? `Player ${p.playerId}`}
                        </li>
                    ))}
                </ul>
            )}
            <h2>Bracket</h2>
            <BracketView rounds={describeBracket(tournament.format, tournament.matches, (playerId) => nickname.get(playerId) ?? `Player ${playerId}`)} />
        </AdminShell>
    );
}
