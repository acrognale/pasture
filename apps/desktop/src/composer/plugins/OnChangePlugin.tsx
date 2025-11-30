import { OnChangePlugin as LexicalOnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $getRoot, type EditorState } from 'lexical';
import { useCallback } from 'react';

type Props = {
  onChange: (value: string) => void;
  currentValue: () => string;
};

export const OnChangePlugin = ({ onChange, currentValue }: Props) => {
  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const text = $getRoot().getTextContent();
        if (text !== currentValue()) {
          onChange(text);
        }
      });
    },
    [currentValue, onChange]
  );

  return <LexicalOnChangePlugin onChange={handleChange} />;
};
