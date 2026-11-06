import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BracketView } from '@/components/tournaments/BracketView';
import { requireAdmin } from '@/lib/auth/options';
import { FORMATS } from '@/lib/bracket';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getPlacings } from '@/lib/store/matches';
import { getTournament } from '@/lib/store/tournaments';
import { SEEDING_LABELS } from '@/lib/tournaments/input';
import { describeBracket } from '@/lib/tournaments/view';

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string | string[] }> }) {
    await requireAdmin();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const tournament = await getTournament(pool, id);
    if (!tournament) notFound();
    const placings = await getPlacings(pool, id);
    const { saved } = await searchParams;
    const nickname = new Map(tournament.players.map((p) => [p.playerId, p.nickname]));
    return (
        <main>
            <h1>{tournament.name}</h1>
            <p>
                <Link href="/admin/tournaments">Tournaments</Link>
            </p>
            {saved === '1' && <p role="status">Saved.</p>}
            <p>Format: {FORMATS[tournament.format].name}</p>
            {tournament.format === 'single_elimination' && <p>Third place match: {tournament.thirdPlaceMatch ? 'Yes' : 'No, both semifinal losers share 3rd'}</p>}
            <p>
                Seeding: {SEEDING_LABELS[tournament.seeding]}
                {tournament.randomSeed !== null && `, random seed ${tournament.randomSeed}`}
            </p>
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
        </main>
    );
}
