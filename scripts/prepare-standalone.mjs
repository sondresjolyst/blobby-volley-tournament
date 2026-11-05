import { cpSync, rmSync } from 'node:fs';

const target = '.next/standalone/.next/static';
rmSync(target, { recursive: true, force: true });
cpSync('.next/static', target, { recursive: true });
