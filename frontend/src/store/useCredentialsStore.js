// src/store/useCredentialsStore.js
import { create } from 'zustand';

const useCredentialsStore = create((set) => ({
  credentials: [],
  setCredentials: (credentials) => set({ credentials }),
  cloudflareZones: [],
  setCloudflareZones: (cloudflareZones) => set({ cloudflareZones }),
  selectedCredential: null,
  setSelectedCredential: (selectedCredential) => set({ selectedCredential }),
  selectedZone: null,
  setSelectedZone: (selectedZone) => set({ selectedZone }),
  zoneDnsRecords: [],
  setZoneDnsRecords: (zoneDnsRecords) => set({ zoneDnsRecords }),
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
}));

export default useCredentialsStore;
