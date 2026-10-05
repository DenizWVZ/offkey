// Makes the ready-to-install test version for friends: builds the extension, then packs it into
// release/offkey-<version>.zip (the version comes from src/extension/manifest.json).
//   npm run zip
// Unzipped, it's one folder, `offkey/`, to load in chrome://extensions (Developer mode → Load unpacked).
// Uses macOS's built-in `zip`; nothing to install. Publish it as a GitHub release (see CLAUDE.md).

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const { version } = JSON.parse(readFileSync(join(root, 'src/extension/manifest.json'), 'utf8'))
const out = join(root, 'release', `offkey-${version}.zip`)

execFileSync('node', [join(root, 'scripts/build-extension.mjs')], { stdio: 'inherit' })

// Copy the build into a folder named `offkey`, so unzipping gives that folder.
const work = mkdtempSync(join(tmpdir(), 'offkey-zip-'))
cpSync(join(root, 'dist-extension'), join(work, 'offkey'), { recursive: true })
mkdirSync(join(root, 'release'), { recursive: true })
rmSync(out, { force: true })
execFileSync('zip', ['-q', '-r', '-X', out, 'offkey', '-x', '*.DS_Store'], { cwd: work })
rmSync(work, { recursive: true, force: true })

console.log(`\nTest version ready: release/offkey-${version}.zip`)
