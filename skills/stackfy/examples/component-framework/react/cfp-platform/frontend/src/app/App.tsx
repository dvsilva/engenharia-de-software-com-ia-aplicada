import { NavLink, Outlet } from 'react-router';
import './App.css';

export const App = () => (
  <>
    <nav className="main-nav">
      <ul>
        <li>
          <NavLink to="/event/new">Cadastro de Evento</NavLink>
        </li>
        <li>
          <NavLink to="/talks/new">Cadastro de Palestra</NavLink>
        </li>
        <li>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </li>
      </ul>
    </nav>

    <Outlet />
  </>
);
