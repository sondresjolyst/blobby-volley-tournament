/** The rows on one page of a long admin list, such as the players of an event. */
export const PAGE_SIZE = 10;

/** The longest search text that is used. A longer one is cut. */
export const MAX_SEARCH = 60;

/** The highest page number that is read from an address. */
const MAX_PAGE = 100_000;

/** A page number from the address or a form. Anything but a whole number from 1 is page 1. */
export function parsePage(value: unknown): number {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,5}$/.test(value)) return 1;
    return Math.min(Number(value), MAX_PAGE);
}

/** A search text from the address or a form, trimmed and cut to MAX_SEARCH. Anything else is empty. */
export function parseSearch(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, MAX_SEARCH).trim();
}

/** True when the text contains the search, in any case. An empty search matches all. */
export function matchesSearch(search: string, ...texts: string[]): boolean {
    if (search === '') return true;
    const needle = search.toLocaleLowerCase('en');
    return texts.some((text) => text.toLocaleLowerCase('en').includes(needle));
}

export interface Page<T> {
    items: T[];
    /** The page shown. A page after the last shows the last page. */
    page: number;
    /** The number of pages. Always at least 1. */
    pages: number;
    total: number;
    /** The number of the first and the last row shown, from 1. Both 0 when there are no rows. */
    first: number;
    last: number;
}

/** One page of the items. */
export function pageOf<T>(items: readonly T[], requested: number, size = PAGE_SIZE): Page<T> {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, requested), pages);
    const start = (page - 1) * size;
    const shown = items.slice(start, start + size);
    return { items: shown, page, pages, total, first: shown.length === 0 ? 0 : start + 1, last: start + shown.length };
}

/**
 * The page numbers to link to: the first, the last, and the pages next to the current one. A gap
 * stands for the pages left out between them.
 */
export function pageLinks(page: number, pages: number): (number | 'gap')[] {
    const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    // A gap of one page shows that page instead.
    if (wanted.has(3) && pages >= 3) wanted.add(2);
    if (wanted.has(pages - 2) && pages >= 3) wanted.add(pages - 1);
    const sorted = [...wanted].sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    for (const n of sorted) {
        const previous = out.at(-1);
        if (typeof previous === 'number' && n > previous + 1) out.push('gap');
        out.push(n);
    }
    return out;
}

/**
 * The paging and search of a list, kept from a form post so the route can send the admin back to
 * the same page. Only the given page keys and `q` are kept, and only valid values. Page 1 and an
 * empty search are left out.
 */
export function keptListQuery(form: Record<string, string | undefined>, pageKeys: readonly string[]): URLSearchParams {
    const params = new URLSearchParams();
    for (const key of pageKeys) {
        const page = parsePage(form[key]);
        if (page > 1) params.set(key, String(page));
    }
    const search = parseSearch(form.q);
    if (search !== '') params.set('q', search);
    return params;
}

/** The address of a page with the list query and then the notice, such as `/admin/events/1?players=2&reset=5`. */
export function withListQuery(path: string, kept: URLSearchParams, notice: string): string {
    const query = [kept.toString(), notice].filter((part) => part !== '').join('&');
    return query === '' ? path : `${path}?${query}`;
}
