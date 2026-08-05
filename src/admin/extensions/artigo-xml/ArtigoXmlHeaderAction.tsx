import { useNavigate } from 'react-router-dom';
import { Code } from '@strapi/icons';
import type { HeaderActionComponent } from '@strapi/content-manager/strapi-admin';

import { ARTIGO_MODEL_UID, getArtigoXmlPath } from './constants';

export const ArtigoXmlHeaderAction: HeaderActionComponent = ({ model, documentId }) => {
  const navigate = useNavigate();

  if (model !== ARTIGO_MODEL_UID || !documentId) {
    return null;
  }

  return {
    label: 'Gerenciar XML',
    icon: <Code />,
    onClick: () => {
      navigate(getArtigoXmlPath(documentId));
    },
  };
};
