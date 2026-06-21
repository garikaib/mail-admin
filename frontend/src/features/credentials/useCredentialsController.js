// src/features/credentials/useCredentialsController.js
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import useCredentialsStore from '../../store/useCredentialsStore';
import useDomainsStore from '../../store/useDomainsStore';

const API_BASE = '/api';

export function useCredentialsController() {
  const token = useAuthStore(state => state.token);
  const { setSuccessMsg, setErrorMsg, setConfirmModal } = useUiStore();
  
  const {
    credentials, setCredentials,
    cloudflareZones, setCloudflareZones,
    selectedCredential, setSelectedCredential,
    selectedZone, setSelectedZone,
    zoneDnsRecords, setZoneDnsRecords,
    dnsRecordType, setDnsRecordType,
    dnsRecordName, setDnsRecordName,
    dnsRecordContent, setDnsRecordContent,
    dnsRecordPriority, setDnsRecordPriority,
    dnsRecordProxied, setDnsRecordProxied,
    dnsRecordTtl, setDnsRecordTtl,
    showAddDnsRecordModal, setShowAddDnsRecordModal,
    showEditDnsRecordModal, setShowEditDnsRecordModal,
    editingDnsRecord, setEditingDnsRecord,
  } = useCredentialsStore();

  const {
    domains,
    setSelectedDomain,
    setActiveTab,
    setNewDomainName,
    setSelectedCredId,
    setSelectedPlanId,
    setShowAddDomainModal,
  } = useDomainsStore();

  // Local controller states (for search/filtering and modal text inputs)
  const [loading, setLoading] = useState(false);
  const [cfZoneSearchQuery, setCfZoneSearchQuery] = useState('');
  const [cfZoneStatusFilter, setCfZoneStatusFilter] = useState('all');
  const [cfAccountFilter, setCfAccountFilter] = useState('all');

  const [newCredLabel, setNewCredLabel] = useState('');
  const [newCredEmail, setNewCredEmail] = useState('');
  const [newCredKey, setNewCredKey] = useState('');
  const [showAddCredModal, setShowAddCredModal] = useState(false);

  const [showEditCredModal, setShowEditCredModal] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [editCredLabel, setEditCredLabel] = useState('');
  const [editCredEmail, setEditCredEmail] = useState('');
  const [editCredKey, setEditCredKey] = useState('');

  // Fetch functions
  const fetchCredentials = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/domains/credentials`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCredentials(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCloudflareZones = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/domains/cloudflare-zones`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCloudflareZones(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDnsRecords = async (credId, zoneId, t = token) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${credId}/zones/${zoneId}/dns-records`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setZoneDnsRecords(data);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to fetch DNS records");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load DNS records");
    } finally {
      setLoading(false);
    }
  };

  // Mutations
  const handleAddCredential = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: newCredLabel,
          email: newCredEmail,
          api_key: newCredKey
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to add credential');
      }
      setSuccessMsg(`Cloudflare credential '${newCredLabel}' added successfully.`);
      setShowAddCredModal(false);
      setNewCredLabel('');
      setNewCredEmail('');
      setNewCredKey('');
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCredential = async (e) => {
    e.preventDefault();
    if (!editingCredential) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${editingCredential.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: editCredLabel,
          email: editCredEmail,
          ...(editCredKey && { api_key: editCredKey })
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update credential');
      }
      setSuccessMsg(`Cloudflare credential '${editCredLabel}' updated successfully.`);
      setShowEditCredModal(false);
      setEditingCredential(null);
      setEditCredLabel('');
      setEditCredEmail('');
      setEditCredKey('');
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScanZoneOwnership = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/zone-ownership/scan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to scan Cloudflare zones');
      }
      fetchCloudflareZones();
      setSuccessMsg(`Scanned ${data.length} domain zones.`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteCredentialConfirmed = async (credId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${credId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete credential');
      }
      setSuccessMsg(data.message);
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCredential = (credId) => {
    setConfirmModal({
      title: 'Delete Cloudflare credential?',
      message: 'This credential set will be removed. Domains using it may need a replacement credential before future DNS changes.',
      confirmLabel: 'Delete credential',
      tone: 'danger',
      onConfirm: () => deleteCredentialConfirmed(credId),
    });
  };

  const handleCreateDnsRecord = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: dnsRecordType,
          name: dnsRecordName,
          content: dnsRecordContent,
          priority: dnsRecordPriority ? parseInt(dnsRecordPriority) : null,
          proxied: dnsRecordProxied,
          ttl: dnsRecordTtl ? parseInt(dnsRecordTtl) : 3600
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create DNS record");
      
      setSuccessMsg("DNS record created successfully!");
      setShowAddDnsRecordModal(false);
      
      setDnsRecordType('A');
      setDnsRecordName('');
      setDnsRecordContent('');
      setDnsRecordPriority('');
      setDnsRecordProxied(false);
      setDnsRecordTtl('3600');
      
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleUpdateDnsRecord = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records/${editingDnsRecord.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: dnsRecordType,
          name: dnsRecordName,
          content: dnsRecordContent,
          priority: dnsRecordPriority ? parseInt(dnsRecordPriority) : null,
          proxied: dnsRecordProxied,
          ttl: dnsRecordTtl ? parseInt(dnsRecordTtl) : 3600
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update DNS record");
      
      setSuccessMsg("DNS record updated successfully!");
      setShowEditDnsRecordModal(false);
      setEditingDnsRecord(null);
      
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleEditDnsRecord = (record) => {
    setEditingDnsRecord(record);
    setDnsRecordType(record.type);
    setDnsRecordName(record.name);
    setDnsRecordContent(record.content);
    setDnsRecordPriority(record.priority !== undefined && record.priority !== null ? String(record.priority) : '');
    setDnsRecordProxied(record.proxied || false);
    setDnsRecordTtl(String(record.ttl || 3600));
    setShowEditDnsRecordModal(true);
  };

  const handleDeleteDnsRecord = async (recordId) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records/${recordId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete DNS record");
      
      setSuccessMsg("DNS record deleted successfully!");
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Eager load data on hook mount
  useEffect(() => {
    if (token) {
      fetchCredentials();
      fetchCloudflareZones();
    }
  }, [token]);

  return {
    // Sourced states
    domains,
    credentials,
    cloudflareZones,
    selectedCredential, setSelectedCredential,
    selectedZone, setSelectedZone,
    zoneDnsRecords,
    dnsRecordType, setDnsRecordType,
    dnsRecordName, setDnsRecordName,
    dnsRecordContent, setDnsRecordContent,
    dnsRecordPriority, setDnsRecordPriority,
    dnsRecordProxied, setDnsRecordProxied,
    dnsRecordTtl, setDnsRecordTtl,
    showAddDnsRecordModal, setShowAddDnsRecordModal,
    showEditDnsRecordModal, setShowEditDnsRecordModal,
    editingDnsRecord, setEditingDnsRecord,

    // Local controller state
    loading,
    cfZoneSearchQuery, setCfZoneSearchQuery,
    cfZoneStatusFilter, setCfZoneStatusFilter,
    cfAccountFilter, setCfAccountFilter,
    newCredLabel, setNewCredLabel,
    newCredEmail, setNewCredEmail,
    newCredKey, setNewCredKey,
    showAddCredModal, setShowAddCredModal,
    showEditCredModal, setShowEditCredModal,
    editingCredential, setEditingCredential,
    editCredLabel, setEditCredLabel,
    editCredEmail, setEditCredEmail,
    editCredKey, setEditCredKey,

    // Methods
    fetchCredentials,
    fetchCloudflareZones,
    fetchDnsRecords,
    handleAddCredential,
    handleUpdateCredential,
    handleScanZoneOwnership,
    handleDeleteCredential,
    handleCreateDnsRecord,
    handleUpdateDnsRecord,
    handleEditDnsRecord,
    handleDeleteDnsRecord,

    // Domains helpers mapped to controller actions
    setSelectedDomain,
    setActiveTab,
    setNewDomainName,
    setSelectedCredId,
    setSelectedPlanId,
    setShowAddDomainModal,
  };
}
