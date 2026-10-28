import { formatCurrency } from '../formatters';
import './PixReceipt.css';

type PixReceiptProps = { nome: string; valor: number };

export const PixReceipt = ({ nome, valor }: PixReceiptProps) => (
  <main className="receipt-container">
    <div className="receipt-card">
      <div className="receipt-header">
        <div className="success-icon">
          <span className="material-symbols-outlined check-icon">
            check_circle
          </span>
        </div>
        <h1 className="receipt-title">Transferência Realizada</h1>
        <p className="receipt-amount">{formatCurrency(valor)}</p>
        <div className="divider"></div>

        <div className="details-section">
          <div className="detail-row">
            <span className="detail-label">Destinatário</span>
            <span className="detail-value highlight">{nome}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Data e Hora</span>
            <div className="detail-time">
              <span className="detail-value block">24 de Maio, 2024</span>
              <span className="detail-subvalue">14:30:45</span>
            </div>
          </div>
          <div className="detail-row">
            <span className="detail-label">Instituição</span>
            <span className="detail-value block">Banco Neon</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">ID da Transação</span>
            <span className="detail-value mono">PIX9823749823BCN9283</span>
          </div>
        </div>
      </div>

      <div className="actions-grid">
        <button className="action-btn">
          <span className="material-symbols-outlined action-icon">share</span>
          <span className="action-label">Compartilhar</span>
        </button>
        <button className="action-btn">
          <span className="material-symbols-outlined action-icon">
            file_download
          </span>
          <span className="action-label">Baixar PDF</span>
        </button>
        <button className="action-btn">
          <span className="material-symbols-outlined action-icon">print</span>
          <span className="action-label">Imprimir</span>
        </button>
      </div>

      <div className="footer-actions">
        <button className="primary-btn">
          <span className="material-symbols-outlined">home</span>
          Voltar ao Início
        </button>
        <button className="secondary-btn">Fazer nova transferência</button>
      </div>
    </div>
  </main>
);
