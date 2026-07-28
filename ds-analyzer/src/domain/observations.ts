import { z } from 'zod'

import { limitationSchema, styleSyntaxSchema } from './profile.js'

/**
 * Wire contract for `ui-analyzer/.cache/observations.json` (architecture.md §4).
 *
 * This is the boundary where style syntax stops mattering. Above it live five collectors
 * that each know one dialect; below it live rules that know none. A new dialect is a new
 * collector and zero rule changes — that property is the whole reason the boundary
 * exists, and it only holds if nothing here leaks syntax.
 *
 * There is deliberately no notion of a *deviation* in this file. These are facts about
 * what the code contains, recorded without judgement.
 */

export const styleValueSourceSchema = styleSyntaxSchema

/**
 * Where a class ultimately lands. Filled in by the linking pass, which is the only step
 * that can see style declarations and JSX at the same time.
 */
export const appliedToSchema = z.object({
  kind: z.enum(['kit-component', 'local-component', 'host-element', 'unused']),
  /** Kit component name for `kit-component`, tag or component name otherwise. */
  name: z.string().nullable(),
  /** `classes` slot the declaration reaches, when it was applied through a slot map. */
  slot: z.string().nullable(),
})

export const styleValueSchema = z.object({
  /** CSS property name, always in CSS spelling (`font-size`, never `fontSize`). */
  property: z.string().min(1),
  /** Declaration value exactly as authored, after variable resolution where possible. */
  value: z.string(),
  /** Value before SCSS variable resolution, when it differed. */
  authored: z.string().nullable(),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  source: styleValueSourceSchema,
  /**
   * Selector or styled-component name the declaration belongs to, for display.
   * `null` for inline styles, which have no selector.
   */
  selector: z.string().nullable(),
  /** Bare CSS class names in `selector`, used to link declarations to JSX. */
  classNames: z.array(z.string()),
  important: z.boolean(),
  /**
   * `true` when the authored value contained an interpolation that could not be
   * resolved. The literal parts are still recorded; the finding is downgraded and the
   * file is listed under limitations rather than silently treated as clean.
   */
  dynamic: z.boolean(),
  /**
   * Declaration site of the variable the value came from, when it came from one.
   * Fixing the root repairs every usage, so the report groups by this rather than
   * emitting N identical findings.
   */
  rootCause: z
    .object({
      file: z.string(),
      line: z.number().int().positive(),
      name: z.string(),
    })
    .nullable(),
  appliedTo: appliedToSchema.nullable(),
})

export const styleRefSchema = z.object({
  /** `classes` slot name, or `null` when applied through plain `className`. */
  slot: z.string().nullable(),
  /** Local identifier of the style-module import, e.g. `styles`. */
  module: z.string(),
  /** Member read off it, e.g. `root`. */
  className: z.string(),
})

export const jsxElementSchema = z.object({
  /** Element name as written, e.g. `Button` or `div`. */
  name: z.string().min(1),
  /** Module specifier the name was imported from; `null` for host elements and locals. */
  resolvedFrom: z.string().nullable(),
  /** Kit component this element is, after barrel and alias resolution; `null` otherwise. */
  kitComponent: z.string().nullable(),
  /** Literal prop values; `null` marks a prop whose value is an expression. */
  props: z.record(z.string(), z.string().nullable()),
  /**
   * Source text of the props {@link jsxElementSchema.shape.props} could not reduce to a
   * literal.
   *
   * Invariant, asserted in the collector's tests: a key is present here **if and only if**
   * `props[key] === null`. The two maps are one fact split by whether it is evaluable, not
   * two independent records — `aria-controls={`panel-${id}`}` has to be visible to the
   * rules as *something*, or a widget whose ARIA relations are built from a template reads
   * as a widget with no ARIA relations at all.
   *
   * This is source text, deliberately not an evaluated value: relation checks compare
   * whether two attributes are built from the same expression, which does not require
   * knowing what it evaluates to.
   */
  propExpressions: z.record(z.string(), z.string()),
  /** Event handler prop names present on the element, e.g. `['onClick', 'onKeyDown']`. */
  eventHandlers: z.array(z.string()),
  /**
   * Key names named literally inside this element's inline handlers, e.g. `['ArrowRight']`.
   *
   * Empty means one of two different things, and the rules must not conflate them: no keys
   * are referenced, or the handler is a bare reference (`onKeyDown={handleKey}`) whose body
   * lives elsewhere. `eventHandlers` non-empty with `keysHandled` empty is the second case,
   * and it belongs in `limitations[]` rather than in a finding.
   */
  keysHandled: z.array(z.string()),
  /**
   * `true` when the element has non-whitespace text among its children.
   *
   * The cheapest possible proxy for "this control has a visible label". Without it, a rule
   * about missing accessible names cannot tell `<button><Icon/></button>` from
   * `<button>Save</button>` and would report every button in the project.
   */
  hasTextChild: z.boolean(),
  /** Source line of each prop, for precise finding coordinates. */
  propLines: z.record(z.string(), z.number().int().positive()),
  styleRefs: z.array(styleRefSchema),
  hasInlineStyle: z.boolean(),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

export const importSchema = z.object({
  specifier: z.string().min(1),
  /** Named bindings; `imported` is the exported name, `local` the local alias. */
  names: z.array(z.object({ imported: z.string(), local: z.string(), typeOnly: z.boolean() })),
  defaultImport: z.string().nullable(),
  namespaceImport: z.string().nullable(),
  typeOnly: z.boolean(),
  /** Resolution outcome; `unresolved` is recorded, never guessed around. */
  resolution: z.object({
    kind: z.enum(['relative', 'alias', 'package', 'unresolved']),
    /** Project-relative POSIX path for local resolutions; `null` for packages. */
    file: z.string().nullable(),
  }),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

/**
 * `export … from '…'` — recorded separately from imports because it is the mechanism by
 * which a project's own module becomes a source of kit symbols (architecture.md §3bis.4).
 * Without these the transitive closure cannot be computed and a project that wraps the
 * kit in its own barrel looks like a project that does not use the kit at all.
 */
export const reExportSchema = z.object({
  specifier: z.string().min(1),
  /** `exported` is the name consumers see; `local` the name in the source module. */
  names: z.array(z.object({ exported: z.string(), local: z.string(), typeOnly: z.boolean() })),
  /** `true` for `export * from '…'`, where the exported names cannot be enumerated. */
  star: z.boolean(),
  resolution: z.object({
    kind: z.enum(['relative', 'alias', 'package', 'unresolved']),
    file: z.string().nullable(),
  }),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

export const declarationSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['component', 'styled-component', 'hook', 'other']),
  /** Prop names read off the declared props type or the destructuring pattern. */
  props: z.array(z.string()),
  ariaRoles: z.array(z.string()),
  /** `aria-*` attribute names used, which carry as much signal as `role`. */
  ariaAttributes: z.array(z.string()),
  /** Lower-case host tags rendered directly, e.g. `button`, `dialog`. */
  nativeTags: z.array(z.string()),
  /** Parent>child chains, capped in depth, used as a structural fingerprint. */
  jsxShape: z.array(z.string()),
  /** Kit components rendered inside; a composition of kit parts is a cheap promotion. */
  kitComponentsUsed: z.array(z.string()),
  /** CSS properties reachable from this declaration, for the style fingerprint. */
  cssProperties: z.array(z.string()),
  hasInlineSvg: z.boolean(),
  /**
   * Identifier-free token stream of the declaration body.
   *
   * Emitted here rather than recomputed later so that clone detection never has to
   * re-parse: the collectors are the only stage allowed to touch syntax.
   */
  astSignature: z.array(z.string()),
  /**
   * Event handler props and key names gathered across everything this declaration renders.
   *
   * Aggregated at the declaration because that is the scope a widget's keyboard contract
   * lives at: a dialog closes on `Escape` from a handler on its root, on its overlay, or in
   * an effect, and a rule asking "does this component handle Escape at all" must not depend
   * on which of those the author chose.
   */
  eventHandlers: z.array(z.string()),
  keysHandled: z.array(z.string()),
  /** Number of JSX elements rendered — a crude size proxy used to rank candidates. */
  elementCount: z.number().int().nonnegative(),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

/**
 * `@2` adds `propExpressions`, `eventHandlers` and `keysHandled` to JSX elements.
 * `@3` adds `hasTextChild` to elements and lifts the handler aggregation to declarations.
 *
 * The version is bumped rather than the fields made optional, and that choice is the whole
 * point: an absent optional field and an empty array are indistinguishable at the rule, so
 * a keyboard rule reading a `@1` cache would return zero findings and the report would say
 * "clean" about code nobody looked at. Silence that reads as a pass is the one failure mode
 * this project refuses to ship. A version mismatch is loud; a missing field is not.
 */
export const OBSERVATIONS_SCHEMA_ID = 'ds-analyzer/observations@3'

export const observationsSchema = z.object({
  $schema: z.literal(OBSERVATIONS_SCHEMA_ID),
  styleValues: z.array(styleValueSchema),
  jsxElements: z.array(jsxElementSchema),
  imports: z.array(importSchema),
  reExports: z.array(reExportSchema),
  declarations: z.array(declarationSchema),
  /** Files walked without error, project-relative, sorted. Used for "clean file" metrics. */
  files: z.array(z.string()),
  limitations: z.array(limitationSchema),
})

export type AppliedTo = z.infer<typeof appliedToSchema>
export type StyleValue = z.infer<typeof styleValueSchema>
export type StyleRef = z.infer<typeof styleRefSchema>
export type JsxElement = z.infer<typeof jsxElementSchema>
export type ImportRecord = z.infer<typeof importSchema>
export type ReExportRecord = z.infer<typeof reExportSchema>
export type Declaration = z.infer<typeof declarationSchema>
export type Observations = z.infer<typeof observationsSchema>
