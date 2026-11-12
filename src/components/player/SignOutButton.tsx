import styles from './player.module.css';

/** The sign-out button of the player headers. It posts, so a link or a prefetch never signs out. */
export function SignOutButton() {
    return (
        <form method="post" action="/api/player/signout">
            <button type="submit" className={styles.signOut} data-busy-label="Loggar ut…">
                Logg ut
            </button>
        </form>
    );
}
