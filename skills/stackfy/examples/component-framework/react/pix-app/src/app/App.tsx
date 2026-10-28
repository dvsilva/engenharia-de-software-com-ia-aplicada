import { Link, Outlet } from 'react-router';
import './App.css';

export const App = () => (
  <div className="app">
    <aside>
      <nav>
        <ul>
          <li>
            <Link to="/pix">Pix</Link>
          </li>
          <li>
            <Link to="/extrato">Extrato</Link>
          </li>
        </ul>
      </nav>
    </aside>

    <main>
      <Outlet />
    </main>
  </div>
);
