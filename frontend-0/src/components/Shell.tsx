import { NavLink, Outlet } from "react-router-dom";
import { CATALOG } from "../catalog";
import { useAuth } from "../auth";

export function Shell() {
  const { user, superAdmin, logout } = useAuth();
  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <header className="topbar">
        <p className="brand">Kernel</p>
        <span className="muted">{user?.org?.name || user?.org_id}</span>
        <div className="spacer">
          <NavLink to="/profile">{user?.name || user?.email}</NavLink>
          <div className="avatar">{initials}</div>
          <button className="ghost" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>
      <aside className="sidebar">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        {superAdmin && (
          <>
            <div className="group-label">Super admin</div>
            {CATALOG.map((item) => (
              <NavLink key={item.key} to={`/settings/${item.key}`}>{item.label}</NavLink>
            ))}
          </>
        )}
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
