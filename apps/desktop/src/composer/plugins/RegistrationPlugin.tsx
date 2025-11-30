import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { useEffect } from 'react';

export const RegistrationPlugin = ({
  onRegister,
}: {
  onRegister: (editor: LexicalEditor) => void;
}) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onRegister(editor);
  }, [editor, onRegister]);
  return null;
};
