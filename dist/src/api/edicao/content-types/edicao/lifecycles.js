"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    beforeCreate(event) {
        const { params } = event;
        const data = params.data;
        if (data.volume && data.numero) {
            data.titulo_composto = `nº ${data.numero} / V. ${data.volume}`;
        }
        else if (data.volume) {
            data.titulo_composto = `V. ${data.volume}`;
        }
        else if (data.numero) {
            data.titulo_composto = `nº ${data.numero}`;
        }
    },
    beforeUpdate(event) {
        var _a, _b;
        const { params } = event;
        const data = params.data;
        if ('volume' in data || 'numero' in data) {
            const volume = (_a = data.volume) !== null && _a !== void 0 ? _a : event.params.data.volume;
            const numero = (_b = data.numero) !== null && _b !== void 0 ? _b : event.params.data.numero;
            if (volume && numero) {
                data.titulo_composto = `nº ${data.numero} / V. ${data.volume}`;
            }
            else if (volume) {
                data.titulo_composto = `V. ${data.volume}`;
            }
            else if (numero) {
                data.titulo_composto = `nº ${data.numero}`;
            }
        }
    },
};
