const slugify = require('slugify');

export default {
    async beforeCreate(event) {
        const { data } = event.params;

        if (data.nome) {
            data.slug = slugify(data.nome, { replacement: '_', strict: true });
        }
    },

    async beforeUpdate(event) {
        const { data } = event.params;

        if (data.nome) {
            data.slug = slugify(data.nome, { replacement: '_', strict: true });
        }
    },
};
