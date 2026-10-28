import { Navigate, type RouteObject } from 'react-router';
import { App } from './App';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'event/new',
        lazy: () =>
          import('./event-registration/EventRegistration').then((module) => ({
            Component: module.EventRegistration,
          })),
      },
      {
        path: 'talks/new',
        lazy: () =>
          import('./cfp-submission/CfpSubmission').then((module) => ({
            Component: module.CfpSubmission,
          })),
      },
      {
        path: 'dashboard',
        lazy: () =>
          import('./cfp-dashboard/CfpDashboard').then((module) => ({
            Component: module.CfpDashboard,
          })),
      },
    ],
  },
];
