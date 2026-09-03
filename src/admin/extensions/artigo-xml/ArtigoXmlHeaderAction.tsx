import { useNavigate } from 'react-router-dom';
import { Flex, Typography } from '@strapi/design-system';
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
    icon: (
      <Flex tag="span" gap={1} alignItems="center">
        <Code />
        <Typography tag="span" variant="pi">
          XML
        </Typography>
      </Flex>
    ),
    onClick: () => {
      navigate(getArtigoXmlPath(documentId));
    },
  };
};
