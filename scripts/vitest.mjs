// Runs Vitest from the canonical on-disk path.
//
// On Windows, VS Code (and some shells) hand processes a working directory with a
// lowercase drive letter (`c:\...`). Vitest then loads its own modules twice under
// `c:` and `C:` and fails with "failed to find the current suite". Spawning it with
// the real path casing avoids that. On macOS/Linux this is a no-op.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

const cwd = realpathSync.native(process.cwd())
const bin = join(cwd, 'node_modules', 'vitest', 'vitest.mjs')
const { status } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
})
process.exit(status ?? 1)
