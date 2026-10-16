import { FormEvent, useState } from "react";
import { changePassword, updateUserName } from "../api";
import { useAuth } from "../auth";

export function Profile() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");
    setMessage("");
    try {
      await updateUserName(user.id, name);
      await refresh();
      setMessage("Name updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update name");
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await changePassword(currentPassword, newPassword);
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    }
  };

  return (
    <div>
      <h1>Profile</h1>
      <p className="muted">{user?.email} · {user?.org?.name || user?.org_id}</p>
      <form className="panel" onSubmit={saveName}>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" type="submit">Update profile</button>
      </form>
      <form className="panel" style={{ marginTop: 16 }} onSubmit={savePassword}>
        <h2>Change password</h2>
        <p className="muted">At least 8 characters, with a number and a symbol. You will be signed out.</p>
        <label htmlFor="current">Current password</label>
        <input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <label htmlFor="next">New password</label>
        <input id="next" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <button className="primary" type="submit">Update password</button>
      </form>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
