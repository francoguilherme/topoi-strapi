export const ADVANCED_EDITOR_SECTION = {
  body: 'body',
  notes: 'notes',
  references: 'references',
} as const;

export type AdvancedEditorSection = (typeof ADVANCED_EDITOR_SECTION)[keyof typeof ADVANCED_EDITOR_SECTION];

export const advancedEditorSectionSelector = (section: AdvancedEditorSection): string =>
  `[data-advanced-editor-section="${section}"]`;

/** Offset so section headings aren't flush against the viewport edge when jumping. */
export const ADVANCED_EDITOR_SECTION_NAV_OFFSET = 12;
