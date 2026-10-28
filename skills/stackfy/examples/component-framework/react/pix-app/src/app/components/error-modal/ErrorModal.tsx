import { useEffect, useRef } from 'react';
import './ErrorModal.css';

type ErrorModalProps = {
  title: string;
  message: string;
  onClose: () => void;
};

export const ErrorModal = ({ title, message, onClose }: ErrorModalProps) => {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-message"
      >
        <div className="modal-header">
          <h2 id="error-modal-title" className="modal-title">
            {title}
          </h2>
          <button
            ref={closeButton}
            className="close-button"
            aria-label="Fechar"
            onClick={onClose}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="modal-body">
          <p id="error-modal-message" className="modal-message">
            {message}
          </p>
        </div>
      </div>
    </>
  );
};
