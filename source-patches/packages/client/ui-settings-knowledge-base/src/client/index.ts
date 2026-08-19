/**
 * Knowledge Base settings section, browser half: registers the section slot
 * entry and binds the settings scope for the Obsidian vault path.
 * Export discipline: packages/client/AGENTS.md.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings slot declarations plus the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KnowledgeBaseSection, type KnowledgeBaseSectionInjected } from './KnowledgeBaseSection.tsx'
import { en, zh, type KnowledgeBaseLocaleKey } from './locales.ts'

export type { KnowledgeBaseSectionInjected, KnowledgeBaseSectionProps } from './KnowledgeBaseSection.tsx'
export type { KnowledgeBaseLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Knowledge Base settings section copy. */
    'settings.knowledgeBase': KnowledgeBaseLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.knowledgeBase'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Register the Knowledge Base settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-knowledge-base: dictionaries')

  const t = ctx.locale.bind(NS)
  const scope = ctx.settingsScope.bind<{ vaultPath: string }>({
    namespace: 'knowledge-base',
    decode: (value: unknown): { vaultPath: string } | undefined => {
      if (typeof value !== 'object' || value === null) return undefined
      const obj = value as Record<string, unknown>
      if (typeof obj.vaultPath !== 'string') return undefined
      return { vaultPath: obj.vaultPath }
    },
  })

  const injected = (): KnowledgeBaseSectionInjected => ({ scope })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'knowledge-base',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, KnowledgeBaseSection))
}