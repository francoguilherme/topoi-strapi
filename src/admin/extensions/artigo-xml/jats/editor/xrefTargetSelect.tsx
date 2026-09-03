import * as React from 'react';
import { Editor } from 'slate';
import { useSlate } from 'slate-react';

import { XrefTarget } from './domMutations';
import { insertXref, XrefRefType } from './inlineModel';

const XREF_GROUPS: Array<{ refType: XrefRefType; label: string }> = [
  { refType: 'fn', label: 'Notas' },
  { refType: 'bibr', label: 'Referências' },
  { refType: 'fig', label: 'Figuras' },
  { refType: 'table', label: 'Tabelas' },
];

interface XrefTargetSelectProps {
  targets: XrefTarget[];
  /** Optional editor override (defaults to `useSlate()`). */
  editor?: Editor;
  Select?: React.ComponentType<React.SelectHTMLAttributes<HTMLSelectElement>>;
}

export const XrefTargetSelect: React.FC<XrefTargetSelectProps> = ({
  targets,
  editor,
  Select = 'select',
}) => {
  const slateEditor = useSlate();
  const activeEditor = editor ?? slateEditor;

  if (targets.length === 0) {
    return null;
  }

  const grouped = XREF_GROUPS.map((group) => ({
    ...group,
    items: targets.filter((target) => target.refType === group.refType),
  })).filter((group) => group.items.length > 0);

  return (
    <Select
      defaultValue=""
      title="Inserir referência cruzada"
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const target = targets.find((t) => t.id === event.target.value);
        event.target.value = '';
        if (target) {
          insertXref(activeEditor, target.id, target.label, target.refType);
        }
      }}
    >
      <option value="" hidden>
        + Ref. cruzada
      </option>
      {grouped.map((group) => (
        <optgroup key={group.refType} label={group.label}>
          {group.items.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
};
