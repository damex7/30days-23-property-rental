// Lets plain Node run the app's TypeScript services (npm run check:money,
// npm run db:seed) without a build step or a test framework.
//
// Node 22.18+ already strips TypeScript types from .ts files. What it can't
// do on its own is resolve the app's imports the way Next.js does:
//   import { http } from '@/lib/db/executor'   ← the "@/" path alias (tsconfig paths)
//   import { q } from './sql'                  ← no ".ts" extension
// This resolve hook maps "@/" to the project folder and tries ".ts",
// ".tsx" and "/index.ts", then hands over to Node's normal resolver.
//
// The other half is the --conditions=react-server flag in package.json:
// the `server-only` package then resolves to an empty module instead of
// throwing "this module cannot be imported from a Client Component".
import { existsSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function findFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null
    if (specifier.startsWith('@/')) {
      base = join(root, specifier.slice(2))
    } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      base = resolve(dirname(fileURLToPath(context.parentURL)), specifier)
    }
    if (base) {
      const file = findFile(base)
      if (file) return nextResolve(pathToFileURL(file).href, context)
    }
    return nextResolve(specifier, context)
  },
})
