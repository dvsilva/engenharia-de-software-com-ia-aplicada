import type { SpeakerDTO } from '@cfp-platform/shared-types';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { errorMessageOf, postJson } from '../http';
import './CfpSubmission.css';

type SubmissionStatus = 'idle' | 'loading' | 'success' | 'error';

export const CfpSubmission = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [talkTitle, setTalkTitle] = useState('');
  const [isGDE, setIsGDE] = useState(false);
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = submissionStatus === 'loading';

  const resetForm = () => {
    setName('');
    setEmail('');
    setTalkTitle('');
    setIsGDE(false);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isLoading) return;

    setSubmissionStatus('loading');
    setErrorMessage(null);

    const payload: Omit<SpeakerDTO, 'id'> = { name, email, talkTitle, isGDE };

    try {
      await postJson<SpeakerDTO>('/api/speakers', payload);

      setSubmissionStatus('success');
      resetForm();
    } catch (error) {
      setSubmissionStatus('error');
      setErrorMessage(errorMessageOf(error) ?? 'An unexpected error occurred.');
    }
  };

  return (
    <div className="cfp-container cfp-submission">
      <section className="glass-card">
        <h1 id="cfp-title">Call for Papers</h1>
        <p className="subtitle">
          Submit your proposal for our upcoming conference.
        </p>

        <form
          noValidate
          onSubmit={submit}
          aria-labelledby="cfp-title"
          className="cfp-form"
        >
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              aria-required="true"
              placeholder="Juan Pérez"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              aria-required="true"
              placeholder="juan@example.com"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="talkTitle">Talk Title</label>
            <input
              type="text"
              id="talkTitle"
              name="talkTitle"
              value={talkTitle}
              onChange={(event) => setTalkTitle(event.target.value)}
              required
              aria-required="true"
              placeholder="Angular Signals in Practice"
              disabled={isLoading}
            />
          </div>

          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="isGDE"
              name="isGDE"
              checked={isGDE}
              onChange={(event) => setIsGDE(event.target.checked)}
              disabled={isLoading}
            />
            <label htmlFor="isGDE">
              Are you a Google Developer Expert (GDE)?
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? (
                <span className="spinner">Submitting...</span>
              ) : (
                <span>Submit Proposal</span>
              )}
            </button>

            <Link to="/dashboard" className="dashboard-link">
              View Dashboard
            </Link>
          </div>

          <div role="alert" aria-live="polite" className="feedback">
            {submissionStatus === 'success' && (
              <p className="success-msg">✓ Proposal submitted successfully!</p>
            )}
            {submissionStatus === 'error' && (
              <p className="error-msg">⚠ {errorMessage}</p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
