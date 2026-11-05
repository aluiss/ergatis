export const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const date = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto', hired: 'Contratado', completed: 'Concluído', cancelled: 'Cancelado',
  sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada',
  active: 'Ativo', pending: 'Pendente', past_due: 'Em atraso',
  reviewing: 'Em análise', resolved: 'Resolvida', dismissed: 'Arquivada',
};
