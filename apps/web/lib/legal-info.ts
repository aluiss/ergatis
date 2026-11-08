/**
 * Dados da empresa exibidos nos documentos legais. Preencha antes do lançamento:
 * enquanto houver `null`, as páginas exibem um aviso de minuta.
 */
export const LEGAL_INFO = {
  entity: null as string | null, // razão social
  document: null as string | null, // CNPJ
  address: null as string | null,
  contactEmail: null as string | null,
  dpoName: null as string | null, // encarregado de dados (LGPD)
  infrastructure: null as string | null, // provedores de hospedagem e e-mail
};

export const isLegalInfoComplete = Object.values(LEGAL_INFO).every(Boolean);
export const fill = (value: string | null, label: string) => value ?? `[PREENCHER: ${label}]`;
