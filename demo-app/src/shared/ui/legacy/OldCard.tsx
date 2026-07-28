import { forwardRef } from 'react'

import styles from './OldCard.module.scss'

/**
 * FIXTURE: a fork of the kit's own `Card` component.
 *
 * Copied from `packages/base/src/components/Card/Card.tsx` at kit 1.2.x and then edited
 * in place: the `@v-uik/base` primitives were swapped for a raw `<div>` and the JSS
 * styles were re-implemented as an SCSS module. The prop surface, the modifier flags
 * (`elevation` / `draggable` / `accent`), the `classes` slot map and the `clsx` shape of
 * the class composition all survived the copy.
 *
 * This is the case import-graph analysis cannot see: the file imports nothing from the
 * kit, so nothing marks it as related. Only normalised-AST similarity against the kit's
 * sources identifies it (architecture.md §5.5, heuristic 7).
 *
 * Expected: component.fork -> Card, similarity > 0.6.
 */
export interface OldCardClasses {
  root?: string
  elevation?: string
  draggable?: string
  accent?: string
  draggableBody?: string
}

export interface OldCardProps {
  /** карточка с тенью */
  elevation?: boolean
  /** карточка с перетягиванием */
  draggable?: boolean
  /** акцентная карточка */
  accent?: boolean
  header?: React.ReactNode
  className?: string
  /** CSS классы компонента */
  classes?: OldCardClasses
  children?: React.ReactNode
}

const clsx = (...values: (string | false | undefined)[]): string => values.filter(Boolean).join(' ')

export const OldCard = forwardRef<HTMLDivElement, OldCardProps>(
  ({ classes, children, className, elevation, draggable, accent, header, ...restProps }, ref) => {
    const classesList = { ...styles, ...classes }

    const rootClassName = clsx(
      className,
      classesList.root,
      elevation && classesList.elevation,
      draggable && classesList.draggable,
      accent && classesList.accent,
      !header && draggable && classesList.draggableBody,
    )

    return (
      <div ref={ref} className={rootClassName} {...restProps}>
        {header ? <div className={styles.header}>{header}</div> : null}
        {draggable ? <span className={styles.draggableIcon} aria-hidden="true" /> : null}
        {children}
      </div>
    )
  },
)

OldCard.displayName = 'OldCard'
