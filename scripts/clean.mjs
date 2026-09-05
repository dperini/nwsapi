import { rm } from 'node:fs/promises';

// Remove only the generated bundle; preserve all other dist files.
await rm('./dist/nwsapi.min.js', { force: true });
