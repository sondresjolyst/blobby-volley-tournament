/** What the page does after a form post that was sent in the background. */
export type AfterPost =
    /** The post ended on this page. Load its data again and keep the scroll. */
    | { kind: 'refresh' }
    /** The post ended on this page with other notices in the address. Go there and keep the scroll. */
    | { kind: 'replace'; href: string }
    /** The post ended on another page. Open it as a normal page load. */
    | { kind: 'load'; href: string }
    /** The route redirected anyway, or the sign-in ran out. Load this page again. */
    | { kind: 'reload' }
    /** The answer is an error or not an address. Show that it went wrong, and never send the form again. */
    | { kind: 'error' };

export const isApiPath = (path: string) => path === '/api' || path.startsWith('/api/');

/**
 * True when a post form can be sent in the background. It must post to an API route of this site
 * and open its answer in the same tab.
 */
export function canPostInBackground(form: { method: string; target: string; action: string }, origin: string): boolean {
    if (form.method.toLowerCase() !== 'post') return false;
    if (form.target !== '' && form.target !== '_self') return false;
    let action: URL;
    try {
        action = new URL(form.action, origin);
    } catch {
        return false;
    }
    // A sign-in route of NextAuth redirects to GitHub and sets its own cookies, so the browser follows it.
    return action.origin === origin && isApiPath(action.pathname) && !action.pathname.startsWith('/api/auth/');
}

/**
 * Picks what to do with the address that the API route answered a background post with. A post
 * that may have reached the route is never sent again. When the sign-in has run out, the page is
 * loaded again, so it shows the sign-in.
 */
export function afterPost(current: URL, answer: { redirected: boolean; status: number; location: unknown }): AfterPost {
    if (answer.redirected || answer.status === 401 || answer.status === 403) return { kind: 'reload' };
    const { location } = answer;
    if (typeof location !== 'string' || !location.startsWith('/') || location.startsWith('//')) return { kind: 'error' };
    const next = new URL(location, current);
    if (next.pathname !== current.pathname) return { kind: 'load', href: next.href };
    if (next.search === current.search) return { kind: 'refresh' };
    return { kind: 'replace', href: `${next.pathname}${next.search}${next.hash}` };
}
