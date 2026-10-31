import { Link, NavLink, Outlet } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import "./layout.css";

const navItems = [
  { to: "/book", label: "Записаться" },
  { to: "/events", label: "Предстоящие события" },
];

export function Layout() {
  return (
    <div className="layout">
      <header className="layout-header">
        <div className="container layout-header-content">
          <Link to="/" className="layout-brand">
            <CalendarClock size={20} strokeWidth={2} className="layout-brand-icon" aria-hidden />
            <span className="layout-brand-name">Calendar</span>
          </Link>
          <nav className="layout-nav" aria-label="Основная навигация">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `layout-nav-link${isActive ? " is-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
