// Serves e2e/fixtures/game-release.json as the latest game release, so the download page never calls GitHub in the tests.
// It runs in its own process, because the test script blocks its own event loop while Playwright runs.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const body = readFileSync(new URL('../e2e/fixtures/game-release.json', import.meta.url));
const port = Number(process.argv[2]);

createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
}).listen(port, '127.0.0.1');
