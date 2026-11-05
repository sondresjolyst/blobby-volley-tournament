import Link from 'next/link';
export default function Home() {
    return (
        <main>
            <h1>Blobby Volley Tournament</h1>
            <ul>
                <li>
                    <Link href="/join">Sign up</Link>
                </li>
                <li>
                    <Link href="/login">Sign in</Link>
                </li>
                <li>
                    <Link href="/me">My page</Link>
                </li>
            </ul>
        </main>
    );
}
