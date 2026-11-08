const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Oslo',
    timeZoneName: 'short',
});

/** A moment on the admin pages, in Europe/Oslo time, such as `20 Nov 2026, 19:04:05 CET`. */
export const adminTime = (value: Date) => DATE_TIME.format(value);
