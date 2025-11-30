import type { ShortcutDefinition } from './types';

export const SHORTCUTS = {
  'workspace.toggleSidebar': {
    id: 'workspace.toggleSidebar',
    chord: 'CmdOrCtrl+B',
    scope: 'workspace',
    description: 'Toggle the workspace sidebar',
    allowInInput: true,
  },
  'workspace.newThread': {
    id: 'workspace.newThread',
    chord: 'CmdOrCtrl+N',
    scope: 'workspace',
    description: 'Start a new thread',
    allowInInput: true,
  },
  'workspace.openThreadSwitcher': {
    id: 'workspace.openThreadSwitcher',
    chord: 'CmdOrCtrl+P',
    scope: 'workspace',
    description: 'Open thread switcher',
    allowInInput: true,
    when: (event) => !event.altKey && !event.shiftKey,
  },
  'workspace.openSettings': {
    id: 'workspace.openSettings',
    chord: 'CmdOrCtrl+,',
    scope: 'workspace',
    description: 'Open settings',
    allowInInput: true,
  },
  'overlay.conversationReview.close': {
    id: 'overlay.conversationReview.close',
    chord: 'Escape',
    scope: 'overlay',
    description: 'Close the conversation review overlay',
  },
  'conversation.interruptTurn': {
    id: 'conversation.interruptTurn',
    chord: 'Escape',
    scope: 'conversation',
    description: 'Interrupt the active turn',
  },
  'conversation.toggleDevCommandMenu': {
    id: 'conversation.toggleDevCommandMenu',
    chord: 'CmdOrCtrl+K',
    scope: 'conversation',
    description: 'Toggle developer command menu',
    allowInInput: true,
  },
} satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof SHORTCUTS;

export function getShortcutDefinition(id: ShortcutId): ShortcutDefinition {
  return SHORTCUTS[id];
}
