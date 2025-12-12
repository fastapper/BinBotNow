import React from "react";
import styled from "styled-components";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`;

const Caption = styled.label`
  justify-self: end;
  text-align: right;
  font-size: 0.85rem;
  color: #ccc;
`;

const Field = styled.input<{ disabled?: boolean }>`
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: #eee;
  text-align: left;
  font-size: 0.85rem;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent};
  }

  ${({ disabled }) =>
    disabled &&
    `
    opacity: 0.5;
    cursor: not-allowed;
  `}
`;

export const Input: React.FC<InputProps> = ({
  label,
  disabled,
  className,
  ...props
}) => {
  return (
    <Row>
      {label && <Caption>{label}</Caption>}
      <Field disabled={disabled} className={className} {...props} />
    </Row>
  );
};
