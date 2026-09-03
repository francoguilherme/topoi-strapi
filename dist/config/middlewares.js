"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = [
    'strapi::logger',
    'strapi::errors',
    {
        name: 'strapi::security',
        config: {
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    'connect-src': ["'self'", 'https:'],
                    // Allow remote figure/graphic URLs (e.g. S3) in the admin JATS preview/editor.
                    'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'https:'],
                    'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'https:'],
                    upgradeInsecureRequests: null,
                },
            },
        },
    },
    'strapi::cors',
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
];
