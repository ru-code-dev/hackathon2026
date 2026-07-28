import type { Severity } from '../../domain/findings.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * Turns the canonical linter's reports into findings of this project's shape.
 *
 * The plugin decides *whether* something is wrong — it is the reference implementation and
 * better at that than anything written here would be. This file decides what it means for
 * the report: which WCAG criterion is at stake, how loudly to say it, and what the reader
 * actually loses. Those are editorial calls the plugin does not make and should not.
 *
 * Severity is assigned per rule rather than taken from the linter, which reports everything
 * at whatever level the config set. A missing `alt` is a certainty; `click-events-have-key-events`
 * fires on patterns that are sometimes deliberate. Flattening the two into one level is how
 * a report earns the reputation that gets it switched off.
 */

interface RuleMeta {
  readonly severity: Severity
  readonly wcag: readonly string[]
  readonly impact: string
}

/**
 * The editorial layer: criterion, severity and consequence per rule.
 *
 * Rules absent from this table still produce findings, at `info` with no criterion — a new
 * rule appearing after a plugin upgrade must not vanish silently just because nobody has
 * classified it yet.
 */
const RULE_META: Readonly<Record<string, RuleMeta>> = {
  'alt-text': {
    severity: 'error',
    wcag: ['1.1.1'],
    impact: 'Изображение не будет описано вообще — скринридер прочитает имя файла или промолчит.',
  },
  'anchor-has-content': {
    severity: 'error',
    wcag: ['2.4.4'],
    impact: 'Ссылка без текста объявляется как «ссылка» без указания, куда она ведёт.',
  },
  'anchor-is-valid': {
    severity: 'error',
    wcag: ['2.1.1'],
    impact: 'Ссылка без href недостижима с клавиатуры.',
  },
  'anchor-ambiguous-text': {
    severity: 'info',
    wcag: ['2.4.4'],
    impact: '«Здесь» и «подробнее» вне контекста не говорят, куда ведёт ссылка.',
  },
  'aria-activedescendant-has-tabindex': {
    severity: 'error',
    wcag: ['2.1.1'],
    impact: 'Составной виджет не получит фокус, и управлять им с клавиатуры не выйдет.',
  },
  'aria-proptypes': {
    severity: 'error',
    wcag: ['4.1.2'],
    impact: 'Значение ARIA-атрибута недопустимо: состояние объявляется неверно или игнорируется.',
  },
  'autocomplete-valid': {
    severity: 'warning',
    wcag: ['1.3.5'],
    impact: 'Браузер не подставит сохранённые данные — форму придётся заполнять руками.',
  },
  'click-events-have-key-events': {
    severity: 'warning',
    wcag: ['2.1.1'],
    impact: 'Действие доступно только мышью.',
  },
  'heading-has-content': {
    severity: 'error',
    wcag: ['1.3.1'],
    impact: 'Пустой заголовок ломает навигацию по структуре страницы.',
  },
  'html-has-lang': {
    severity: 'error',
    wcag: ['3.1.1'],
    impact: 'Синтезатор речи прочитает текст с неверным произношением.',
  },
  'iframe-has-title': {
    severity: 'error',
    wcag: ['4.1.2'],
    impact: 'Встроенный фрейм объявляется без названия — непонятно, что внутри.',
  },
  'img-redundant-alt': {
    severity: 'info',
    wcag: ['1.1.1'],
    impact: 'Скринридер произнесёт «изображение» дважды.',
  },
  'interactive-supports-focus': {
    severity: 'error',
    wcag: ['2.1.1'],
    impact: 'Интерактивный элемент не получает фокус: с клавиатуры до него не добраться.',
  },
  'label-has-associated-control': {
    severity: 'error',
    wcag: ['1.3.1', '4.1.2'],
    impact: 'Подпись не связана с полем — скринридер объявит поле безымянным.',
  },
  'media-has-caption': {
    severity: 'warning',
    wcag: ['1.2.2'],
    impact: 'Аудиодорожка недоступна тем, кто не слышит.',
  },
  'mouse-events-have-key-events': {
    severity: 'warning',
    wcag: ['2.1.1'],
    impact: 'Поведение при наведении не воспроизводится с клавиатуры.',
  },
  'no-access-key': {
    severity: 'info',
    wcag: [],
    impact: 'Горячая клавиша может конфликтовать с сочетаниями скринридера.',
  },
  'no-autofocus': {
    severity: 'warning',
    wcag: ['2.4.3'],
    impact: 'Фокус уезжает без действия пользователя — контекст теряется.',
  },
  'no-distracting-elements': {
    severity: 'error',
    wcag: ['2.2.2'],
    impact: 'Мигающее и бегущее содержимое невозможно остановить.',
  },
  'no-interactive-element-to-noninteractive-role': {
    severity: 'error',
    wcag: ['4.1.2'],
    impact: 'Роль отменяет интерактивность, которая у элемента есть на самом деле.',
  },
  'no-noninteractive-element-interactions': {
    severity: 'warning',
    wcag: ['2.1.1'],
    impact: 'Обработчик висит на элементе, до которого нельзя добраться с клавиатуры.',
  },
  'no-noninteractive-element-to-interactive-role': {
    severity: 'warning',
    wcag: ['4.1.2'],
    impact: 'Элемент объявлен интерактивным, но не ведёт себя так.',
  },
  'no-noninteractive-tabindex': {
    severity: 'warning',
    wcag: ['2.4.3'],
    impact: 'В порядок обхода попадает элемент, с которым нечего делать.',
  },
  'no-redundant-roles': {
    severity: 'info',
    wcag: [],
    impact: 'Роль дублирует семантику тега и переживёт его замену при рефакторинге.',
  },
  'no-static-element-interactions': {
    severity: 'warning',
    wcag: ['2.1.1'],
    impact: 'Кликабельный <div> недоступен ни с клавиатуры, ни для скринридера.',
  },
  scope: {
    severity: 'error',
    wcag: ['1.3.1'],
    impact: 'Заголовки таблицы не связываются с ячейками.',
  },
  'tabindex-no-positive': {
    severity: 'warning',
    wcag: ['2.4.3'],
    impact: 'Положительный tabindex ломает порядок обхода на всей странице.',
  },
  lang: {
    severity: 'warning',
    wcag: ['3.1.1'],
    impact: 'Код языка недопустим — синтезатор речи выберет неверное произношение.',
  },
  'no-aria-hidden-on-focusable': {
    severity: 'error',
    wcag: ['4.1.2'],
    impact: 'Элемент получает фокус, но скрыт от скринридера: фокус «проваливается в пустоту».',
  },
  'prefer-tag-over-role': {
    severity: 'info',
    wcag: [],
    impact: 'Нативный тег дал бы ту же семантику вместе с поведением.',
  },
}

const UNCLASSIFIED: RuleMeta = {
  severity: 'info',
  wcag: [],
  impact: 'Нарушение правила доступности; последствие не классифицировано в этой версии.',
}

export const jsxA11yLintRule: Rule = {
  id: 'a11y.lint',
  category: 'a11y',
  description: 'Базовые правила доступности JSX (eslint-plugin-jsx-a11y)',
  run: (context: RuleContext): RawFinding[] =>
    context.observations.lintMessages.map((message) => {
      const meta = RULE_META[message.rule] ?? UNCLASSIFIED

      return {
        rule: 'a11y.lint',
        // The plugin's rule name is the subkind, so the dashboard can group by it and a
        // reader can look the rule up by the name its documentation uses.
        subkind: message.rule,
        category: 'a11y',
        severity: meta.severity,
        // The plugin is a static checker over one element: where it fires, it is right
        // about what it saw. What it cannot see is context, which is what the softer
        // severities above account for.
        confidence: meta.severity === 'error' ? 0.95 : 0.75,
        file: message.file,
        line: message.line,
        column: message.column,
        actual: message.message,
        expected: null,
        why: message.message,
        note: null,
        rootCause: null,
        appliedTo: null,
        autoFixable: false,
        needsAgent: false,
        candidates: [],
        a11y: { wcag: [...meta.wcag], pattern: null, impact: meta.impact },
        impactKey: `a11y.lint:${message.rule}`,
        replaceWith: null,
      }
    }),
}
