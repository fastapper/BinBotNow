import styled from 'styled-components'

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

export const StatBox = styled.div<{$accent?: 'green'|'red'|'blue'|'amber'}>`
  background: ${({theme}) => theme.colors.panel};
  border: 1px solid ${({theme}) => theme.colors.border};
  border-radius: ${({theme}) => theme.radii.sm};
  padding: 12px 14px;
  small{ color: ${({theme}) => theme.colors.textSoft}; }
  strong{ display:block; margin-top: 6px; font-size: 1.1rem; }
  ${({$accent, theme}) => $accent === 'green' && `box-shadow: inset 0 0 0 1px ${theme.colors.success}33;`}
  ${({$accent, theme}) => $accent === 'red' && `box-shadow: inset 0 0 0 1px ${theme.colors.danger}33;`}
  ${({$accent, theme}) => $accent === 'blue' && `box-shadow: inset 0 0 0 1px ${theme.colors.primary}33;`}
  ${({$accent, theme}) => $accent === 'amber' && `box-shadow: inset 0 0 0 1px ${theme.colors.warning}33;`}
`
