import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

/**
 * `npm run build:skills` — bakes the distributable Qwen-skill folder.
 *
 * Output: `dist/qwen-skills/` with three skills; `ds-audit` carries the whole runtime —
 * a single self-contained ESM bundle (`scripts/ds.mjs`) plus the kit knowledge and the
 * dashboard template as plain files. Zero dependencies at the user's end: Node ≥ 20, git,
 * nothing else.
 *
 * The build is not done until it has proven itself: the smoke test copies demo-app into a
 * temp git repository OUTSIDE the checkout (no node_modules anywhere near), runs every
 * subcommand through the bundle, requires Shiki-highlighted markup in the dashboard (the
 * «no degradation» guarantee), and `git apply --check`s the selected patch. Any miss
 * fails the build — a bundle that only probably works is not shipped.
 */

const analyzerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(analyzerRoot, 'dist', 'qwen-skills')
const auditDir = join(distDir, 'ds-audit')

const step = (title: string): void => {
  console.log(`\n▸ ${title}`)
}

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const bundle = async (): Promise<void> => {
  step('Бандл ds.mjs (esbuild, один файл, без внешних зависимостей)')
  const result = await build({
    entryPoints: [join(analyzerRoot, 'src', 'cli', 'skill-main.ts')],
    outfile: join(auditDir, 'scripts', 'ds.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: true,
    logLevel: 'warning',
    // Optional lazy dependency of eslint's config-file loader. Our runtime path is
    // `new Linter().verify(...)` only — the loader never executes, so the unresolved
    // import may stay in dead code. Everything else is genuinely bundled.
    external: ['jiti', 'jiti/package.json'],
    // CJS dependencies (ts-morph/typescript, eslint, postcss) assume the CommonJS
    // globals: they `require()` node builtins at runtime and TypeScript's `sys` reads
    // `__filename` at module init. The ESM bundle provides all three the standard way;
    // esbuild's __require shim falls back to this `require`.
    banner: {
      js: [
        "import { createRequire as __dsCreateRequire } from 'node:module';",
        "import { fileURLToPath as __dsFileURLToPath } from 'node:url';",
        "import { dirname as __dsDirname } from 'node:path';",
        'const require = __dsCreateRequire(import.meta.url);',
        'const __filename = __dsFileURLToPath(import.meta.url);',
        'const __dirname = __dsDirname(__filename);',
      ].join('\n'),
    },
  })
  if (result.errors.length > 0) {
    throw new Error(`esbuild: ${String(result.errors.length)} ошибок`)
  }
}

const copyAssets = (): void => {
  step('Ассеты: артефакты знаний + шаблон дашборда + SKILL.md')

  const artifactsSource = join(analyzerRoot, 'artifacts')
  const assetArtifacts = join(auditDir, 'assets', 'artifacts')
  mkdirSync(assetArtifacts, { recursive: true })
  for (const file of readdirSync(artifactsSource).filter((name) => name.endsWith('.json'))) {
    cpSync(join(artifactsSource, file), join(assetArtifacts, file))
  }

  const template = join(analyzerRoot, 'dashboard', 'dist', 'index.html')
  if (!existsSync(template)) {
    throw new Error('Нет dashboard/dist/index.html — сначала соберите дашборд (npm run dashboard:build).')
  }
  cpSync(template, join(auditDir, 'assets', 'dashboard.html'))

  const skillsSource = join(analyzerRoot, 'qwen-skills')
  for (const skill of ['ds-audit', 'ds-deep', 'ds-fix']) {
    cpSync(join(skillsSource, skill, 'SKILL.md'), join(distDir, skill, 'SKILL.md'))
  }
  const installer = join(distDir, 'install-skills.sh')
  cpSync(join(skillsSource, 'install-skills.sh'), installer)
  chmodSync(installer, 0o755)
}

interface Smoke {
  readonly workDir: string
  readonly projectDir: string
}

const prepareSmokeProject = (): Smoke => {
  step('Дымовой тест: копия demo-app во временный git-репозиторий без node_modules')
  const workDir = mkdtempSync(join(tmpdir(), 'ds-skill-smoke-'))
  const projectDir = join(workDir, 'project')

  cpSync(join(analyzerRoot, '..', 'demo-app'), projectDir, {
    recursive: true,
    filter: (source) => !source.includes('ui-analyzer') && !source.includes('node_modules'),
  })

  run('git', ['init', '--quiet'], projectDir)
  run('git', ['-c', 'user.name=smoke', '-c', 'user.email=smoke@test', 'add', '-A'], projectDir)
  run(
    'git',
    ['-c', 'user.name=smoke', '-c', 'user.email=smoke@test', 'commit', '--quiet', '-m', 'baseline'],
    projectDir,
  )

  return { workDir, projectDir }
}

const expect = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Дымовой тест: ${message}`)
  }
}

const smokeTest = ({ workDir, projectDir }: Smoke): void => {
  const script = join(auditDir, 'scripts', 'ds.mjs')

  step('smoke · analyze')
  const analyzeOut = run('node', [script, 'analyze', projectDir], workDir)
  expect(analyzeOut.includes('откройте двойным кликом'), 'analyze не напечатал маркер успеха')

  const dashboard = readFileSync(join(projectDir, 'ui-analyzer', 'dashboard.html'), 'utf8')
  // The colour classes live in the emitted stylesheet (`.sk0{color:…}`) and, escaped, in
  // the JSON payload — an empty ds-syntax style means the highlighter fell back to <pre>.
  expect(dashboard.includes('.sk0{color:'), 'в дашборде нет подсветки Shiki — деградация запрещена')
  expect(dashboard.includes('id="ds-data"'), 'в дашборде нет payload')

  step('smoke · patches')
  const patches = JSON.parse(run('node', [script, 'patches', projectDir], workDir)) as {
    totals: { groups: number; recommendedGroups: number }
    recommendedKeys: string[]
  }
  expect(patches.totals.groups > 0, 'patches не нашёл ни одной группы')
  expect(patches.recommendedKeys.length > 0, 'нет ни одной рекомендованной группы')

  step('smoke · brief')
  const brief = JSON.parse(run('node', [script, 'brief', projectDir], workDir)) as {
    $schema: string
    shares: Record<string, number>
  }
  expect(brief.$schema === 'ds-analyzer/brief@1', 'brief вернул не тот $schema')
  const shareSum = Object.values(brief.shares).reduce((sum, value) => sum + value, 0)
  expect(shareSum === 100, `доли brief не замкнуты: ${String(shareSum)}`)

  step('smoke · deep-pack')
  const deep = JSON.parse(run('node', [script, 'deep-pack', projectDir, '--top', '2'], workDir)) as {
    generated: number
    packs: { packFile: string }[]
  }
  expect(deep.generated > 0, 'deep-pack не создал ни одного пакета')
  for (const pack of deep.packs) {
    const markdown = readFileSync(pack.packFile, 'utf8')
    expect(markdown.includes('Шаблон ответа'), `в пакете ${pack.packFile} нет шаблона ответа`)
  }

  step('smoke · select-patch + git apply')
  const selection = JSON.parse(
    run('node', [script, 'select-patch', projectDir, '--keys', patches.recommendedKeys.join(',')], workDir),
  ) as { path: string; files: string[] }
  expect(selection.files.length > 0, 'select-patch не тронул ни одного файла')

  run('git', ['apply', '--check', 'ui-analyzer/selected.patch'], projectDir)
  run('git', ['apply', 'ui-analyzer/selected.patch'], projectDir)
  const status = run('git', ['status', '--porcelain'], projectDir)
  expect(
    selection.files.every((file) => status.includes(file)),
    'после git apply изменены не все файлы из selection',
  )
}

const main = async (): Promise<void> => {
  rmSync(distDir, { recursive: true, force: true })
  await bundle()
  copyAssets()

  const smoke = prepareSmokeProject()
  try {
    smokeTest(smoke)
  } finally {
    rmSync(smoke.workDir, { recursive: true, force: true })
  }

  const size = Math.round(readFileSync(join(auditDir, 'scripts', 'ds.mjs')).byteLength / 1024 / 1024)
  console.log(`\n✓ dist/qwen-skills готов · ds.mjs ≈ ${String(size)} МБ · дымовой тест пройден целиком`)
  console.log('  Установка: dist/qwen-skills/install-skills.sh')
}

await main()
