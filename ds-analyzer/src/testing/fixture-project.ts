import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Throwaway project trees for the profiler tests.
 *
 * The profiler's whole job is to cope with layouts it has never seen, so its tests have
 * to be able to invent layouts. In-memory mocking would not do: the code under test reads
 * `tsconfig.json` chains and probes for file extensions, and stubbing the filesystem would
 * mean testing the stub.
 */

export interface FixtureProject {
  /** Absolute root of the fixture. */
  readonly root: string
  /** Removes the tree. */
  readonly dispose: () => void
}

/** Writes `files` (project-relative POSIX paths → contents) into a fresh temp directory. */
export const createFixtureProject = (files: Readonly<Record<string, string>>): FixtureProject => {
  const root = mkdtempSync(join(tmpdir(), 'ds-fixture-'))

  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(root, relativePath)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, content, 'utf8')
  }

  return {
    root,
    dispose: () => {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
