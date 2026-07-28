import { describe, expect, it } from 'vitest'

import { createSourceFile, testLocate } from '../testing/source.js'

import { findPropsTypes, findSlotSets } from './props.js'

const propsFrom = (code: string) =>
  findPropsTypes([createSourceFile('components/Button/interfaces.ts', code)], testLocate)

const slotsFrom = (code: string) => findSlotSets([createSourceFile('components/Button/classes.ts', code)], testLocate)

describe('findPropsTypes', () => {
  it('reads members of an exported interface with their optionality and type text', () => {
    const [props] = propsFrom(`
      export interface ButtonProps {
        /** Размер поля */
        size?: Size
        onClick: () => void
      }
    `)

    expect(props?.name).toBe('ButtonProps')
    expect(props?.members.map(({ name, optional, type }) => ({ name, optional, type }))).toEqual([
      { name: 'size', optional: true, type: 'Size' },
      { name: 'onClick', optional: false, type: '() => void' },
    ])
    expect(props?.members[0]?.doc.text).toBe('Размер поля')
    expect(props?.members[1]?.doc.text).toBeNull()
  })

  it('records heritage clauses it cannot resolve', () => {
    const [props] = propsFrom(`
      export interface ButtonProps extends Omit<PVButtonProps, 'size'>, CommonButtonProps {
        size?: Size
      }
    `)

    expect(props?.extends).toEqual(["Omit<PVButtonProps, 'size'>", 'CommonButtonProps'])
    expect(props?.members).toHaveLength(1)
  })

  it('reads a type alias declared as a plain type literal', () => {
    const [props] = propsFrom(`export type IconProps = { name: string }`)

    expect(props?.members).toEqual([expect.objectContaining({ name: 'name', type: 'string' })])
  })

  it('splits an intersection into inlined members and unresolved bases', () => {
    const [props] = propsFrom(`
      export type PolymorphicButtonProps = PolymorphicComponentProps<T, Base> & { loading?: boolean }
    `)

    expect(props?.members).toEqual([expect.objectContaining({ name: 'loading', optional: true })])
    expect(props?.extends).toEqual(['PolymorphicComponentProps<T, Base>'])
  })

  it('reports zero members but keeps the base when nothing is inlined', () => {
    const [props] = propsFrom(`export type ButtonProps = PolymorphicComponentProps<T, Base>`)

    expect(props?.members).toEqual([])
    expect(props?.extends).toEqual(['PolymorphicComponentProps<T, Base>'])
  })

  it('collapses multi-line type annotations to one line', () => {
    const [props] = propsFrom(`
      export interface ButtonProps {
        handler?: (
          event: MouseEvent,
        ) => void
      }
    `)

    expect(props?.members[0]?.type).toBe('( event: MouseEvent, ) => void')
  })

  it('ignores types that do not end in Props and non-exported ones', () => {
    expect(propsFrom(`export interface ButtonState { open: boolean }`)).toEqual([])
    expect(propsFrom(`interface ButtonProps { a?: string }`)).toEqual([])
  })

  it('sorts results by name', () => {
    const names = propsFrom(`
      export interface ZetaProps { a?: string }
      export interface AlphaProps { b?: string }
    `).map((props) => props.name)

    expect(names).toEqual(['AlphaProps', 'ZetaProps'])
  })
})

describe('findSlotSets', () => {
  it('reads slot names and their docs from a Classes intersection', () => {
    const [slots] = slotsFrom(`
      export type ButtonClasses = ButtonProps['classes'] & {
        /**
         * Стиль, применяемый к спиннеру.
         *
         * @inner
         */
        spinner?: string
        contentContainer?: string
      }
    `)

    expect(slots?.name).toBe('ButtonClasses')
    expect(slots?.slots.map((slot) => slot.name)).toEqual(['spinner', 'contentContainer'])
    expect(slots?.slots[0]?.doc.inner).toBe(true)
    expect(slots?.unresolvedBases).toEqual(["ButtonProps['classes']"])
  })

  it('reads a Classes interface', () => {
    const [slots] = slotsFrom(`
      export interface ButtonIconClasses {
        large?: string
        disabled?: string
      }
    `)

    expect(slots?.slots.map((slot) => slot.name)).toEqual(['large', 'disabled'])
    expect(slots?.unresolvedBases).toEqual([])
  })

  it('ignores types that do not end in Classes', () => {
    expect(slotsFrom(`export type ButtonStyles = { root?: string }`)).toEqual([])
  })
})
