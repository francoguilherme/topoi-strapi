"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const slugify = require('slugify');
exports.default = {
    async beforeCreate(event) {
        var _a;
        const { data } = event.params;
        let nomes = "";
        if (data.autores) {
            const autorIds = ((_a = data.autores.connect) === null || _a === void 0 ? void 0 : _a.map(a => a.id)) || [];
            const autores = await strapi.entityService.findMany('api::autor.autor', {
                filters: { id: { $in: autorIds } },
                fields: ['nome'],
            });
            nomes = autores.map(a => a.nome).filter(Boolean).join(' ');
        }
        if (data.titulo) {
            const base = `${data.titulo} ${nomes}`;
            data.slug = slugify(base, { replacement: '_', strict: true }).slice(0, 250);
        }
    },
    async beforeUpdate(event) {
        var _a, _b;
        const { data, where } = event.params;
        const artigoId = where.id;
        // Se mudou título ou autores, gere novo slug
        if (data.titulo || data.autores) {
            // Buscar dados atuais do artigo
            const artigoAtual = await strapi.entityService.findOne('api::artigo.artigo', artigoId, {
                populate: ['autores'],
                fields: ['titulo'],
            });
            // Get the current list of author IDs
            let finalAutoresIds = ((_a = artigoAtual.autores) === null || _a === void 0 ? void 0 : _a.map(a => a.id)) || [];
            // --- 3. Apply the 'connect' and 'disconnect' instructions (if authors are changing) ---
            if (data.autores) {
                const { connect = [], disconnect = [] } = data.autores;
                // a. Add new authors (Connect instructions)
                const connectIds = connect.map(c => c.id);
                // Combine and remove duplicates (using Set)
                finalAutoresIds = [...new Set([...finalAutoresIds, ...connectIds])];
                // b. Remove authors (Disconnect instructions)
                const disconnectIds = disconnect.map(d => d.id);
                finalAutoresIds = finalAutoresIds.filter(id => !disconnectIds.includes(id));
            }
            const titulo = (_b = data.titulo) !== null && _b !== void 0 ? _b : artigoAtual.titulo;
            const autores = await strapi.entityService.findMany('api::autor.autor', {
                filters: { id: { $in: finalAutoresIds } },
                fields: ['nome'],
            });
            const nomes = autores.map(a => a.nome).filter(Boolean).join(' ');
            const base = `${titulo} ${nomes}`;
            data.slug = slugify(base, { replacement: '_', strict: true }).slice(0, 250);
        }
    },
};
