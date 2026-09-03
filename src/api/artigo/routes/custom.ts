export default {
    routes: [
        {
            method: 'POST',
            path: '/artigos/gerar-xml',
            handler: 'artigo.generateXML',
        },
        // Downloads canônicos por slug, abertos para indexação (Redalyc e afins).
        // `auth: false` porque as permissões da role Public vivem só no banco, e
        // um deploy com banco novo deixaria a indexação quebrada.
        {
            method: 'GET',
            path: '/artigos/:slug/xml',
            handler: 'artigo-publico.xml',
            config: { auth: false },
        },
        {
            method: 'GET',
            path: '/artigos/:slug/pacote-xml',
            handler: 'artigo-publico.pacoteXml',
            config: { auth: false },
        },
        {
            method: 'GET',
            path: '/artigos/:slug/pdf',
            handler: 'artigo-publico.pdf',
            config: { auth: false },
        },
    ],
};
