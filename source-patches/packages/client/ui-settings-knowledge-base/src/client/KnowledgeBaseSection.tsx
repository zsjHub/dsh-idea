/**
 * Knowledge Base settings section: configure the Obsidian vault path.
 * The agent uses this path to search and read knowledge base files.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore, useState, type ReactNode } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import css from './KnowledgeBaseSection.module.css'

/** Settings namespace value shape (mirrors the server-side schema). */
export interface KnowledgeBaseSettingsValue {
  vaultPath: string
}

/** Injected face: the settings scope bound to the knowledge-base namespace. */
export interface KnowledgeBaseSectionInjected {
  scope: SettingsScope<KnowledgeBaseSettingsValue>
}

/** Full component props assembled by the Settings slot renderer. */
export type KnowledgeBaseSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.knowledgeBase'>
  & InjectFace<KnowledgeBaseSectionInjected>

/**
 * Render the Knowledge Base settings section.
 * @param props - composed slot props.
 * @returns the settings section UI.
 */
export function KnowledgeBaseSection({ scope, t }: KnowledgeBaseSectionProps): ReactNode {
  const snapshot = useSyncExternalStore(scope.subscribe, scope.getSnapshot)
  const [draftPath, setDraftPath] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const initialized = useRef(false)

  const value = snapshot.status === 'ready' ? snapshot.value : undefined

  // Sync draft from snapshot on first load
  useEffect(() => {
    if (!initialized.current && snapshot.status === 'ready' && value !== undefined) {
      setDraftPath(value.vaultPath ?? '')
      initialized.current = true
    }
  }, [snapshot.status, value])

  const handleSave = useCallback(async () => {
    setSaveState('saving')
    try {
      await scope.set('vaultPath', draftPath)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
    }
  }, [scope, draftPath])

  const handleTest = useCallback(async () => {
    const path = draftPath.trim()
    if (path.length === 0) {
      setTestState('failed')
      return
    }

    setTestState('testing')
    try {
      // Validate the path is non-empty and looks like a filesystem path
      // Full server-side validation requires a backend endpoint
      const looksValid = /^[a-zA-Z]:\\/.test(path) || /^\/[^/]/.test(path) || /^~/.test(path)
      await new Promise(resolve => setTimeout(resolve, 300)) // debounce for UX
      setTestState(looksValid ? 'success' : 'failed')
    } catch {
      setTestState('failed')
    }
  }, [draftPath])

  if (snapshot.status === 'loading') {
    return <p className={css.status}>{t('loading')}</p>
  }

  if (snapshot.status === 'unavailable') {
    return <p className={css.status}>{t('unavailable')}</p>
  }

  return (
    <div className={css.section}>
      <div className={css.field}>
        <label className={css.label} htmlFor="kb-vault-path">{t('vaultPath')}</label>
        <input
          id="kb-vault-path"
          className={css.input}
          type="text"
          value={draftPath}
          placeholder={t('vaultPathPlaceholder')}
          onChange={(e) => { setDraftPath(e.currentTarget.value); setSaveState('idle') }}
          spellCheck={false}
        />
        <p className={css.desc}>{t('vaultPathDesc')}</p>
      </div>

      <div className={css.actions}>
        <button
          className={css.primaryButton}
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving'}
        >
          {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('save')}
        </button>

        <button
          className={css.secondaryButton}
          type="button"
          onClick={handleTest}
          disabled={testState === 'testing'}
        >
          {testState === 'testing' ? t('testing') : t('test')}
        </button>

        {testState === 'success' ? (
          <span className={css.testSuccess}>{t('testSuccess')}</span>
        ) : testState === 'failed' ? (
          <span className={css.testFailed}>{t('testFailed')}</span>
        ) : null}

        {saveState === 'error' ? (
          <span className={css.errorText}>{t('saveFailed')}</span>
        ) : null}
      </div>
    </div>
  )
}