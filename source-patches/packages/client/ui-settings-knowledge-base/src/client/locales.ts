/** Copy dictionaries for the Knowledge Base settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '知识库',
  vaultPath: '知识库路径',
  vaultPathPlaceholder: '例如：D:\\项目\\知识库',
  vaultPathDesc: '设置 Obsidian vault 或 Markdown 知识库的本地路径。Agent 可通过 grep 和 read 工具搜索和读取该目录下的文件。',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  test: '测试连接',
  testing: '测试中…',
  testSuccess: '连接成功，路径有效',
  testFailed: '路径无效或不存在',
  loading: '读取中…',
  unavailable: '设置不可用',
  openVault: '打开知识库目录',
} satisfies Record<string, string>

/** Knowledge Base locale key union. */
export type KnowledgeBaseLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Knowledge Base',
  vaultPath: 'Knowledge Base Path',
  vaultPathPlaceholder: 'e.g. D:\\Vault\\KnowledgeBase',
  vaultPathDesc: 'Set the path to your Obsidian vault or Markdown knowledge base. The agent can search and read files in this directory using grep and read tools.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Save failed',
  test: 'Test Connection',
  testing: 'Testing…',
  testSuccess: 'Connection successful, path is valid',
  testFailed: 'Path is invalid or does not exist',
  loading: 'Loading…',
  unavailable: 'Settings unavailable',
  openVault: 'Open knowledge base directory',
} satisfies Record<KnowledgeBaseLocaleKey, string>