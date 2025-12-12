import styled from "styled-components";

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;       /* ✅ Ocupar toda la pantalla */
  overflow: hidden;    /* ✅ El scroll lo manejarán los hijos */
  background: ${({ theme }) => theme.colors.background || "#111827"};
  color: ${({ theme }) => theme.colors.text || "#f9fafb"};
`;
