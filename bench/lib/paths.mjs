/*
 * Where the repository is, from anywhere under bench/.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
export const enginePath = path.join(repoRoot, 'src', 'nwsapi.js');
