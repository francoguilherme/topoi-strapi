import * as React from 'react';

import type { AdvancedEditorSection } from './jats/editor/advancedEditorSections';

export interface ArtigoXmlNavigation {
  scrollToRid: (rid: string) => void;
  scrollToSection: (section: AdvancedEditorSection) => void;
}

export const ArtigoXmlNavigationContext = React.createContext<ArtigoXmlNavigation | null>(null);

export const useArtigoXmlNavigation = (): ArtigoXmlNavigation | null =>
  React.useContext(ArtigoXmlNavigationContext);
