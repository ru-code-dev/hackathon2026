/**
 * FIXTURE: the project's own re-export barrel.
 *
 * This is the case that breaks naive kit detection (architecture.md §3bis.4). Product
 * code imports `Button` from `@/shared/ui`, which is a *local* module — an analyser
 * that only looks for `@sds-eng/*` specifiers concludes the project does not use the
 * kit at all and reports a perfect score.
 *
 * The profiler must compute the transitive closure of re-export barrels and classify
 * `@/shared/ui` as a kit source, so that `<Button view="ghost">` imported from here is
 * still checked against the kit's variants.
 */
export { Button, Text, Tag, TextField } from '@sds-eng/base'

export { MyButton } from './MyButton.js'
export { Spinner } from './Spinner.js'
