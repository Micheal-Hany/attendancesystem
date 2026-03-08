'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '@/types';

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (user: AppUser) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, isAdmin: false, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('church_user');
      if (raw) setUser(JSON.parse(raw));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  function login(u: AppUser) {
    setUser(u);
    localStorage.setItem('church_user', JSON.stringify(u));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('church_user');
  }

  return (
    <Ctx.Provider value={{ user, loading, isAdmin: user?.role === 'admin', login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
