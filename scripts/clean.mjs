import { rm } from 'node:fs/promises';

await rm('./dist', { recursive: true, force: true });
console.log('removed ./dist');
