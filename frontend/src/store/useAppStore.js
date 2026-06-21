// src/store/useAppStore.js
import { create } from 'zustand';

/**
 * Centralized Zustand store for the Mail Admin frontend.
 * Mirrors the state previously held in App.jsx.
 */
const useAppStore = create((set) => ({
  // Domain data
  domains: [],
  setDomains: (domains) => set({ domains }),

  // Mail plans
  plans: [],
  setPlans: (plans) => set({ plans }),

  // Cloudflare credentials
  credentials: [],
  setCredentials: (credentials) => set({ credentials }),

  // System health information
  systemHealth: null,
  setSystemHealth: (systemHealth) => set({ systemHealth }),

  // Mailbox and alias management
  mailboxes: [],
  setMailboxes: (mailboxes) => set({ mailboxes }),
  aliases: [],
  setAliases: (aliases) => set({ aliases }),

  // Provisioning logs and related UI state
  provisionLogs: [],
  setProvisionLogs: (provisionLogs) => set({ provisionLogs }),
  pollingDomain: null,
  setPollingDomain: (pollingDomain) => set({ pollingDomain }),
  trackedProvisioningDomain: null,
  setTrackedProvisioningDomain: (trackedProvisioningDomain) => set({ trackedProvisioningDomain }),
  showProvisioningModal: false,
  setShowProvisioningModal: (showProvisioningModal) => set({ showProvisioningModal }),

  // Global UI/loading flags
  loading: false,
  setLoading: (loading) => set({ loading }),
  errorMsg: '',
  setErrorMsg: (errorMsg) => set({ errorMsg }),
  successMsg: '',
  setSuccessMsg: (successMsg) => set({ successMsg }),

  // Domain‑specific modals and editors
  showAddDomainModal: false,
  setShowAddDomainModal: (showAddDomainModal) => set({ showAddDomainModal }),
  showDnsReviewModal: false,
  setShowDnsReviewModal: (showDnsReviewModal) => set({ showDnsReviewModal }),
  dnsReviewData: null,
  setDnsReviewData: (dnsReviewData) => set({ dnsReviewData }),
  editedDnsRecords: [],
  setEditedDnsRecords: (editedDnsRecords) => set({ editedDnsRecords }),
  dnsRecordType: 'A',
  setDnsRecordType: (dnsRecordType) => set({ dnsRecordType }),
  dnsRecordName: '',
  setDnsRecordName: (dnsRecordName) => set({ dnsRecordName }),
  dnsRecordContent: '',
  setDnsRecordContent: (dnsRecordContent) => set({ dnsRecordContent }),
  dnsRecordPriority: '',
  setDnsRecordPriority: (dnsRecordPriority) => set({ dnsRecordPriority }),
  dnsRecordProxied: false,
  setDnsRecordProxied: (dnsRecordProxied) => set({ dnsRecordProxied }),
  dnsRecordTtl: '3600',
  setDnsRecordTtl: (dnsRecordTtl) => set({ dnsRecordTtl }),
  showAddDnsRecordModal: false,
  setShowAddDnsRecordModal: (showAddDnsRecordModal) => set({ showAddDnsRecordModal }),
  showEditDnsRecordModal: false,
  setShowEditDnsRecordModal: (showEditDnsRecordModal) => set({ showEditDnsRecordModal }),
  editingDnsRecord: null,
  setEditingDnsRecord: (editingDnsRecord) => set({ editingDnsRecord }),
  zoneDnsRecords: [],
  setZoneDnsRecords: (zoneDnsRecords) => set({ zoneDnsRecords }),
  selectedZone: null,
  setSelectedZone: (selectedZone) => set({ selectedZone }),
  selectedCredential: null,
  setSelectedCredential: (selectedCredential) => set({ selectedCredential }),
  selectedDomain: null,
  setSelectedDomain: (selectedDomain) => set({ selectedDomain }),
  activeTab: 'domains',
  setActiveTab: (activeTab) => set({ activeTab }),
  newDomainName: '',
  setNewDomainName: (newDomainName) => set({ newDomainName }),
  selectedCredId: '',
  setSelectedCredId: (selectedCredId) => set({ selectedCredId }),
  selectedPlanId: '',
  setSelectedPlanId: (selectedPlanId) => set({ selectedPlanId }),


  copied: false,
  setCopied: (copied) => set({ copied }),
}));

export default useAppStore;
