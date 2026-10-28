import type { EventDTO } from '@cfp-platform/shared-types';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { errorMessageOf, postJson } from '../http';
import './EventRegistration.css';

type RegistrationStatus = 'idle' | 'loading' | 'success' | 'error';

type Field = 'nome' | 'endereco' | 'capacidade' | 'data';

type EventForm = Record<Field, string>;

type Touched = Record<Field, boolean>;

type FieldDefinition = {
  name: Field;
  label: string;
  type: 'text' | 'number' | 'date';
  placeholder?: string;
  error: string;
};

const INITIAL_FORM: EventForm = {
  nome: '',
  endereco: '',
  capacidade: '0',
  data: '',
};

const UNTOUCHED: Touched = {
  nome: false,
  endereco: false,
  capacidade: false,
  data: false,
};

const ALL_TOUCHED: Touched = {
  nome: true,
  endereco: true,
  capacidade: true,
  data: true,
};

const FIELDS: FieldDefinition[] = [
  {
    name: 'nome',
    label: 'Nome do Local',
    type: 'text',
    placeholder: 'Ex: Centro de Convenções',
    error: 'O nome é obrigatório.',
  },
  {
    name: 'endereco',
    label: 'Endereço',
    type: 'text',
    placeholder: 'Ex: Av. Principal, 123',
    error: 'O endereço é obrigatório.',
  },
  {
    name: 'capacidade',
    label: 'Capacidade',
    type: 'number',
    placeholder: 'Ex: 500',
    error: 'Informe uma capacidade válida (mínimo 1).',
  },
  {
    name: 'data',
    label: 'Data do Evento',
    type: 'date',
    error: 'A data é obrigatória.',
  },
];

const parseNumber = (value: string) =>
  value === '' ? null : Number.parseFloat(value);

const isAtLeastOne = (value: string) => {
  const capacity = parseNumber(value);

  return capacity !== null && capacity >= 1;
};

const isValid: Record<Field, (form: EventForm) => boolean> = {
  nome: (form) => form.nome !== '',
  endereco: (form) => form.endereco !== '',
  capacidade: (form) => isAtLeastOne(form.capacidade),
  data: (form) => form.data !== '',
};

export const EventRegistration = () => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState(UNTOUCHED);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = registrationStatus === 'loading';
  const isFormValid = FIELDS.every(({ name }) => isValid[name](form));

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isFormValid || isLoading) {
      setTouched(ALL_TOUCHED);
      return;
    }

    setRegistrationStatus('loading');
    setErrorMessage(null);

    try {
      await postJson<EventDTO>('/api/events', {
        ...form,
        capacidade: parseNumber(form.capacidade),
      });

      setRegistrationStatus('success');
      setForm(INITIAL_FORM);
      setTouched(UNTOUCHED);
    } catch (error) {
      setRegistrationStatus('error');
      setErrorMessage(
        errorMessageOf(error) ??
          'Ocorreu um erro inesperado ao cadastrar o evento.'
      );
    }
  };

  return (
    <div className="cfp-container event-registration">
      <section className="glass-card">
        <h1 id="event-title">Cadastro de Local do Evento</h1>
        <p className="subtitle">Registre um novo local para a conferência.</p>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby="event-title"
          className="cfp-form"
        >
          {FIELDS.map(({ name, label, type, placeholder, error }) => (
            <div className="form-group" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                type={type}
                id={name}
                name={name}
                value={form[name]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))
                }
                onBlur={() =>
                  setTouched((current) => ({ ...current, [name]: true }))
                }
                required
                aria-required="true"
                placeholder={placeholder}
              />
              {touched[name] && !isValid[name](form) && (
                <span className="error-text">{error}</span>
              )}
            </div>
          ))}

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? (
                <span className="spinner">Cadastrando...</span>
              ) : (
                <span>Cadastrar Evento</span>
              )}
            </button>

            <Link to="/dashboard" className="dashboard-link">
              Ver Dashboard
            </Link>
          </div>

          <div role="alert" aria-live="polite" className="feedback">
            {registrationStatus === 'success' && (
              <p className="success-msg">✓ Evento cadastrado com sucesso!</p>
            )}
            {registrationStatus === 'error' && (
              <p className="error-msg">⚠ {errorMessage}</p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
