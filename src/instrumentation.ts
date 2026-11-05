import { proxyHeaderWarning } from '@/lib/client-ip';

/** Runs once when the server starts. */
export function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const warning = proxyHeaderWarning(process.env);
    if (warning) console.warn(warning);
}
