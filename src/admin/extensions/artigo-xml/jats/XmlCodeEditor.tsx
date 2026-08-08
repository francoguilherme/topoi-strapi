import * as React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';

interface XmlCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const extensions = [xml(), EditorView.lineWrapping];

/**
 * Controlled raw XML editor with syntax highlighting, used as the "Editar XML bruto"
 * view. Kept intentionally simple (no linting/autocomplete) since the source of truth
 * for validity is `parseJatsXml`, run on save.
 */
export const XmlCodeEditor: React.FC<XmlCodeEditorProps> = ({ value, onChange, readOnly }) => (
  <CodeMirror
    value={value}
    onChange={onChange}
    extensions={extensions}
    readOnly={readOnly}
    basicSetup={{
      lineNumbers: true,
      foldGutter: true,
      highlightActiveLine: true,
    }}
    style={{ fontSize: 13 }}
  />
);
