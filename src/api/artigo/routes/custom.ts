export default {
    routes: [
        {
            method: 'POST',
            path: '/artigos/gerar-xml',
            handler: 'artigo.generateXML',
        },
    ],
};