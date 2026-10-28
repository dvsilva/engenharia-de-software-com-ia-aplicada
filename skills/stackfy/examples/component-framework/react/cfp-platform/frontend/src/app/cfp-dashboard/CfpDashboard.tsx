import type { SpeakerDTO } from '@cfp-platform/shared-types';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { requestJson } from '../http';
import './CfpDashboard.css';

type SubmissionsProps = {
  isLoading: boolean;
  error: string | null;
  submissions: SpeakerDTO[];
  onRetry: () => void;
};

const Submissions = ({
  isLoading,
  error,
  submissions,
  onRetry,
}: SubmissionsProps) => {
  if (isLoading)
    return (
      <div className="status-box" role="status" aria-busy="true">
        <p>Loading submissions...</p>
      </div>
    );

  if (error)
    return (
      <div className="status-box error" role="alert">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );

  if (submissions.length === 0)
    return (
      <div className="status-box">
        <p>No submissions found. Be the first to submit a talk!</p>
        <Link to="/talks/new" className="btn btn-primary">
          Submit a Talk
        </Link>
      </div>
    );

  return (
    <>
      <div
        className="table-container"
        role="region"
        aria-label="Submitted talks"
      >
        <table className="glass-table">
          <thead>
            <tr>
              <th scope="col">Speaker Name</th>
              <th scope="col">Email</th>
              <th scope="col">Talk Title</th>
              <th scope="col">GDE Status</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((speaker) => (
              <tr key={speaker.id}>
                <td>{speaker.name}</td>
                <td>{speaker.email}</td>
                <td>{speaker.talkTitle}</td>
                <td>
                  {speaker.isGDE ? (
                    <span className="badge badge-gde">GDE</span>
                  ) : (
                    <span className="badge">Speaker</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <Link to="/talks/new" className="btn btn-secondary">
          Back to Submission
        </Link>
      </div>
    </>
  );
};

export const CfpDashboard = () => {
  const [submissions, setSubmissions] = useState<SpeakerDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpeakers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      setSubmissions(await requestJson<SpeakerDTO[]>('/api/speakers'));
    } catch (failure) {
      console.error('Error fetching speakers:', failure);
      setError('Failed to load submissions. Please try again later.');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchSpeakers();
  }, []);

  return (
    <div className="cfp-container cfp-dashboard">
      <div className="glass-card">
        <header className="header">
          <h1 className="title">CFP Dashboard</h1>
          <p className="subtitle">
            Review all submitted talks and speaker details.
          </p>
        </header>

        <Submissions
          isLoading={isLoading}
          error={error}
          submissions={submissions}
          onRetry={fetchSpeakers}
        />
      </div>
    </div>
  );
};
