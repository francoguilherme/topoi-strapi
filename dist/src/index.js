"use strict";
// import type { Core } from '@strapi/strapi';
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rotas da tela "Gerenciar XML" do admin.
 *
 * Ficam aqui, e não em `src/api/artigo/routes`, porque o loader marca todas as
 * rotas de `src/api` como `content-api` — elas rejeitariam o JWT do admin.
 * Registrando com `type: 'admin'` a autenticação passa a ser a mesma do painel.
 */
const artigoXmlRoutes = {
    type: 'admin',
    prefix: '/artigo-xml',
    routes: [
        {
            method: 'POST',
            path: '/:documentId/xml',
            handler: 'artigo-xml.uploadXml',
            info: { apiName: 'artigo' },
        },
        {
            method: 'POST',
            path: '/:documentId/imagens',
            handler: 'artigo-xml.uploadImagens',
            info: { apiName: 'artigo' },
        },
        {
            method: 'POST',
            path: '/:documentId/organizar',
            handler: 'artigo-xml.organizar',
            info: { apiName: 'artigo' },
        },
        {
            method: 'GET',
            path: '/:documentId/pacote',
            handler: 'artigo-xml.pacote',
            info: { apiName: 'artigo' },
        },
    ],
};
exports.default = {
    /**
     * An asynchronous register function that runs before
     * your application is initialized.
     *
     * This gives you an opportunity to extend code.
     */
    register({ strapi }) {
        strapi.server.routes(artigoXmlRoutes);
    },
    /**
     * An asynchronous bootstrap function that runs before
     * your application gets started.
     *
     * This gives you an opportunity to set up your data model,
     * run jobs, or perform some special logic.
     */
    bootstrap( /* { strapi }: { strapi: Core.Strapi } */) { },
};
