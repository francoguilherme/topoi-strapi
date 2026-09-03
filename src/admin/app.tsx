import type { StrapiApp } from '@strapi/strapi/admin';
import type { ContentManagerPlugin } from '@strapi/content-manager/strapi-admin';

import { ArtigoXmlHeaderAction } from './extensions/artigo-xml/ArtigoXmlHeaderAction';
import { ARTIGO_XML_ROUTE_PATH } from './extensions/artigo-xml/constants';

export default {
  config: {
    locales: ['pt-BR'],
  },
  register(app: StrapiApp) {
    app.router.addRoute({
      path: ARTIGO_XML_ROUTE_PATH,
      lazy: async () => {
        const { ArtigoXmlPage } = await import('./extensions/artigo-xml/ArtigoXmlPage');
        return { Component: ArtigoXmlPage };
      },
    });
  },
  bootstrap(app: StrapiApp) {
    const cmApis = app.getPlugin('content-manager')
      .apis as ContentManagerPlugin['config']['apis'];
    cmApis.addDocumentHeaderAction([ArtigoXmlHeaderAction]);
  },
};
