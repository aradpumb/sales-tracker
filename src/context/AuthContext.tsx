"use client";

import React from "react";

export type Role = "admin" | "user";
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type AuthContextValue = {
  user: CurrentUser | null;
  isAdmin: boolean;
  login: (user: Omit<CurrentUser, "id">) => void;
  logout: () => void;
  // User management (mock, localStorage-based)
  users: CurrentUser[];
  promote: (id: string) => void;
  demote: (id: string) => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

const LS_CURRENT = "auth.currentUser";
const LS_USERS = "auth.users";

function readUsers(): CurrentUser[] {
  try {
    return JSON.parse(localStorage.getItem(LS_USERS) || "[]");
  } catch {
    return [];
  }
}

function writeUsers(users: CurrentUser[]) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [users, setUsers] = React.useState<CurrentUser[]>([]);

  React.useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem(LS_CURRENT) || "null");
      if (u) setUser(u);
    } catch {}
    setUsers(readUsers());
  }, []);

  function login(u: Omit<CurrentUser, "id">) {
    const id = crypto.randomUUID();
    // See if this email already exists -> reuse id/role
    let list = readUsers();
    const existing = list.find((x) => x.email === u.email);
    const finalUser: CurrentUser = existing
      ? { ...existing, name: u.name, email: u.email, role: u.role }
      : { id, ...u };
    if (!existing) list = [finalUser, ...list];
    writeUsers(list);
    setUsers(list);
    setUser(finalUser);
    localStorage.setItem(LS_CURRENT, JSON.stringify(finalUser));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(LS_CURRENT);
  }

  function updateRole(id: string, role: Role) {
    const list = readUsers().map((u) => (u.id === id ? { ...u, role } : u));
    writeUsers(list);
    setUsers(list);
    if (user?.id === id) {
      const updated = list.find((u) => u.id === id) || null;
      setUser(updated);
      localStorage.setItem(LS_CURRENT, JSON.stringify(updated));
    }
  }

  const value: AuthContextValue = {
    user,
    isAdmin: user?.role === "admin",
    login,
    logout,
    users,
    promote: (id) => updateRole(id, "admin"),
    demote: (id) => updateRole(id, "user"),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
