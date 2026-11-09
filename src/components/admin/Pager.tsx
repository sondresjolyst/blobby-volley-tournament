import Link from 'next/link';
import { pageLinks, type Page } from '@/lib/paging';

/** The paging of each list on a page, by its key in the address, and the search. */
export interface ListState {
    pages: Record<string, number>;
    q: string;
}

/** The query of the list state. Page 1 and an empty search are left out. */
export function listQuery(state: ListState): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, page] of Object.entries(state.pages)) if (page > 1) params.set(key, String(page));
    if (state.q !== '') params.set('q', state.q);
    return params;
}

/** The address of the page with one list moved to another page, such as `/admin/events/1?players=2#players`. */
export function listHref(path: string, state: ListState, key: string, page: number, hash: string): string {
    const search = listQuery({ ...state, pages: { ...state.pages, [key]: page } }).toString();
    return `${path}${search === '' ? '' : `?${search}`}#${hash}`;
}

/**
 * The count and the page links of a long list: Previous, the page numbers and Next. Shows only
 * the count while the list fits on one page.
 */
export function Pager({ label, noun, list, href }: { label: string; noun: readonly [one: string, many: string]; list: Page<unknown>; href: (page: number) => string }) {
    const name = list.total === 1 ? noun[0] : noun[1];
    const count = list.total === 0 ? `No ${noun[1]}` : list.pages === 1 ? `${list.total} ${name}` : `${list.first} to ${list.last} of ${list.total} ${name}`;
    return (
        <nav className="admin-pager" aria-label={label}>
            <p className="admin-pager-count">{count}</p>
            {list.pages > 1 && (
                <ul>
                    <li>{list.page > 1 ? <Link href={href(list.page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}</li>
                    {pageLinks(list.page, list.pages).map((n, i) =>
                        n === 'gap' ? (
                            <li key={`gap-${i}`} aria-hidden="true">
                                …
                            </li>
                        ) : (
                            <li key={n}>
                                <Link href={href(n)} aria-label={`Page ${n}`} aria-current={n === list.page ? 'page' : undefined}>
                                    {n}
                                </Link>
                            </li>
                        ),
                    )}
                    <li>{list.page < list.pages ? <Link href={href(list.page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}</li>
                </ul>
            )}
        </nav>
    );
}

/** Hidden fields that send the paging and search of the lists with a form, so the route can come back to the same page. */
export function ListFields({ state }: { state: ListState }) {
    return (
        <>
            {[...listQuery(state)].map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
            ))}
        </>
    );
}
