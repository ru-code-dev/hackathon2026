import { ArtifactValidationError, ExtractionError } from '../shared/errors.js'

/** Prints a failure in a form that is actionable without a stack trace, where possible. */
export const reportFailure = (command: string, error: unknown): void => {
  if (error instanceof ArtifactValidationError) {
    console.error(`✖ ${command}: produced an artifact that violates its own schema.`)
    console.error(error.message)
    return
  }

  if (error instanceof ExtractionError) {
    console.error(`✖ ${command}: ${error.message}`)
    return
  }

  console.error(`✖ ${command}: unexpected failure.`)
  console.error(error)
}
