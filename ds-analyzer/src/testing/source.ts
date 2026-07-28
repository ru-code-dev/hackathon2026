import { Project, ScriptTarget, type SourceFile } from 'ts-morph'

import type { AnalyzerPaths } from '../config.js'
import type { LocationFactory } from '../components/location.js'

/**
 * In-memory ts-morph fixtures for the syntactic readers.
 *
 * Unit tests must not depend on the UI kit being checked out at a particular path, and
 * must be able to assert on inputs the kit does not currently contain (a class
 * component, a malformed variant object). An in-memory file system gives both.
 */

/** Root used by in-memory fixtures; also acts as the fake "UI kit root". */
export const TEST_ROOT = '/kit'

const BASE_SRC = `${TEST_ROOT}/packages/base/src`

export const createInMemoryProject = (): Project =>
  new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      jsx: 1,
      noResolve: true,
    },
  })

/** Creates a single source file at `<base>/<relativePath>` and returns it. */
export const createSourceFile = (relativePath: string, code: string, project = createInMemoryProject()): SourceFile =>
  project.createSourceFile(`${BASE_SRC}/${relativePath}`, code, { overwrite: true })

/** Creates several files at once, returning them in the order given. */
export const createSourceFiles = (files: Readonly<Record<string, string>>): SourceFile[] => {
  const project = createInMemoryProject()
  return Object.entries(files).map(([relativePath, code]) => createSourceFile(relativePath, code, project))
}

/** Location factory that strips the fixture root, mirroring the real kit-relative paths. */
export const testLocate: LocationFactory = (absolutePath) =>
  absolutePath.startsWith(`${TEST_ROOT}/`) ? absolutePath.slice(TEST_ROOT.length + 1) : absolutePath

/** Minimal {@link AnalyzerPaths} pointing at the in-memory fixture layout. */
export const testPaths: AnalyzerPaths = {
  analyzerRoot: '/analyzer',
  uiKitRoot: TEST_ROOT,
  themeSrcDir: `${TEST_ROOT}/packages/theme/src`,
  themePackageJson: `${TEST_ROOT}/packages/theme/package.json`,
  baseSrcDir: BASE_SRC,
  componentsDir: `${BASE_SRC}/components`,
  componentsBarrel: `${BASE_SRC}/components/index.ts`,
  baseBarrel: `${BASE_SRC}/index.ts`,
  artifactsDir: '/analyzer/artifacts',
}
