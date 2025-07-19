import type { Schema, Struct } from '@strapi/strapi';

export interface SimplesEditorial extends Struct.ComponentSchema {
  collectionName: 'components_simples_editorials';
  info: {
    displayName: 'editorial';
    icon: 'pencil';
  };
  attributes: {
    arquivo: Schema.Attribute.Media<'files', true>;
    texto: Schema.Attribute.Blocks;
    titulo: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SimplesPagina extends Struct.ComponentSchema {
  collectionName: 'components_simples_paginas';
  info: {
    displayName: 'pagina';
    icon: 'layout';
  };
  attributes: {
    mostrar_titulo: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    slug: Schema.Attribute.String & Schema.Attribute.Required;
    titulo: Schema.Attribute.String & Schema.Attribute.Required;
    titulo_curto: Schema.Attribute.String;
  };
}

export interface SimplesTexto extends Struct.ComponentSchema {
  collectionName: 'components_simples_textos';
  info: {
    displayName: 'texto';
    icon: 'italic';
  };
  attributes: {
    texto: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'simples.editorial': SimplesEditorial;
      'simples.pagina': SimplesPagina;
      'simples.texto': SimplesTexto;
    }
  }
}
