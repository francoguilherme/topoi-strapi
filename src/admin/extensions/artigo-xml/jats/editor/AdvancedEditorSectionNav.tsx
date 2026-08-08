import * as React from 'react';
import styled from 'styled-components';

import { useArtigoXmlNavigation } from '../../ArtigoXmlNavigationContext';
import { ADVANCED_EDITOR_SECTION, type AdvancedEditorSection } from './advancedEditorSections';

const SECTIONS: Array<{ id: AdvancedEditorSection; label: string }> = [
  { id: ADVANCED_EDITOR_SECTION.body, label: 'Corpo' },
  { id: ADVANCED_EDITOR_SECTION.notes, label: 'Notas' },
  { id: ADVANCED_EDITOR_SECTION.references, label: 'Referências' },
];

/** Section jump controls for the advanced editor — shown beside view-mode tabs, not as tabs. */
export const AdvancedEditorSectionNav: React.FC = () => {
  const navigation = useArtigoXmlNavigation();

  return (
    <NavGroup aria-label="Ir para seção do editor">
      <NavLabel>Ir para</NavLabel>
      {SECTIONS.map(({ id, label }, index) => (
        <React.Fragment key={id}>
          {index > 0 && <NavDivider aria-hidden>|</NavDivider>}
          <NavButton type="button" onClick={() => navigation?.scrollToSection(id)}>
            {label}
          </NavButton>
        </React.Fragment>
      ))}
    </NavGroup>
  );
};

const NavGroup = styled.nav`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 6px 12px;
  border: 1px dashed #c0c0cf;
  border-radius: 6px;
  background: #f6f6f9;
`;

const NavLabel = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8e8ea9;
  margin-right: 6px;
  user-select: none;
`;

const NavDivider = styled.span`
  font-size: 0.8125rem;
  color: #c0c0cf;
  user-select: none;
`;

const NavButton = styled.button`
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #4945ff;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
  padding: 5px 8px;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;

  &:hover {
    background: #ececff;
    text-decoration-style: solid;
  }
`;
