import type { ComposerBarControls } from '~/composer/components/ComposerBar';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type ConversationPanelServices = {
  registerComposerControls: (controls: ComposerBarControls | null) => void;
  registerScrollToBottom: (fn: (() => void) | null) => void;
  insertFeedbackPrompt: (prompt: string) => void;
  scrollToBottom: () => void;
};

const ConversationPanelServicesContext =
  createContext<ConversationPanelServices | null>(null);

export function ConversationPanelServicesProvider({ children }: PropsWithChildren) {
  const composerRef = useRef<ComposerBarControls | null>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const registerComposerControls = useCallback(
    (controls: ComposerBarControls | null) => {
      composerRef.current = controls;
    },
    []
  );

  const registerScrollToBottom = useCallback((fn: (() => void) | null) => {
    scrollToBottomRef.current = fn;
  }, []);

  const insertFeedbackPrompt = useCallback((prompt: string) => {
    const controls = composerRef.current;
    if (!controls) {
      return;
    }
    const existing = controls.getDraft().trim();
    const nextDraft = existing ? `${existing}\n\n${prompt}` : prompt;
    controls.setDraft(nextDraft);
    controls.focus();
    scrollToBottomRef.current?.();
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollToBottomRef.current?.();
  }, []);

  const value = useMemo<ConversationPanelServices>(
    () => ({
      registerComposerControls,
      registerScrollToBottom,
      insertFeedbackPrompt,
      scrollToBottom,
    }),
    [
      insertFeedbackPrompt,
      registerComposerControls,
      registerScrollToBottom,
      scrollToBottom,
    ]
  );

  return (
    <ConversationPanelServicesContext.Provider value={value}>
      {children}
    </ConversationPanelServicesContext.Provider>
  );
}

export function useConversationPanelServices(): ConversationPanelServices {
  const services = useContext(ConversationPanelServicesContext);
  if (!services) {
    throw new Error(
      'ConversationPanelServicesProvider is missing in the component tree.'
    );
  }
  return services;
}

