import styled, { css } from 'styled-components'

export type Variant = 'primary' | 'danger' | 'ghost'

export const Button = styled.button<{
  $variant?: Variant
  $small?: boolean
  $block?: boolean
  $bold?: boolean
}>`
  border: 1px solid transparent;
  background: ${({theme, $variant}) =>
    $variant === 'danger' ? theme.colors.danger :
    $variant === 'ghost' ? 'transparent' :
    theme.colors.primary};
  color: ${({$variant}) => $variant === 'ghost' ? 'inherit' : '#0b1220'};
  padding: ${({$small}) => $small ? '8px 12px' : '12px 16px'};
  border-radius: ${({theme}) => theme.radii.sm};
  cursor: pointer;
  transition: transform .06s ease, filter .2s ease, background .2s;
  ${({$block}) => $block && css`width: 100%;`}
  font-weight: ${({$variant, $bold}) => ($bold || $variant === 'danger') ? 900 : 700};
  font-size: 12px;
  &:hover { filter: brightness(1.05); }
  &:active { transform: translateY(1px); }
`
