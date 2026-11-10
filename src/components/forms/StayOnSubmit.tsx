'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { BACKGROUND_POST_HEADER } from '@/lib/background-post';
import { afterPost, canPostInBackground, type AfterPost } from './stay';
import styles from './stay.module.css';

/** How long a floating notice shows. An error stays until it is closed. */
const NOTICE_MS = 6000;

const NOTICES = '[role="status"], [role="alert"]';

/** The admin pages are in English and the player pages in Nynorsk. */
const failedText = (path: string) =>
    path.startsWith('/admin') ? 'Something went wrong. Load the page again to see what was saved.' : 'Någe gjekk gale. Last sidå på nytt for å sjå ka som blei lagra.';

/** The body of a post, the same as the browser would send for the form. */
function bodyOf(form: HTMLFormElement, submitter: HTMLElement | null): FormData | URLSearchParams {
    const data = new FormData(form, submitter);
    if (form.enctype === 'multipart/form-data') return data;
    const body = new URLSearchParams();
    for (const [key, value] of data) body.append(key, typeof value === 'string' ? value : value.name);
    return body;
}

/** True when a submit button sends the form somewhere else or in another way than the form says. */
const submitterOverrides = (submitter: HTMLElement | null) =>
    submitter !== null && ['formaction', 'formmethod', 'formtarget', 'formenctype'].some((name) => submitter.hasAttribute(name));

/**
 * Sends the post forms of the site in the background, so the page keeps its scroll instead of
 * opening at the top. The API route answers with the address it would redirect to, and the page
 * then loads the data of that address. The page is drawn anew, as after a page load, so fields and
 * open parts show what the site has now. A notice that the result put outside the screen floats at
 * the bottom for a while. Without JavaScript the forms post and load the page as before.
 */
export function StayOnSubmit({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [round, setRound] = useState(0);
    const [failed, setFailed] = useState<string | null>(null);
    const waiting = useRef<Anchor | null>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        const follow = (form: HTMLFormElement, submitter: HTMLElement | null, plan: AfterPost) => {
            switch (plan.kind) {
                case 'error':
                    // The post may have reached the route, so it is not sent again by itself.
                    form.removeAttribute('aria-busy');
                    setFailed(failedText(window.location.pathname));
                    return;
                case 'load':
                    window.location.assign(plan.href);
                    return;
                case 'reload':
                    window.location.reload();
                    return;
                default:
                    waiting.current = anchorOf(form, submitter);
                    startTransition(() => {
                        setRound((n) => n + 1);
                        if (plan.kind === 'refresh') router.refresh();
                        else router.replace(plan.href, { scroll: false });
                    });
            }
        };

        const onSubmit = async (event: SubmitEvent) => {
            const form = event.target;
            if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
            const submitter = event.submitter;
            if (submitterOverrides(submitter) || !canPostInBackground(form, window.location.origin)) return;
            event.preventDefault();
            // The form is busy until the page has the result, so a second press sends nothing.
            if (form.getAttribute('aria-busy') === 'true') return;
            form.setAttribute('aria-busy', 'true');
            setFailed(null);
            let plan: AfterPost;
            try {
                const res = await fetch(form.action, {
                    method: 'POST',
                    body: bodyOf(form, submitter),
                    headers: { [BACKGROUND_POST_HEADER]: '1' },
                    credentials: 'same-origin',
                    cache: 'no-store',
                    redirect: 'manual',
                });
                const body: unknown = res.ok ? await res.json().catch(() => null) : null;
                const location = body !== null && typeof body === 'object' && 'location' in body ? body.location : undefined;
                plan = afterPost(new URL(window.location.href), { redirected: res.type === 'opaqueredirect', status: res.status, location });
            } catch {
                plan = { kind: 'error' };
            }
            follow(form, submitter, plan);
        };

        // A page that the back button brings back from the cache keeps its busy forms, so they are freed.
        const onShow = (event: PageTransitionEvent) => {
            if (event.persisted) document.querySelectorAll('form[aria-busy]').forEach((form) => form.removeAttribute('aria-busy'));
        };

        window.addEventListener('submit', onSubmit);
        window.addEventListener('pageshow', onShow);
        return () => {
            window.removeEventListener('submit', onSubmit);
            window.removeEventListener('pageshow', onShow);
        };
    }, [router]);

    // The new page is in place but not painted yet, so a notice can float before it is seen.
    useLayoutEffect(() => {
        const anchor = waiting.current;
        if (isPending || !anchor) return;
        waiting.current = null;
        keepInPlace(anchor);
        timers.current.forEach(clearTimeout);
        timers.current = floatNotices();
        // A notice that floats leaves the page, so the content under it moves up.
        const form = keepInPlace(anchor);
        // The page is drawn anew, so the focus goes back to the button that sent the form.
        const control = form?.elements[anchor.control];
        if (control instanceof HTMLElement && (document.activeElement === null || document.activeElement === document.body)) {
            control.focus({ preventScroll: true });
        }
    }, [isPending, round]);

    useEffect(() => {
        const close = (el: Element) => {
            el.classList.remove(styles.floating);
            el.classList.add(styles.closed);
        };
        const onClick = (event: MouseEvent) => {
            const notice = event.target instanceof Element ? event.target.closest(`.${styles.floating}`) : null;
            if (notice) close(notice);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') document.querySelectorAll(`.${styles.floating}`).forEach(close);
        };
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        const pending = timers;
        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey);
            pending.current.forEach(clearTimeout);
        };
    }, []);

    // A new key draws the page anew after each post, as a page load would.
    return (
        <>
            <Fragment key={round}>{children}</Fragment>
            {failed && (
                <p role="alert" className={styles.floating} style={{ bottom: 16 }}>
                    {failed}
                </p>
            )}
        </>
    );
}

/**
 * The part of the page where a form was sent from, and where it was on the screen. The page is
 * drawn anew, so the browser cannot keep that part in place by itself. It is found again as the
 * only form with the same address, or else as the nearest part with an id, or else by the number
 * of the form among those with the same address.
 */
interface Anchor {
    action: string;
    index: number;
    /** How many forms had the same address. */
    count: number;
    top: number;
    id: string | null;
    idTop: number;
    /** The number of the button that sent the form among the fields of the form, or -1. */
    control: number;
}

const formsWith = (action: string) => [...document.forms].filter((form) => form.getAttribute('action') === action);

function anchorOf(form: HTMLFormElement, submitter: HTMLElement | null): Anchor {
    const action = form.getAttribute('action') ?? '';
    const same = formsWith(action);
    const holder = form.parentElement?.closest<HTMLElement>('[id]') ?? null;
    return {
        action,
        index: same.indexOf(form),
        count: same.length,
        top: form.getBoundingClientRect().top,
        id: holder?.id ?? null,
        idTop: holder?.getBoundingClientRect().top ?? 0,
        control: [...form.elements].indexOf(submitter as Element),
    };
}

/**
 * Scrolls so the part where the form was sent from is where it was on the screen. Returns the form
 * when it is found again by its address.
 */
function keepInPlace(anchor: Anchor): HTMLFormElement | null {
    const same = formsWith(anchor.action);
    const holder = anchor.id === null ? null : document.getElementById(anchor.id);
    if (anchor.count === 1 && same.length === 1) {
        window.scrollBy(0, same[0].getBoundingClientRect().top - anchor.top);
        return same[0];
    }
    if (holder) window.scrollBy(0, holder.getBoundingClientRect().top - anchor.idTop);
    else if (same[anchor.index]) window.scrollBy(0, same[anchor.index].getBoundingClientRect().top - anchor.top);
    // When a form came or went, the number may point at another form.
    return same.length === anchor.count ? (same[anchor.index] ?? null) : null;
}

/**
 * Floats each notice that is not all on the screen at the bottom of the screen. A closed notice
 * is hidden, so the page does not move when it goes. Returns the timers that close the notices.
 */
function floatNotices(): ReturnType<typeof setTimeout>[] {
    const outside = [...document.querySelectorAll<HTMLElement>(NOTICES)].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.height > 0 && (box.top < 0 || box.bottom > window.innerHeight);
    });
    let bottom = 16;
    for (const el of outside.reverse()) {
        el.classList.add(styles.floating);
        el.style.bottom = `${bottom}px`;
        bottom += el.offsetHeight + 8;
    }
    return outside
        .filter((el) => el.getAttribute('role') === 'status')
        .map((el) =>
            setTimeout(() => {
                if (!el.classList.contains(styles.floating)) return;
                el.classList.remove(styles.floating);
                el.classList.add(styles.closed);
            }, NOTICE_MS),
        );
}
