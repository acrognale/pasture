import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import { updateRootText } from '../mentions';

export const ExternalValuePlugin = ({ value }: { value: string }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    updateRootText(editor, value);
  }, [editor, value]);

  return null;
};
