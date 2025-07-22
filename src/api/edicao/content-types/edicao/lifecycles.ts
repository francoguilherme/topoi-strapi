export default {
    beforeCreate(event) {
        const { params } = event;
        const data = params.data;

        if (data.volume && data.numero) {
            data.titulo_composto = `nº ${data.numero} / V. ${data.volume}`;
        } else if (data.volume) {
            data.titulo_composto = `V. ${data.volume}`;
        } else if (data.numero) {
            data.titulo_composto = `nº ${data.numero}`;
        }
    },

    beforeUpdate(event) {
        const { params } = event;
        const data = params.data;

        if ('volume' in data || 'numero' in data) {
            const volume = data.volume ?? event.params.data.volume;
            const numero = data.numero ?? event.params.data.numero;

            if (volume && numero) {
                data.titulo_composto = `nº ${data.numero} / V. ${data.volume}`;
            } else if (volume) {
                data.titulo_composto = `V. ${data.volume}`;
            } else if (numero) {
                data.titulo_composto = `nº ${data.numero}`;
            }
        }
    },
};
