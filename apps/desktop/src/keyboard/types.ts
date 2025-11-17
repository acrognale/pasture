export type ShortcutScope =
  | 'global'
  | 'workspace'
  | 'conversation'
  | 'overlay'
  | 'component';

export const SCOPE_PRIORITY: Record<ShortcutScope, number> = {
  overlay: 400,
  conversation: 300,
  workspace: 200,
  global: 100,
  component: 50,
};

export type ShortcutDefinition = {
  id: string;
  chord: string;
  scope: ShortcutScope;
  description?: string;
  /**
   * Whether the shortcut should trigger while focus is inside an input/textarea.
   * Defaults to false.
   */
  allowInInput?: boolean;
  /**
   * Whether repeat events (holding the key down) should be handled.
   * Defaults to false.
   */
  allowRepeat?: boolean;
  /**
   * Optional predicate that can veto handling for a specific KeyboardEvent.
   */
  when?: (event: KeyboardEvent) => boolean;
  /**
   * Optional predicate to toggle the shortcut dynamically (e.g., based on React state).
   */
  enabled?: () => boolean;
  /**
   * Override the default scope priority.
   */
  priorityOverride?: number;
  /**
   * Whether preventDefault should be called automatically after handling.
   * Defaults to true.
   */
  preventDefault?: boolean;
  /**
   * Whether stopPropagation should be called automatically after handling.
   * Defaults to true.
   */
  stopPropagation?: boolean;
};

export type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

export type ShortcutRegistration = ShortcutDefinition & {
  handler: ShortcutHandler;
};
