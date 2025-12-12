// dashboard-react/src/components/common/Card.tsx
import styled from 'styled-components'
export const Card = styled.div`
  background: ${({theme}) => theme.colors.panel};
  border: 1px solid ${({theme}) => theme.colors.border};
  border-radius: ${({theme}) => theme.radii.md};
  box-shadow: ${({theme}) => theme.shadow.soft};
`
export const CardHeader = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid ${({theme}) => theme.colors.border};
  font-weight: 600;
  letter-spacing: .4px;
`
export const CardBody = styled.div`
  padding: 16px;
`

export const TokenCard = styled.div`
  background: ${({ theme }) => theme.colors.panelAlt};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xs};
  padding: 8px 8px;
  display: grid;
  grid-template-rows: auto auto;
  row-gap: 4px;
  .line1 {
    color: ${({ theme }) => theme.colors.textSoft};
    display: flex;
    justify-content: space-between;
  }
  .line2 {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ops {
    font-size: 0.85rem;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`