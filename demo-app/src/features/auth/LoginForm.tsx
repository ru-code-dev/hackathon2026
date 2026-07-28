import * as React from 'react'
import { Button, TextField, Text } from '@sds-eng/base'

/**
 * FIXTURE: clean reference file.
 *
 * Uses only kit components, only documented prop values, no styling of its own.
 * The analyser must report ZERO findings here — this file is the false-positive
 * canary for the whole detector suite.
 */
export const LoginForm = (): React.ReactElement => {
  const [login, setLogin] = React.useState('')
  const [password, setPassword] = React.useState('')

  const submit = () => {
    // eslint-disable-next-line no-console
    console.log({ login, password })
  }

  return (
    <form onSubmit={submit}>
      <Text>Вход в систему</Text>

      <TextField size="md" value={login} onChange={setLogin} placeholder="Логин" />
      <TextField size="md" value={password} onChange={setPassword} placeholder="Пароль" />

      <Button view="primary" size="md" onClick={submit}>
        Войти
      </Button>
      <Button view="secondary" size="md">
        Отмена
      </Button>
    </form>
  )
}
