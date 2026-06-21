// src/features/domains/useDomainsController.js
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import useDomainsStore from '../../store/useDomainsStore';

const API_BASE = '/api';

export function useDomainsController() {
  const token = useAuthStore(state => state.token);
  const { setSuccessMsg, setErrorMsg, setConfirmModal } = useUiStore();
  const {
    domains, setDomains,
    plans, setPlans,
    mailboxes, setMailboxes,
    aliases, setAliases,
    provisionLogs, setProvisionLogs,
    trackedProvisioningDomain, setTrackedProvisioningDomain,
    showProvisioningModal, setShowProvisioningModal,
    showAddDomainModal, setShowAddDomainModal,
    newDomainName, setNewDomainName,
    selectedCredId, setSelectedCredId,
    selectedPlanId, setSelectedPlanId,
    selectedDomain, setSelectedDomain,
  } = useDomainsStore();

  // Local Loading State
  const [loading, setLoading] = useState(false);

  // Local Form Inputs (Localized states from App.jsx)
  const [cfEmailInput, setCfEmailInput] = useState('');
  const [cfApiKeyInput, setCfApiKeyInput] = useState('');
  const [saveCredCheckbox, setSaveCredCheckbox] = useState(true);

  // Mailbox inputs
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newMailboxLocal, setNewMailboxLocal] = useState('');
  const [newMailboxPwd, setNewMailboxPwd] = useState('');
  const [newMailboxName, setNewMailboxName] = useState('');
  const newMailboxQuota = 1048576; // 1GB in KB

  // Alias inputs
  const [showAddAliasModal, setShowAddAliasModal] = useState(false);
  const [newAliasSource, setNewAliasSource] = useState('');
  const [newAliasDest, setNewAliasDest] = useState('');
  const [editingAlias, setEditingAlias] = useState(null);
  const [editAliasDest, setEditAliasDest] = useState('');

  // DNS review state
  const [showDnsReviewModal, setShowDnsReviewModal] = useState(false);
  const [dnsReviewData, setDnsReviewData] = useState(null);
  const [editedDnsRecords, setEditedDnsRecords] = useState([]);
  const [pollingDomain, setPollingDomain] = useState(null);

  // Fetch functions
  const fetchDomains = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/domains`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPlans = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/domains/plans`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectDomain = async (dom) => {
    setSelectedDomain(dom);
    if (!dom) return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('domain') !== dom.name) {
      window.history.pushState(null, '', `/domains?domain=${dom.name}`);
    }
    setLoading(true);
    try {
      const usersRes = await fetch(`${API_BASE}/users/domain/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setMailboxes(usersData);
      }
      
      const aliasesRes = await fetch(`${API_BASE}/aliases/domain/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (aliasesRes.ok) {
        const aliasesData = await aliasesRes.json();
        setAliases(aliasesData);
      }

      const logsRes = await fetch(`${API_BASE}/domains/provision/status/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setProvisionLogs(logsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionDomain = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    try {
      let body = {
        name: newDomainName,
        plan_id: parseInt(selectedPlanId)
      };

      if (selectedCredId && selectedCredId !== 'new') {
        body.cred_id = parseInt(selectedCredId);
      } else {
        body.cf_email = cfEmailInput;
        body.cf_key = cfApiKeyInput;
        body.save_cred = saveCredCheckbox;
      }

      const res = await fetch(`${API_BASE}/domains/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to start provisioning');
      }

      if (data.status === 'pending_dns_review') {
        setDnsReviewData(data);
        setEditedDnsRecords(data.dns_records);
        setShowDnsReviewModal(true);
        setShowAddDomainModal(false);
        setNewDomainName('');
        setCfEmailInput('');
        setCfApiKeyInput('');
        return;
      }

      setSuccessMsg(data.message);
      setPollingDomain(newDomainName);
      setTrackedProvisioningDomain(newDomainName);
      setShowProvisioningModal(true);
      setProvisionLogs([]);
      setShowAddDomainModal(false);
      
      setNewDomainName('');
      setCfEmailInput('');
      setCfApiKeyInput('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmProvision = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/provision/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          domain: dnsReviewData.domain,
          plan_id: dnsReviewData.plan_id,
          cred_id: dnsReviewData.cred_id,
          cf_email: dnsReviewData.cf_email,
          cf_key: dnsReviewData.cf_key,
          dns_records: editedDnsRecords
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to confirm provisioning');
      }

      setSuccessMsg(data.message);
      setPollingDomain(dnsReviewData.domain);
      setTrackedProvisioningDomain(dnsReviewData.domain);
      setShowProvisioningModal(true);
      setProvisionLogs([]);
      setShowDnsReviewModal(false);
      setDnsReviewData(null);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDnsRecordFieldChange = (index, field, value) => {
    const updated = [...editedDnsRecords];
    updated[index] = { ...updated[index], [field]: value };
    setEditedDnsRecords(updated);
  };

  const deleteDomainConfirmed = async (domainId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/domains/${domainId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete domain');
      }
      setSuccessMsg(data.message);
      fetchDomains();
      if (selectedDomain && selectedDomain.id === domainId) {
        setSelectedDomain(null);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDomain = (domainId, domainName) => {
    setConfirmModal({
      title: 'Delete domain?',
      message: `Are you sure you want to permanently delete the domain ${domainName}? This will purge Nginx conf, mailboxes, and aliases on the server.`,
      confirmLabel: 'Purge Everything',
      tone: 'danger',
      onConfirm: () => deleteDomainConfirmed(domainId),
    });
  };

  const handleAddMailbox = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/users/domain/${selectedDomain.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: `${newMailboxLocal}@${selectedDomain.name}`,
          password: newMailboxPwd,
          full_name: newMailboxName || newMailboxLocal,
          quota_kb: parseInt(newMailboxQuota)
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create mailbox');
      }
      
      setSuccessMsg(`Mailbox created successfully. Email: ${data.email}`);
      setShowAddUserModal(false);
      setNewMailboxLocal('');
      setNewMailboxPwd('');
      setNewMailboxName('');
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetMailboxPwdConfirmed = async (email) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${email}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }
      // Since resetPwdModal displays in App.jsx shell, we pass it back or manage it
      // Let's set it as success message detailing the password
      setSuccessMsg(`Password reset for ${email}. New Password: ${data.new_password}`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetMailboxPwd = (email) => {
    setConfirmModal({
      title: 'Reset mailbox password?',
      message: `Generate a new password for ${email}. The password will be shown in the success message after reset.`,
      confirmLabel: 'Reset password',
      tone: 'warning',
      onConfirm: () => resetMailboxPwdConfirmed(email),
    });
  };

  const deleteMailboxConfirmed = async (email) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${email}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete mailbox');
      }
      setSuccessMsg(data.message);
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMailbox = (email) => {
    setConfirmModal({
      title: 'Delete mailbox?',
      message: `This will purge ${email} and its mailbox folder on the server.`,
      confirmLabel: 'Delete mailbox',
      tone: 'danger',
      onConfirm: () => deleteMailboxConfirmed(email),
    });
  };

  const handleAddAlias = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/aliases/domain/${selectedDomain.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          source: `${newAliasSource}@${selectedDomain.name}`,
          destination: newAliasDest
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create alias');
      }
      
      setSuccessMsg(`Alias created: ${data.source} -> ${data.destination}`);
      setShowAddAliasModal(false);
      setNewAliasSource('');
      setNewAliasDest('');
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAlias = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/aliases/${editingAlias.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          destination: editAliasDest
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update alias');
      }
      
      setSuccessMsg(`Alias updated successfully`);
      setEditingAlias(null);
      setEditAliasDest('');
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAliasConfirmed = async (aliasId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/aliases/${aliasId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete alias');
      }
      setSuccessMsg(data.message);
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlias = (aliasId) => {
    setConfirmModal({
      title: 'Delete alias?',
      message: 'This forwarding rule will be removed immediately.',
      confirmLabel: 'Delete alias',
      tone: 'danger',
      onConfirm: () => deleteAliasConfirmed(aliasId),
    });
  };

  // Provisioning stepper logs logic
  const STEP_ORDER = ['TOKEN', 'DNS', 'SSL', 'DKIM', 'NGINX', 'DB'];

  const getStepLabel = (stepCode) => {
    switch (stepCode) {
      case 'TOKEN': return 'API Token & Auth';
      case 'DNS': return 'DNS Mail Stack Setup';
      case 'SSL': return 'Wildcard SSL Generation';
      case 'DKIM': return 'DKIM Key Setup';
      case 'NGINX': return 'Nginx Webmail Configuration';
      case 'DB': return 'Database Setup & Admin';
      default: return stepCode;
    }
  };

  const getStepDesc = (stepCode) => {
    switch (stepCode) {
      case 'TOKEN': return 'Creating zone-scoped Cloudflare API Token';
      case 'DNS': return 'Configuring MX, SPF, DMARC, Webmail, and Mail subdomain records';
      case 'SSL': return 'Requesting Let\'s Encrypt SSL certificates via Lego';
      case 'DKIM': return 'Generating signing keys and configuring Rspamd';
      case 'NGINX': return 'Enabling webmail virtual hosts and reloading proxy config';
      case 'DB': return 'Creating database entries and generating default admin account';
      default: return '';
    }
  };

  const getStepStatus = (stepCode) => {
    const stepLogs = provisionLogs.filter(l => l.step === stepCode);
    if (stepLogs.length > 0) {
      if (stepLogs.some(l => l.status === 'FAILED')) return 'failed';
      if (stepLogs.some(l => l.status === 'SUCCESS')) return 'success';
      return 'running';
    }
    
    const myIndex = STEP_ORDER.indexOf(stepCode);
    const hasLaterStep = provisionLogs.some(l => STEP_ORDER.indexOf(l.step) > myIndex);
    if (hasLaterStep) return 'success';
    
    const hasFailure = provisionLogs.some(l => l.status === 'FAILED' || l.step === 'CRITICAL');
    if (hasFailure) return 'aborted';
    
    if (myIndex === 0) return 'running';
    const prevStep = STEP_ORDER[myIndex - 1];
    const prevStatus = getStepStatus(prevStep);
    if (prevStatus === 'success') return 'running';
    
    return 'pending';
  };

  const getProgressPercent = () => {
    let successCount = 0;
    STEP_ORDER.forEach(code => {
      if (getStepStatus(code) === 'success') successCount++;
    });
    return Math.round((successCount / STEP_ORDER.length) * 100);
  };

  const getAdminCredentials = () => {
    const dbLog = provisionLogs.find(l => l.step === 'DB' && l.status === 'SUCCESS');
    if (dbLog && dbLog.details.includes('Admin:')) {
      const match = dbLog.details.match(/Admin:\s*([^\s|]+)\s*\|\s*Password:\s*([^\s|]+)/);
      if (match) {
        return { email: match[1], password: match[2] };
      }
    }
    return null;
  };

  const latestLog = provisionLogs[0];
  const isFinished = latestLog && (
    (latestLog.step === 'COMPLETE' && latestLog.status === 'SUCCESS') || 
    latestLog.status === 'FAILED' || 
    latestLog.step === 'CRITICAL'
  );
  const isSuccess = latestLog && latestLog.step === 'COMPLETE' && latestLog.status === 'SUCCESS';
  const isFailed = latestLog && (latestLog.status === 'FAILED' || latestLog.step === 'CRITICAL');
  const rollbackLogs = provisionLogs.filter(l => l.step === 'ROLLBACK');

  // Eager load domains and plans on mount if they aren't loaded
  useEffect(() => {
    if (token) {
      fetchDomains();
      fetchPlans();
    }
  }, [token]);

  return {
    // Domains store state
    domains,
    plans,
    mailboxes,
    aliases,
    selectedDomain,
    setSelectedDomain,
    showAddDomainModal,
    setShowAddDomainModal,
    newDomainName,
    setNewDomainName,
    selectedCredId,
    setSelectedCredId,
    selectedPlanId,
    setSelectedPlanId,

    // Local form/UI states
    loading,
    cfEmailInput, setCfEmailInput,
    cfApiKeyInput, setCfApiKeyInput,
    saveCredCheckbox, setSaveCredCheckbox,
    showAddUserModal, setShowAddUserModal,
    newMailboxLocal, setNewMailboxLocal,
    newMailboxPwd, setNewMailboxPwd,
    newMailboxName, setNewMailboxName,
    newMailboxQuota,
    showAddAliasModal, setShowAddAliasModal,
    newAliasSource, setNewAliasSource,
    newAliasDest, setNewAliasDest,
    editingAlias, setEditingAlias,
    editAliasDest, setEditAliasDest,
    showDnsReviewModal, setShowDnsReviewModal,
    dnsReviewData, setDnsReviewData,
    editedDnsRecords, setEditedDnsRecords,
    pollingDomain, setPollingDomain,

    // Stepper properties
    STEP_ORDER,
    getStepLabel,
    getStepDesc,
    getStepStatus,
    getProgressPercent,
    getAdminCredentials,
    latestLog,
    isFinished,
    isSuccess,
    isFailed,
    rollbackLogs,
    
    // Actions
    fetchDomains,
    fetchPlans,
    handleSelectDomain,
    handleProvisionDomain,
    handleConfirmProvision,
    handleDnsRecordFieldChange,
    handleDeleteDomain,
    handleAddMailbox,
    handleResetMailboxPwd,
    handleDeleteMailbox,
    handleAddAlias,
    handleUpdateAlias,
    handleDeleteAlias,
  };
}
