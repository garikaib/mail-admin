// src/store/useUiStore.js
import { create } from 'zustand';

const useUiStore = create((set) => ({
  activeTab: (() => {
    const path = window.location.pathname.substring(1);
    const validPaths = ['domains', 'credentials', 'health', 'logs', 'users', 'plans', 'registrations', 'geo-auth'];
    return validPaths.includes(path) ? path : 'domains';
  })(),
  setActiveTab: (activeTab) => set({ activeTab }),
  mobileMenuOpen: false,
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  successMsg: '',
  setSuccessMsg: (successMsg) => set({ successMsg }),
  errorMsg: '',
  setErrorMsg: (errorMsg) => set({ errorMsg }),
  confirmModal: null,
  setConfirmModal: (confirmModal) => set({ confirmModal }),
}));

export default useUiStore;
