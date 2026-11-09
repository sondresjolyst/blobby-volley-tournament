import { describe, expect, it } from 'vitest';
import { afterPost, canPostInBackground } from './stay';

const origin = 'https://lan.example';
const at = (path: string) => new URL(path, origin);
const answer = (location: unknown) => ({ redirected: false, location });

describe('canPostInBackground', () => {
    it('takes a post form to an API route of the site', () => {
        expect(canPostInBackground({ method: 'post', target: '', action: `${origin}/api/player/bets` }, origin)).toBe(true);
        expect(canPostInBackground({ method: 'post', target: '_self', action: '/api/admin/events/1' }, origin)).toBe(true);
    });

    it('leaves get forms, other tabs, pages and other sites to the browser', () => {
        expect(canPostInBackground({ method: 'get', target: '', action: '/admin/tournaments/new' }, origin)).toBe(false);
        expect(canPostInBackground({ method: 'post', target: '_blank', action: '/api/player/bets' }, origin)).toBe(false);
        expect(canPostInBackground({ method: 'post', target: '', action: '/me' }, origin)).toBe(false);
        expect(canPostInBackground({ method: 'post', target: '', action: '/apiary' }, origin)).toBe(false);
        expect(canPostInBackground({ method: 'post', target: '', action: 'https://other.example/api/player/bets' }, origin)).toBe(false);
    });
});

describe('afterPost', () => {
    it('loads the data again when the post ends on the same address', () => {
        expect(afterPost(at('/me?bet=placed'), answer('/me?bet=placed'))).toEqual({ kind: 'refresh' });
        expect(afterPost(at('/admin/events/1'), answer('/admin/events/1#sponsors'))).toEqual({ kind: 'refresh' });
    });

    it('moves to the new notices of the same page, with the anchor', () => {
        expect(afterPost(at('/me'), answer('/me?bet=placed'))).toEqual({ kind: 'replace', href: '/me?bet=placed' });
        expect(afterPost(at('/admin/events/1?saved=1'), answer('/admin/events/1?sponsorDeleted=1#sponsors'))).toEqual({
            kind: 'replace',
            href: '/admin/events/1?sponsorDeleted=1#sponsors',
        });
    });

    it('opens another page as a normal load', () => {
        expect(afterPost(at('/me'), answer('/login'))).toEqual({ kind: 'load', href: `${origin}/login` });
        expect(afterPost(at('/admin/events/new'), answer('/admin/events/4?saved=1'))).toEqual({ kind: 'load', href: `${origin}/admin/events/4?saved=1` });
    });

    it('loads the page again when the route redirected anyway, so the post is never sent twice', () => {
        expect(afterPost(at('/me'), { redirected: true, location: undefined })).toEqual({ kind: 'reload' });
    });

    it('sends the form the normal way when the answer holds no address of the site', () => {
        expect(afterPost(at('/me'), answer(undefined))).toEqual({ kind: 'native' });
        expect(afterPost(at('/me'), answer('https://other.example/me'))).toEqual({ kind: 'native' });
        expect(afterPost(at('/me'), answer('//other.example/me'))).toEqual({ kind: 'native' });
    });
});
