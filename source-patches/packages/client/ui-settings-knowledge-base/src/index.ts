/**
 * Knowledge Base settings: host-side entry. Registers the settings namespace
 * for the Obsidian vault path so the client-side UI can read/write it.
 * @module @deepseek-ai/dsh-client-ui-settings-knowledge-base
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace for knowledge base configuration. */
const KB_NAMESPACE = 'knowledge-base'

export interface KnowledgeBaseSettings {
  /** Path to the Obsidian vault (or any knowledge base directory). */
  vaultPath: string
}

const KnowledgeBaseSettingsSchema: z<KnowledgeBaseSettings> = z.object({
  vaultPath: z.string(),
})

/** Register the knowledge-base settings namespace when a settings provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(KB_NAMESPACE),
      KnowledgeBaseSettingsSchema,
    )
  })
}