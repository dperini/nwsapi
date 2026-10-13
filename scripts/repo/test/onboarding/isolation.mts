import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SAFE_ENV = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'SystemRoot',
  'WINDIR',
  'PATHEXT',
  'ComSpec',
]
export function isolatedEnvironment(
  root: string,
  pathValue: string,
  source = process.env,
) {
  const env: NodeJS.ProcessEnv = {
    PATH: pathValue,
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'xdg', 'config'),
    XDG_CACHE_HOME: path.join(root, 'xdg', 'cache'),
    XDG_DATA_HOME: path.join(root, 'xdg', 'data'),
    npm_config_cache: path.join(root, 'npm-cache'),
    pnpm_config_store_dir: path.join(root, 'pnpm-store'),
    COREPACK_HOME: path.join(root, 'corepack'),
    NUB_HOME: path.join(root, 'nub'),
    MISE_DATA_DIR: path.join(root, 'mise', 'data'),
    MISE_CONFIG_DIR: path.join(root, 'mise', 'config'),
    MISE_CACHE_DIR: path.join(root, 'mise', 'cache'),
    TMPDIR: path.join(root, 'tmp'),
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
    APPDATA: path.join(root, 'appdata', 'roaming'),
    LOCALAPPDATA: path.join(root, 'appdata', 'local'),
    CI: '1',
    NWSAPI_ONBOARDING: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(root, 'home', '.gitconfig'),
    NO_COLOR: '1',
  }
  for (const name of SAFE_ENV) {
    if (source[name]) {
      env[name] = source[name]
    }
  }
  return env
}

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

export async function makeSandbox(parent = tmpdir()) {
  const directory = await mkdtemp(path.join(parent, 'nwsapi-onboarding-'))
  for (const name of [
    'home',
    'xdg/config',
    'xdg/cache',
    'xdg/data',
    'npm-cache',
    'pnpm-store',
    'corepack',
    'nub',
    'mise/data',
    'mise/config',
    'mise/cache',
    'tmp',
    'appdata/roaming',
    'appdata/local',
  ]) {
    await mkdir(path.join(directory, name), { recursive: true })
  }
  const sentinel = path.join(directory, 'home', 'sentinel')
  await writeFile(sentinel, '# onboarding isolation sentinel\n')
  for (const name of [
    '.npmrc',
    '.pnpmrc',
    '.gitconfig',
    '.zshrc',
    '.bashrc',
    '.zprofile',
    '.bash_profile',
    '.profile',
  ]) {
    await writeFile(
      path.join(directory, 'home', name),
      `# onboarding ${name} sentinel\n`,
    )
  }
  return {
    directory,
    sentinel,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}
