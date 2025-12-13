const slugify = require('slugify');

export default {
    async beforeCreate(event) {
        const { data } = event.params;
    
        let nomes = "";
        if (data.autores) {
            const autorIds = data.autores.connect?.map(a => a.id) || [];
            const autores = await strapi.entityService.findMany('api::autor.autor', {
                filters: { id: { $in: autorIds } },
                fields: ['nome'],
            });
            nomes = autores.map(a => a.nome).filter(Boolean).join(' ');
        }

        if (data.titulo) {
            const base = `${data.titulo} ${nomes}`;
            data.slug = slugify(base, { replacement: '_', strict: true });
        }
    },

    async beforeUpdate(event) {
        const { data, where } = event.params;

        const artigoId = where.id;

        // Se mudou título ou autores, gere novo slug
        if (data.titulo || data.autores) {
            // Buscar dados atuais do artigo
            const artigoAtual = await strapi.entityService.findOne('api::artigo.artigo', artigoId, {
                populate: ['autores'],
                fields: ['titulo'],
            }) as any;

            // Get the current list of author IDs
            let finalAutoresIds = artigoAtual.autores?.map(a => a.id) || [];

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

            const titulo = data.titulo ?? artigoAtual.titulo;
            const autores = await strapi.entityService.findMany('api::autor.autor', {
                filters: { id: { $in: finalAutoresIds } },
                fields: ['nome'],
            });

            const nomes = autores.map(a => a.nome).filter(Boolean).join(' ');
            const base = `${titulo} ${nomes}`;
            data.slug = slugify(base, { replacement: '_', strict: true});
        }
    },
};
