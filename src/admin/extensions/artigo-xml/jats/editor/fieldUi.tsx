import * as React from 'react';
import { Box, Field, Flex, IconButton, TextInput, Typography } from '@strapi/design-system';
import { ArrowDown, ArrowUp, Plus, Trash } from '@strapi/icons';
import styled from 'styled-components';

/** Card-like container with a small heading, used to group a subsection of a form. */
export const FieldGroup: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <Box background="neutral100" hasRadius borderColor="neutral200" padding={4}>
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Box>
        <Typography variant="delta" tag="h3">
          {title}
        </Typography>
        {hint && (
          <Typography variant="pi" textColor="neutral600">
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Flex>
  </Box>
);

/**
 * Keeps a local, always-up-to-date copy of a controlled value.
 *
 * These fields are backed by live JATS DOM text (e.g. `el.textContent`) rather than React
 * state: `onChange` only mutates the DOM and doesn't re-render until `onBlur` commits the
 * whole document. If the `<input>` were controlled directly by that prop, React would reset
 * every keystroke back to the stale prop value (nothing changed to justify a new one), so
 * typing would appear to do nothing until blur. Local state avoids that fight while still
 * re-syncing if the external value changes for some other reason (e.g. switching elements).
 */
const useLocalValue = (value: string, onChange: (value: string) => void) => {
  const [localValue, setLocalValue] = React.useState(value);
  const previousValue = React.useRef(value);

  if (previousValue.current !== value) {
    previousValue.current = value;
    setLocalValue(value);
  }

  const handleChange = (next: string) => {
    setLocalValue(next);
    onChange(next);
  };

  return [localValue, handleChange] as const;
};

/** Small labeled text input, wrapping the design-system `Field` primitives. */
export const LabeledInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  width?: string;
}> = ({ label, value, onChange, onBlur, placeholder, width }) => {
  const [localValue, handleChange] = useLocalValue(value, onChange);

  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Box width={width}>
        <TextInput
          aria-label={label}
          value={localValue}
          placeholder={placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
          onBlur={onBlur}
        />
      </Box>
    </Field.Root>
  );
};

/** Bare, unlabeled text input — used where a visible label would be redundant (e.g. table cells). */
export const PlainTextField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
  placeholder?: string;
}> = ({ value, onChange, onBlur, ariaLabel, placeholder }) => {
  const [localValue, handleChange] = useLocalValue(value, onChange);

  return (
    <TextInput
      aria-label={ariaLabel}
      size="S"
      value={localValue}
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
      onBlur={onBlur}
    />
  );
};

/** Toolbar with reorder/remove buttons for an item inside an editable list. */
export const ItemToolbar: React.FC<{
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}> = ({ onMoveUp, onMoveDown, onRemove, removeLabel = 'Remover' }) => (
  <Flex gap={1}>
    {onMoveUp && (
      <IconButton label="Mover para cima" onClick={onMoveUp}>
        <ArrowUp />
      </IconButton>
    )}
    {onMoveDown && (
      <IconButton label="Mover para baixo" onClick={onMoveDown}>
        <ArrowDown />
      </IconButton>
    )}
    {onRemove && (
      <IconButton label={removeLabel} onClick={onRemove}>
        <Trash />
      </IconButton>
    )}
  </Flex>
);

export const AddButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <AddButtonRoot type="button" onClick={onClick}>
    <Plus width="0.75rem" height="0.75rem" />
    {label}
  </AddButtonRoot>
);

const AddButtonRoot = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  border: 1px dashed #dcdce4;
  border-radius: 4px;
  background: transparent;
  color: #4945ff;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;

  &:hover {
    background: #f0f0ff;
  }
`;

/** Thin card wrapping a single item of an editable list (author, affiliation, reference...). */
export const ItemCard = styled.div`
  border: 1px solid #eaeaef;
  border-radius: 4px;
  padding: 12px;
  background: #fff;
`;
