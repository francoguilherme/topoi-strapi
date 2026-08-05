"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'POST',
            path: '/artigos/gerar-xml',
            handler: 'artigo.generateXML',
        },
    ],
};
