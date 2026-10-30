import { Link, NavLink, Outlet } from "react-router-dom";
import { Container, Text } from "@mantine/core";
import "./layout.css";

const navItems = [
  { to: "/book", label: "Записаться" },
  { to: "/events", label: "Предстоящие события" },
];

export function Layout() {
  return (
    <div className="layout">
      <header className="layout-header">
        <Container size="lg" className="layout-header-content">
          <Link to="/" className="layout-brand">
            <span className="layout-brand-icon" aria-hidden="true">
              ▦
            </span>
            <Text fw={700}>Calendar</Text>
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
        </Container>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
