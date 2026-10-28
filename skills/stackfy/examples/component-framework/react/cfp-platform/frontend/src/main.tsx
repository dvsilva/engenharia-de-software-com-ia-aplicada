import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/router';

const root = document.getElementById('root');

if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(<RouterProvider router={router} />);
