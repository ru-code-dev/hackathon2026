import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

/**
 * Reads the analyzed repository's identity — current branch and origin URL — without
 * invoking git, so the analyzer stays runnable where git is not installed (CI containers,
 * the webhook box). Both feed the dashboard's "create PR" flow, and both walk upward from
 * the project root because the analyzed project is often a package inside a monorepo: the
 * branch and the remote belong to the repository, not the subdirectory.
 *
 * Every failure mode returns `null` rather than a guess: a wrong branch or remote aims a
 * generated pull request at the wrong place, which is strictly worse than an empty field.
 */

/** Resolves `start`'s repository to its git directory, following worktree indirection. */
const findGitDir = (start: string): string | null => {
  let directory = start

  for (;;) {
    const dotGit = join(directory, '.git')

    if (existsSync(dotGit)) {
      try {
        if (!statSync(dotGit).isFile()) {
          return dotGit
        }
        // `.git` is a file in worktrees and submodules: `gitdir: /real/path`.
        const target = readFileSync(dotGit, 'utf8')
          .replace(/^gitdir:\s*/, '')
          .trim()
        return isAbsolute(target) ? target : join(directory, target)
      } catch {
        return null
      }
    }

    const parent = dirname(directory)
    if (parent === directory) {
      return null
    }
    directory = parent
  }
}

export const detectGitBranch = (start: string): string | null => {
  const gitDir = findGitDir(start)
  if (gitDir === null) {
    return null
  }

  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    return /^ref: refs\/heads\/(.+)$/.exec(head)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * URL of the `origin` remote (or the first remote when `origin` is absent).
 *
 * Parses `.git/config` directly — a two-key INI subset. In a linked worktree the config
 * lives in the main repository, reached through the `commondir` pointer.
 */
export const detectGitRemote = (start: string): string | null => {
  const gitDir = findGitDir(start)
  if (gitDir === null) {
    return null
  }

  try {
    const commonDirFile = join(gitDir, 'commondir')
    const commonDir = existsSync(commonDirFile) ? join(gitDir, readFileSync(commonDirFile, 'utf8').trim()) : gitDir

    const config = readFileSync(join(commonDir, 'config'), 'utf8')

    const remotes = new Map<string, string>()
    let section: string | null = null

    for (const raw of config.split('\n')) {
      const line = raw.trim()
      const header = /^\[remote "([^"]+)"\]$/.exec(line)
      if (header) {
        section = header[1] ?? null
        continue
      }
      if (line.startsWith('[')) {
        section = null
        continue
      }
      if (section !== null) {
        const url = /^url\s*=\s*(.+)$/.exec(line)
        if (url?.[1] !== undefined && !remotes.has(section)) {
          remotes.set(section, url[1].trim())
        }
      }
    }

    return remotes.get('origin') ?? [...remotes.values()][0] ?? null
  } catch {
    return null
  }
}
