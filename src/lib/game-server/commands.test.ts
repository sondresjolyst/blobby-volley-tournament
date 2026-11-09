import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_IMAGE, firewallCommand, serverHelp, serverImage, serverRunCommand, SERVER_REMOVE, shellArg, siteUrl, startScripts } from './commands';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token_AZaz09';
const LATEST = 'sondresjo/blobby-server:latest';
const DEV = 'sondresjo/blobby-server:dev';

describe('serverRunCommand', () => {
    it('is one line with the site, the token and the port of the event', () => {
        for (const shell of ['powershell', 'bash'] as const) {
            expect(serverRunCommand({ siteUrl: 'https://bvt.example.test', token: TOKEN, port: 1234, image: LATEST }, shell)).toBe(
                `docker run -d --name blobby-server --restart unless-stopped -p 1234:1234/udp -v blobby-data:/data -e BLOBBY_TOURNAMENT=1 -e BLOBBY_SITE_URL=https://bvt.example.test -e BLOBBY_SITE_TOKEN=${TOKEN} sondresjo/blobby-server:latest`,
            );
        }
        expect(serverRunCommand({ siteUrl: 'https://bvt.example.test', token: TOKEN, port: 4321, image: LATEST }, 'bash')).toContain(' -p 4321:1234/udp ');
        expect(serverRunCommand({ siteUrl: 'https://bvt.example.test', token: TOKEN, port: 1234, image: DEV }, 'bash')).toMatch(/ sondresjo\/blobby-server:dev$/);
    });

    it('is the same line in PowerShell and bash, so the page shows one', () => {
        for (const siteUrl of ['https://bvt.example.test', 'http://[fd00::1]:3000', '<site address>']) {
            const input = { siteUrl, token: TOKEN, port: 1234, image: DEV };
            expect(serverRunCommand(input, 'powershell')).toBe(serverRunCommand(input, 'bash'));
        }
    });

    it('quotes a value the shell would read as something else', () => {
        // In bash a quote inside quotes is written as '\'' and must reach the shell as those four characters.
        expect(shellArg("a b'c", 'bash')).toBe(String.raw`'a b'\''c'`);
        expect(shellArg("a b'c", 'bash')).toHaveLength(10);
        expect(shellArg("a b'c", 'powershell')).toBe(`'a b''c'`);
        expect(shellArg('$x', 'powershell')).toBe(`'$x'`);
        expect(serverRunCommand({ siteUrl: 'https://x.test', token: 'a$b', port: 1, image: LATEST }, 'bash')).toContain(`-e 'BLOBBY_SITE_TOKEN=a$b'`);
    });
});

describe('siteUrl', () => {
    it('is the origin of NEXTAUTH_URL', () => {
        expect(siteUrl({ NEXTAUTH_URL: 'https://bvt.example.test/' })).toBe('https://bvt.example.test');
        expect(siteUrl({ NEXTAUTH_URL: 'not a url' })).toBeNull();
        expect(siteUrl({})).toBeNull();
    });
});

describe('serverImage', () => {
    it('is the latest image unless BLOBBY_SERVER_TAG names a valid tag', () => {
        expect(DEFAULT_SERVER_IMAGE).toBe(LATEST);
        expect(serverImage({})).toBe(LATEST);
        expect(serverImage({ BLOBBY_SERVER_TAG: '' })).toBe(LATEST);
        expect(serverImage({ BLOBBY_SERVER_TAG: 'latest' })).toBe(LATEST);
        expect(serverImage({ BLOBBY_SERVER_TAG: 'dev' })).toBe(DEV);
        expect(serverImage({ BLOBBY_SERVER_TAG: ' dev ' })).toBe(DEV);
        expect(serverImage({ BLOBBY_SERVER_TAG: '1.2.0' })).toBe('sondresjo/blobby-server:1.2.0');
        for (const bad of ['dev latest', '-dev', 'dev$x', 'a'.repeat(129)]) expect(serverImage({ BLOBBY_SERVER_TAG: bad })).toBe(LATEST);
    });
});

describe('serverHelp', () => {
    it('holds no token', () => {
        expect(serverHelp(LATEST).map((h) => h.command).join(' ')).not.toMatch(/TOKEN/);
    });

    it('gets the newest image of the tag, and the old container is removed by name', () => {
        expect(serverHelp(LATEST).map((h) => h.command)).toContain('docker pull sondresjo/blobby-server:latest');
        expect(serverHelp(DEV).map((h) => h.command)).toContain('docker pull sondresjo/blobby-server:dev');
        expect(SERVER_REMOVE).toBe('docker rm -f blobby-server');
    });
});

describe('firewallCommand', () => {
    it('opens the UDP port of the event', () => {
        expect(firewallCommand(4321)).toBe('New-NetFirewallRule -DisplayName "Blobby Volley server" -Direction Inbound -Protocol UDP -LocalPort 4321 -Action Allow');
    });
});

describe('startScripts', () => {
    it('link the scripts in the game repository and start them', () => {
        const START_SCRIPTS = startScripts(LATEST);
        expect(START_SCRIPTS.map((s) => s.href)).toEqual([
            'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2-tournament/main/scripts/tournament-server.ps1',
            'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2-tournament/main/scripts/tournament-server.sh',
        ]);
        expect(START_SCRIPTS.map((s) => s.download)).toEqual([
            'iwr https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2-tournament/main/scripts/tournament-server.ps1 -OutFile tournament-server.ps1',
            'curl -fsSLO https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2-tournament/main/scripts/tournament-server.sh',
        ]);
        expect(START_SCRIPTS.map((s) => s.command)).toEqual(['powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1 start', 'bash tournament-server.sh start']);
        expect(START_SCRIPTS.map((s) => s.update)).toEqual(['powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1 update', 'bash tournament-server.sh update']);
        expect(START_SCRIPTS.map((s) => s.setToken)).toEqual(['powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1 set-token', 'bash tournament-server.sh set-token']);
        expect(START_SCRIPTS.map((s) => s.image)).toEqual([null, null]);
    });

    it('pick another image with BLOBBY_SCRIPT_IMAGE', () => {
        expect(startScripts(DEV).map((s) => s.image)).toEqual(["$env:BLOBBY_SCRIPT_IMAGE = 'sondresjo/blobby-server:dev'", 'export BLOBBY_SCRIPT_IMAGE=sondresjo/blobby-server:dev']);
    });
});
