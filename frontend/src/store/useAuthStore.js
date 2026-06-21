// src/store/useAuthStore.js
import { create } from 'zustand';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('mail_admin_token') || '',
  user: (() => {
    const saved = localStorage.getItem('mail_admin_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),
  setToken: (token) => {
    localStorage.setItem('mail_admin_token', token);
    set({ token });
  },
  setUser: (user) => {
    if (user) {
      localStorage.setItem('mail_admin_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('mail_admin_user');
    }
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('mail_admin_token');
    localStorage.removeItem('mail_admin_user');
    set({ token: '', user: null });
  }
}));

export default useAuthStore;
