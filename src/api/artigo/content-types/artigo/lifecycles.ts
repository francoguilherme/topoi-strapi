const slugify = require('slugify');

export default {
    async beforeCreate(event) {
        const { data } = event.params;

        if (data.titulo && data.autores) {
            const autorIds = data.autores.connect?.map(a => a.id) || [];

            const autores = await strapi.entityService.findMany('api::autor.autor', {
                filters: { id: { $in: autorIds } },
                fields: ['nome'],
            });

            const nomes = autores.map(a => a.nome).join(' ');
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
            }) as {
                titulo?: string;
                autores?: { nome: string }[];
            };

            const titulo = data.titulo ?? artigoAtual.titulo;
            const autores = artigoAtual?.autores || [];

            const nomes = autores.map(a => a.nome).join(' ');
            const base = `${titulo} ${nomes}`;
            data.slug = slugify(base, { replacement: '_', strict: true});
        }
    },
};
