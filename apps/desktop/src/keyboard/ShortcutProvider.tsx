import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { type ShortcutId, getShortcutDefinition } from './shortcuts';
import {
  SCOPE_PRIORITY,
  type ShortcutDefinition,
  type ShortcutRegistration,
} from './types';
import {
  type KeyboardPlatform,
  chordsMatch,
  detectPlatform,
  eventToChord,
  isTargetEditable,
  parseShortcut,
} from './utils';

type RegistryEntry = ShortcutRegistration & {
  parsedChord: ReturnType<typeof parseShortcut>;
  priority: number;
  order: number;
};

type ShortcutContextValue = {
  registerShortcut: (registration: ShortcutRegistration) => () => void;
  getDefinition: (id: ShortcutId) => ShortcutDefinition;
  platform: KeyboardPlatform;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function ShortcutProvider({ children }: PropsWithChildren) {
  const platform = useMemo(() => detectPlatform(), []);
  const entriesRef = useRef<Map<number, RegistryEntry>>(new Map());
  const idRef = useRef(0);

  const registerShortcut = useCallback(
    (registration: ShortcutRegistration) => {
      const handleId = ++idRef.current;
      const priority =
        registration.priorityOverride ?? SCOPE_PRIORITY[registration.scope];
      const entry: RegistryEntry = {
        ...registration,
        parsedChord: parseShortcut(registration.chord, platform),
        priority,
        order: handleId,
      };
      entriesRef.current.set(handleId, entry);

      return () => {
        entriesRef.current.delete(handleId);
      };
    },
    [platform]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const entries = Array.from(entriesRef.current.values());
      if (entries.length === 0) {
        return;
      }

      if (event.repeat) {
        const hasRepeatCandidate = entries.some(
          (entry) =>
            entry.allowRepeat &&
            chordsMatch(entry.parsedChord, eventToChord(event)) &&
            (entry.when ? entry.when(event) : true) &&
            (entry.enabled ? entry.enabled() : true)
        );
        if (!hasRepeatCandidate) {
          return;
        }
      }

      const normalizedEventChord = eventToChord(event);
      const targetEditable = isTargetEditable(event.target);

      const candidates = entries
        .filter((entry) => chordsMatch(entry.parsedChord, normalizedEventChord))
        .filter((entry) => {
          if (event.repeat && !entry.allowRepeat) {
            return false;
          }
          if (targetEditable && !entry.allowInInput) {
            return false;
          }
          if (entry.when && !entry.when(event)) {
            return false;
          }
          if (entry.enabled && !entry.enabled()) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.priority === b.priority) {
            return b.order - a.order;
          }
          return b.priority - a.priority;
        });

      for (const candidate of candidates) {
        const result = candidate.handler(event);
        const handled = result !== false;

        if (handled) {
          if (candidate.preventDefault !== false && !event.defaultPrevented) {
            event.preventDefault();
          }
          if (candidate.stopPropagation !== false) {
            event.stopPropagation();
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const value = useMemo<ShortcutContextValue>(
    () => ({
      registerShortcut,
      getDefinition: (id: ShortcutId) => getShortcutDefinition(id),
      platform,
    }),
    [registerShortcut, platform]
  );

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  );
}

export function useShortcutContext(): ShortcutContextValue {
  const context = useContext(ShortcutContext);
  if (!context) {
    throw new Error('ShortcutProvider is missing in the component tree');
  }
  return context;
}
