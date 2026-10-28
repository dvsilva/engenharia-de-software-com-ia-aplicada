import { formatCurrency, formatDateTime } from '../formatters';
import './PixHistory.css';

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: 'received' | 'sent';
  date: string;
};

const transactions: Transaction[] = [
  {
    id: '1',
    title: 'Transferência Recebida',
    amount: 150.0,
    type: 'received',
    date: '2023-10-27T10:00:00Z',
  },
  {
    id: '2',
    title: 'Transferência Enviada',
    amount: 50.0,
    type: 'sent',
    date: '2023-10-26T15:30:00Z',
  },
  {
    id: '3',
    title: 'Transferência Recebida',
    amount: 300.5,
    type: 'received',
    date: '2023-10-25T09:15:00Z',
  },
];

export const PixHistory = () => (
  <div className="pix-history-list">
    {transactions.map((transaction) => {
      const received = transaction.type === 'received';

      return (
        <div className="transaction-item" key={transaction.id}>
          <div className="transaction-info">
            <span
              className={`material-symbols-outlined icon ${received ? 'icon-received' : 'icon-sent'}`}
            >
              {received ? 'arrow_downward' : 'arrow_upward'}
            </span>
            <div className="transaction-details">
              <span className="transaction-title">{transaction.title}</span>
              <span className="transaction-date">
                {formatDateTime(transaction.date)}
              </span>
            </div>
          </div>
          <span
            className={`transaction-amount ${received ? 'amount-received' : 'amount-sent'}`}
          >
            {received ? '+' : '-'} {formatCurrency(transaction.amount)}
          </span>
        </div>
      );
    })}
  </div>
);
