import { requireActivePlayer } from '@/lib/players/current';

export default async function Me() {
    const player = await requireActivePlayer();
    return (
        <main>
            <h1>{player.nickname}</h1>
            <p>Event: {player.eventName}</p>
            <p>Foza: {player.fozaBalance}</p>
            <form method="post" action="/api/player/signout">
                <button type="submit">Sign out</button>
            </form>
        </main>
    );
}
