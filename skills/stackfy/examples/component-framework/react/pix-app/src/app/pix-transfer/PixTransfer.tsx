import { useState, type SubmitEvent } from 'react';
import { ErrorModal } from '../components/error-modal/ErrorModal';
import { PixReceipt } from '../pix-receipt/PixReceipt';
import './PixTransfer.css';

type TransferReceipt = { nome: string; valor: number };

const TRANSFER_LIMIT = 5000;

const parseAmount = (value: string) =>
  value === '' ? null : Number.parseFloat(value);

export const PixTransfer = () => {
  const [pixKey, setPixKey] = useState('');
  const [transferAmount, setTransferAmount] = useState<number | null>(null);
  const [schedulingDate, setSchedulingDate] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [transferReceiptData, setTransferReceiptData] =
    useState<TransferReceipt | null>(null);

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const amount = transferAmount || 0;

    if (amount > TRANSFER_LIMIT) {
      setShowErrorModal(true);
      return;
    }

    setTransferReceiptData({ nome: pixKey, valor: amount });
  };

  return (
    <>
      {transferReceiptData ? (
        <PixReceipt
          nome={transferReceiptData.nome}
          valor={transferReceiptData.valor}
        />
      ) : (
        <section className="pix-transfer">
          <h2>Transferência Pix</h2>
          <form noValidate onSubmit={onSubmit}>
            <div>
              <label htmlFor="pixKey">Chave Pix</label>
              <input
                type="text"
                id="pixKey"
                name="pixKey"
                value={pixKey}
                onChange={(event) => setPixKey(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="transferAmount">Valor da Transferência</label>
              <input
                type="number"
                id="transferAmount"
                name="transferAmount"
                value={transferAmount ?? ''}
                onChange={(event) =>
                  setTransferAmount(parseAmount(event.target.value))
                }
                required
              />
            </div>

            <div>
              <label htmlFor="schedulingDate">Data de Agendamento</label>
              <input
                type="date"
                id="schedulingDate"
                name="schedulingDate"
                value={schedulingDate}
                onChange={(event) => setSchedulingDate(event.target.value)}
                required
              />
            </div>

            <button type="submit">Confirmar</button>
          </form>
        </section>
      )}

      {showErrorModal && (
        <ErrorModal
          title="Limite Excedido"
          message="Para sua segurança, transferências Pix acima de R$ 5.000,00 precisam ser aprovadas pelo seu gerente."
          onClose={() => setShowErrorModal(false)}
        />
      )}
    </>
  );
};
