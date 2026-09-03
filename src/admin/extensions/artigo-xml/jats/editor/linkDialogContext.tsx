import * as React from 'react';

export interface LinkDialogTarget {
  type: 'link';
  href: string;
}

export interface LinkDialogContextValue {
  openInsertDialog: () => void;
  openEditDialog: (element: LinkDialogTarget) => void;
}

export const LinkDialogContext = React.createContext<LinkDialogContextValue | null>(null);

export const useLinkDialog = (): LinkDialogContextValue => {
  const context = React.useContext(LinkDialogContext);
  if (!context) {
    throw new Error('useLinkDialog must be used within a LinkDialogProvider');
  }
  return context;
};
