import { Navigate, type RouteObject } from 'react-router';
import { App } from './App';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/pix" replace /> },
      {
        path: 'pix',
        lazy: () =>
          import('./pix-transfer/PixTransfer').then((module) => ({
            Component: module.PixTransfer,
          })),
      },
      {
        path: 'extrato',
        lazy: () =>
          import('./pix-history/PixHistory').then((module) => ({
            Component: module.PixHistory,
          })),
      },
    ],
  },
];
