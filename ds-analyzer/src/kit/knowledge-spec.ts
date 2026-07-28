import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { KitSignature, KitSignaturesArtifact } from '../domain/kit-knowledge.js'
import { kitSignaturesArtifactSchema } from '../domain/kit-knowledge.js'

/**
 * Query facade over `kit-signatures.json`.
 *
 * Separate from {@link KitSpec} for the same reason as the a11y and icon specs: different
 * availability. When the artifact has not been built the component rules stay silent and
 * record a limitation — a component verdict without the signature index behind it would be
 * a guess wearing a score.
 */
export class KnowledgeSpec {
  private constructor(private readonly artifact: KitSignaturesArtifact) {}

  static unavailable(): KnowledgeSpec {
    return new KnowledgeSpec({
      $schema: 'ds-analyzer/kit-signatures@1',
      meta: { counts: { components: 0, withoutSource: 0 } },
      signatures: [],
    })
  }

  static from(artifact: KitSignaturesArtifact): KnowledgeSpec {
    return new KnowledgeSpec(kitSignaturesArtifactSchema.parse(artifact))
  }

  static load(artifactsDir: string): KnowledgeSpec {
    const file = join(artifactsDir, 'kit-signatures.json')

    if (!existsSync(file)) {
      return KnowledgeSpec.unavailable()
    }

    return new KnowledgeSpec(kitSignaturesArtifactSchema.parse(JSON.parse(readFileSync(file, 'utf8'))))
  }

  get available(): boolean {
    return this.artifact.signatures.length > 0
  }

  get signatures(): readonly KitSignature[] {
    return this.artifact.signatures
  }
}
