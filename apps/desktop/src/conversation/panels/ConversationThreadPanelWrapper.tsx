import type { PanelComponentProps } from '~/panels/types';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';

import { ConversationThreadPanel } from './ConversationThreadPanel';

export function ConversationThreadPanelWrapper(_props: PanelComponentProps) {
  const runtime = usePanelRuntime();
  const params = runtime.params as Parameters<typeof ConversationThreadPanel>[0];
  return <ConversationThreadPanel {...params} />;
}
