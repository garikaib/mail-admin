// src/store/useDomainsStore.js
import { create } from 'zustand';

const useDomainsStore = create((set) => ({
  domains: [],
  setDomains: (domains) => set({ domains }),
  plans: [],
  setPlans: (plans) => set({ plans }),
  mailboxes: [],
  setMailboxes: (mailboxes) => set({ mailboxes }),
  aliases: [],
  setAliases: (aliases) => set({ aliases }),
  provisionLogs: [],
  setProvisionLogs: (provisionLogs) => set({ provisionLogs }),
  trackedProvisioningDomain: null,
  setTrackedProvisioningDomain: (domain) => set({ trackedProvisioningDomain: domain }),
  showProvisioningModal: false,
  setShowProvisioningModal: (show) => set({ showProvisioningModal: show }),
  showAddDomainModal: false,
  setShowAddDomainModal: (show) => set({ showAddDomainModal: show }),
  newDomainName: '',
  setNewDomainName: (name) => set({ newDomainName: name }),
  selectedCredId: '',
  setSelectedCredId: (id) => set({ selectedCredId: id }),
  selectedPlanId: '',
  setSelectedPlanId: (id) => set({ selectedPlanId: id }),
  selectedDomain: null,
  setSelectedDomain: (domain) => set({ selectedDomain: domain }),
}));

export default useDomainsStore;
