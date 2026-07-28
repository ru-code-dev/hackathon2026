import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { detectGitBranch, detectGitRemote } from './git.js'

/**
 * A wrong branch here aims a generated pull request at the wrong target, so the parsing
 * of `.git/HEAD` — including the worktree indirection and the detached case — is pinned.
 */

const roots: string[] = []

const makeRepo = (head: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'ds-git-'))
  roots.push(root)
  mkdirSync(join(root, '.git'), { recursive: true })
  writeFileSync(join(root, '.git', 'HEAD'), head)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('detectGitBranch', () => {
  it('reads the branch from HEAD', () => {
    const root = makeRepo('ref: refs/heads/feature/pr-flow\n')

    expect(detectGitBranch(root)).toBe('feature/pr-flow')
  })

  it('walks up from a package inside the repository', () => {
    const root = makeRepo('ref: refs/heads/main\n')
    const nested = join(root, 'packages', 'app')
    mkdirSync(nested, { recursive: true })

    expect(detectGitBranch(nested)).toBe('main')
  })

  it('returns null on detached HEAD rather than guessing', () => {
    const root = makeRepo('1234567890abcdef1234567890abcdef12345678\n')

    expect(detectGitBranch(root)).toBeNull()
  })

  it('follows a worktree-style .git file', () => {
    const real = mkdtempSync(join(tmpdir(), 'ds-git-real-'))
    roots.push(real)
    mkdirSync(join(real, 'worktrees', 'wt'), { recursive: true })
    writeFileSync(join(real, 'worktrees', 'wt', 'HEAD'), 'ref: refs/heads/wt-branch\n')

    const linked = mkdtempSync(join(tmpdir(), 'ds-git-linked-'))
    roots.push(linked)
    writeFileSync(join(linked, '.git'), `gitdir: ${join(real, 'worktrees', 'wt')}\n`)

    expect(detectGitBranch(linked)).toBe('wt-branch')
  })
})

describe('detectGitRemote', () => {
  const withConfig = (config: string): string => {
    const root = makeRepo('ref: refs/heads/main\n')
    writeFileSync(join(root, '.git', 'config'), config)
    return root
  }

  it('reads the origin url from a package inside the repository', () => {
    const root = withConfig(
      '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://git.example/team/project.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
    )
    const nested = join(root, 'src', 'app')
    mkdirSync(nested, { recursive: true })

    expect(detectGitRemote(nested)).toBe('https://git.example/team/project.git')
  })

  it('prefers origin over other remotes regardless of order', () => {
    const root = withConfig(
      '[remote "upstream"]\n\turl = https://git.example/up.git\n[remote "origin"]\n\turl = https://git.example/o.git\n',
    )

    expect(detectGitRemote(root)).toBe('https://git.example/o.git')
  })

  it('falls back to the first remote when origin is absent', () => {
    const root = withConfig('[remote "fork"]\n\turl = git@git.example:me/fork.git\n')

    expect(detectGitRemote(root)).toBe('git@git.example:me/fork.git')
  })

  it('returns null when the repository has no remotes', () => {
    const root = withConfig('[core]\n\tbare = false\n')

    expect(detectGitRemote(root)).toBeNull()
  })
})
