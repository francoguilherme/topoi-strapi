import * as React from 'react';

import { resolveFigureHref } from './jats/figureAssets';

/**
 * Disponibiliza para o renderizador e para os editores a tradução entre o
 * `xlink:href` guardado no XML (nome do arquivo no pacote SciELO) e a URL do
 * arquivo correspondente na Media Library.
 */
export const FigureAssetsContext = React.createContext<Map<string, string> | null>(null);

export const FigureAssetsProvider: React.FC<{
  imageMap: Map<string, string>;
  children: React.ReactNode;
}> = ({ imageMap, children }) => (
  <FigureAssetsContext.Provider value={imageMap}>{children}</FigureAssetsContext.Provider>
);

/**
 * Retorna uma função que resolve o href de uma figura. Fora do provider, os
 * hrefs são devolvidos sem alteração, mantendo o comportamento antigo.
 */
export const useFigureHrefResolver = (): ((href: string) => string) => {
  const imageMap = React.useContext(FigureAssetsContext);

  return React.useCallback(
    (href: string) => (imageMap ? resolveFigureHref(href, imageMap) : href),
    [imageMap]
  );
};
