import { useEffect, useMemo } from 'react';

import { useShortcutContext } from './ShortcutProvider';
import type { ShortcutId } from './shortcuts';
import type { ShortcutDefinition, ShortcutScope } from './types';

type UseShortcutOptions = Omit<ShortcutDefinition, 'scope'> & {
  scope?: ShortcutScope;
};

export function useShortcut(
  definition: UseShortcutOptions,
  handler: (event: KeyboardEvent) => boolean | void
) {
  const { registerShortcut } = useShortcutContext();
  const scopedDefinition = useMemo<ShortcutDefinition>(
    () => ({
      ...definition,
      scope: definition.scope ?? 'component',
    }),
    [definition]
  );

  useEffect(() => {
    const unregister = registerShortcut({
      ...scopedDefinition,
      handler,
    });
    return unregister;
  }, [registerShortcut, handler, scopedDefinition]);
}

export function useNamedShortcut(
  id: ShortcutId,
  overrides: Partial<ShortcutDefinition> | undefined,
  handler: (event: KeyboardEvent) => boolean | void
) {
  const { getDefinition } = useShortcutContext();
  const baseDefinition = getDefinition(id);

  const mergedDefinition = useMemo<UseShortcutOptions>(
    () => ({
      ...baseDefinition,
      ...overrides,
      id: baseDefinition.id,
      chord: overrides?.chord ?? baseDefinition.chord,
      scope: overrides?.scope ?? baseDefinition.scope,
    }),
    [baseDefinition, overrides]
  );

  useShortcut(mergedDefinition, handler);
}
