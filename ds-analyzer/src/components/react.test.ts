import { describe, expect, it } from 'vitest'

import { createSourceFile, testLocate } from '../testing/source.js'

import { findReactComponents, isComponentName } from './react.js'

const detect = (code: string) => findReactComponents([createSourceFile('components/X/X.tsx', code)], testLocate)

describe('isComponentName', () => {
  it('requires PascalCase', () => {
    expect(isComponentName('Button')).toBe(true)
    expect(isComponentName('ButtonIcon2')).toBe(true)
    expect(isComponentName('useButton')).toBe(false)
    expect(isComponentName('buttonStyles')).toBe(false)
    expect(isComponentName('BUTTON')).toBe(true)
  })
})

describe('findReactComponents', () => {
  it('detects React.forwardRef', () => {
    const [component] = detect(`
      export const Button = React.forwardRef((props, ref) => <button ref={ref} />)
    `)

    expect(component).toMatchObject({ name: 'Button', detection: 'forwardRef' })
  })

  it('detects bare forwardRef', () => {
    expect(detect(`export const Card = forwardRef(() => <div />)`)[0]?.detection).toBe('forwardRef')
  })

  it('sees through an `as` cast, which the kit uses to attach sub-components', () => {
    const [component] = detect(`
      export const Button = React.forwardRef(() => <button />) as unknown as ButtonComponent
    `)

    expect(component?.detection).toBe('forwardRef')
  })

  it('detects React.memo', () => {
    expect(detect(`export const Chip = React.memo(ChipBase)`)[0]?.detection).toBe('memo')
  })

  it('detects a function declaration containing JSX', () => {
    expect(detect(`export function Grid(props) { return <div>{props.children}</div> }`)[0]?.detection).toBe(
      'functionWithJsx',
    )
  })

  it('detects an arrow function containing JSX, including fragments', () => {
    expect(detect(`export const Icon = () => <svg />`)[0]?.detection).toBe('arrowWithJsx')
    expect(detect(`export const List = () => <>{null}</>`)[0]?.detection).toBe('arrowWithJsx')
  })

  it('detects a class component', () => {
    expect(detect(`export class Legacy extends React.Component { render() { return <div /> } }`)[0]?.detection).toBe(
      'classComponent',
    )
  })

  it('detects a PascalCase alias re-export', () => {
    expect(detect(`export const Input = PVInput`)[0]?.detection).toBe('reExportedAlias')
  })

  it('ignores functions without JSX and non-PascalCase names', () => {
    expect(detect(`export const useThing = () => <div />`)).toEqual([])
    expect(detect(`export function helper() { return 1 }`)).toEqual([])
    expect(detect(`export const config = { a: 1 }`)).toEqual([])
  })

  it('attaches statically assigned sub-components', () => {
    const [component] = detect(`
      const Icon = React.forwardRef(() => <i />)
      export const Button = React.forwardRef(() => <button />)
      Button.Icon = Icon
      Button.displayName = 'Button'
    `)

    expect(component?.name).toBe('Button')
    expect(component?.subcomponents).toEqual(['Icon'])
  })

  it('ignores sub-component assignments to unknown parents', () => {
    const components = detect(`
      export const Button = React.forwardRef(() => <button />)
      Unknown.Icon = Button
    `)

    expect(components[0]?.subcomponents).toEqual([])
  })

  it('records the declaration location', () => {
    const [component] = detect(`\nexport const Button = () => <button />`)

    expect(component?.location).toEqual({ file: 'packages/base/src/components/X/X.tsx', line: 2 })
  })

  it('captures JSDoc, including the deprecated tag', () => {
    const [component] = detect(`
      /**
       * Кнопка.
       * @deprecated Используйте PolymorphicButton.
       */
      export const Button = () => <button />
    `)

    expect(component?.doc.text).toBe('Кнопка.')
    expect(component?.doc.deprecated).toBe(true)
    expect(component?.doc.deprecationNote).toBe('Используйте PolymorphicButton.')
  })

  it('sorts results by name', () => {
    const names = detect(`
      export const Zeta = () => <i />
      export const Alpha = () => <i />
    `).map((component) => component.name)

    expect(names).toEqual(['Alpha', 'Zeta'])
  })
})
