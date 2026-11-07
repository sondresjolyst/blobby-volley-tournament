import { describe, expect, it } from 'vitest';
import { firewallCommand, serverRunCommand, SERVER_HELP, shellArg, siteUrl, START_SCRIPTS } from './commands';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token_AZaz09';

describe('serverRunCommand', () => {
    it('is one line with the site, the token and the port of the event', () => {
        for (const shell of ['powershell', 'bash'] as const) {
            expect(serverRunCommand({ siteUrl: 'https://bvt.example.test', token: TOKEN, port: 1234 }, shell)).toBe(
                `docker run -d --name blobby-server --restart unless-stopped -p 1234:1234/udp -v blobby-data:/data -e BLOBBY_TOURNAMENT=1 -e BLOBBY_SITE_URL=https://bvt.example.test -e BLOBBY_SITE_TOKEN=${TOKEN} sondresjo/blobby-server:latest`,
            );
        }
        expect(serverRunCommand({ siteUrl: 'https://bvt.example.test', token: TOKEN, port: 4321 }, 'bash')).toContain(' -p 4321:1234/udp ');
    });

    it('quotes a value the shell would read as something else', () => {
        expect(shellArg("a b'c", 'bash')).toBe(`'a b'\''c'`);
        expect(shellArg("a b'c", 'powershell')).toBe(`'a b''c'`);
        expect(shellArg('$x', 'powershell')).toBe(`'$x'`);
        expect(serverRunCommand({ siteUrl: 'https://x.test', token: 'a$b', port: 1 }, 'bash')).toContain(`-e 'BLOBBY_SITE_TOKEN=a$b'`);
    });
});

describe('siteUrl', () => {
    it('is the origin of NEXTAUTH_URL', () => {
        expect(siteUrl({ NEXTAUTH_URL: 'https://bvt.example.test/' })).toBe('https://bvt.example.test');
        expect(siteUrl({ NEXTAUTH_URL: 'not a url' })).toBeNull();
        expect(siteUrl({})).toBeNull();
    });
});

describe('SERVER_HELP', () => {
    it('holds no token', () => {
        expect(SERVER_HELP.map((h) => h.command).join(' ')).not.toMatch(/TOKEN/);
    });
});

describe('firewallCommand', () => {
    it('opens the UDP port of the event', () => {
        expect(firewallCommand(4321)).toBe('New-NetFirewallRule -DisplayName "Blobby tournament server" -Direction Inbound -Protocol UDP -LocalPort 4321 -Action Allow');
    });
});

describe('START_SCRIPTS', () => {
    it('link the scripts in the game repository and start them', () => {
        expect(START_SCRIPTS.map((s) => s.href)).toEqual([
            'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts/tournament-server.ps1',
            'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts/tournament-server.sh',
        ]);
        expect(START_SCRIPTS.map((s) => s.download)).toEqual([
            'iwr https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts/tournament-server.ps1 -OutFile tournament-server.ps1',
            'curl -fsSLO https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts/tournament-server.sh',
        ]);
        expect(START_SCRIPTS.map((s) => s.command)).toEqual(['powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1 start', 'bash tournament-server.sh start']);
    });
});
