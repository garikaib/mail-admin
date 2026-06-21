// src/features/domains/DomainsScreen.jsx
import { useState, useEffect } from 'react';
import { 
  Globe, Plus, Search, ChevronRight, RefreshCw, Check, X, 
  Copy, Sparkles, AlertTriangle, CheckCircle2 
} from 'lucide-react';

import { useDomainsController } from './useDomainsController';
import { usePermissions } from '../../shared/lib/usePermissions';
import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import useCredentialsStore from '../../store/useCredentialsStore';
import { DomainDetailPage } from './DomainDetailPage';
import { generateSecurePassword } from '../../shared/lib/helpers';

export default function DomainsScreen() {
  const { hasPermission } = usePermissions();
  const token = useAuthStore(state => state.token);
  const { setSuccessMsg, setErrorMsg } = useUiStore();
  
  // Credentials store for the provision modal
  const credentials = useCredentialsStore(state => state.credentials);
  const setCredentials = useCredentialsStore(state => state.setCredentials);

  // Load Cloudflare credentials on mount if empty
  useEffect(() => {
    if (token && credentials.length === 0) {
      fetch('/api/credentials', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.ok ? res.json() : [])
      .then(data => setCredentials(data))
      .catch(err => console.error(err));
    }
  }, [token, credentials.length, setCredentials]);

  // Hook into our dedicated domain feature controller
  const {
    // Domains Store state
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
    provisionLogs,
    showProvisioningModal,
    setShowProvisioningModal,
    trackedProvisioningDomain,
    setTrackedProvisioningDomain,

    // Local controller states
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
  } = useDomainsController();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copied, setCopied] = useState(false);

  // Filtered domains list
  const filteredDomains = domains.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && d.is_active) || 
                         (statusFilter === 'suspended' && !d.is_active);
    return matchesSearch && matchesStatus;
  });

  if (selectedDomain) {
    return (
      <DomainDetailPage 
        domain={selectedDomain} 
        mailboxes={mailboxes}
        aliases={aliases}
        provisionLogs={provisionLogs}
        onBack={() => {
          setSelectedDomain(null);
          window.history.pushState(null, '', '/domains');
        }}
        onAddUser={() => setShowAddUserModal(true)}
        onAddAlias={() => setShowAddAliasModal(true)}
        onResetPassword={handleResetMailboxPwd}
        onDeleteMailbox={handleDeleteMailbox}
        onDeleteAlias={handleDeleteAlias}
        onEditAlias={(alias) => {
          setEditingAlias(alias);
          setEditAliasDest(alias.destination);
        }}
        plans={plans}
        hasPermission={hasPermission}
        onDeleteDomain={() => handleDeleteDomain(selectedDomain.id, selectedDomain.name)}
        refresh={() => handleSelectDomain(selectedDomain)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Domains Directory</h2>
          <p className="text-slate-400 text-sm mt-1">Manage email mailboxes, aliases, and system forwarding.</p>
        </div>
        {hasPermission('domains:provision') && (
          <button 
            onClick={() => setShowAddDomainModal(true)}
            className="bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-all shadow-lg hover:shadow-brand-mint/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            New Domain
          </button>
        )}
      </div>

      {/* Filters / Search */}
      <div className="flex flex-col sm:flex-row gap-4 bg-brand-plum/45 p-4 rounded-2xl border border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search domains..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-brand-plum-dark border border-white/10 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-brand-mint focus:ring-1 focus:ring-brand-mint"
          />
        </div>
        <div className="flex gap-2">
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
        </div>
      </div>

      {/* Domains Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDomains.length > 0 ? (
          filteredDomains.map(d => (
            <div 
              key={d.id} 
              onClick={() => handleSelectDomain(d)}
              className="glassmorphism-card rounded-2xl p-6 hover:border-brand-mint/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    d.is_active ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {d.is_active ? 'Active' : 'Suspended'}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold px-2 py-0.5 rounded-md bg-white/5">
                    {d.plan_name}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-brand-mint transition-colors">{d.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">SMTP: mail.zimprices.co.zw</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-6">
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>Max Mailboxes: <strong>{d.max_users}</strong></span>
                  <span>Aliases: <strong>{d.max_aliases}</strong></span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center bg-brand-plum/20 border border-white/5 rounded-2xl">
            <Globe className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No domains found.</p>
          </div>
        )}
      </div>

      {/* Domain Provision Modal */}
      {showAddDomainModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Provision New Mail Domain</h3>
            <form onSubmit={handleProvisionDomain} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Domain Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. business.co.zw" 
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Allocation Plan</label>
                  <select 
                    required
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  >
                    <option value="">Select Plan...</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.max_users} Box, {p.quota_mb}MB)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Cloudflare Account</label>
                  <select 
                    required
                    value={selectedCredId}
                    onChange={(e) => { setSelectedCredId(e.target.value); if (e.target.value === 'new' && !cfEmailInput) setCfEmailInput('gbdzoma@gmail.com'); }}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  >
                    <option value="">Choose Credentials...</option>
                    <option value="new">+ Enter New Keys</option>
                    {credentials.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedCredId === 'new' && (
                <div className="bg-brand-plum-dark p-4 rounded-2xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300">New Cloudflare Credentials</h4>
                  <div>
                    <input 
                      type="email" 
                      placeholder="Cloudflare account email" 
                      value={cfEmailInput}
                      onChange={(e) => setCfEmailInput(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-plum border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-mint"
                    />
                  </div>
                  <div>
                    <input 
                      type="password" 
                      placeholder="Cloudflare Global Key or Token" 
                      value={cfApiKeyInput}
                      onChange={(e) => setCfApiKeyInput(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-plum border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-mint"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400 select-none">
                    <input 
                      type="checkbox" 
                      checked={saveCredCheckbox}
                      onChange={(e) => setSaveCredCheckbox(e.target.checked)}
                      className="rounded accent-brand-mint"
                    />
                    Encrypt & save keys for server-side provisioning
                  </label>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddDomainModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Deploy Infrastructure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DNS Review Modal */}
      {showDnsReviewModal && dnsReviewData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Review Proposed DNS Records</h3>
              <p className="text-sm text-slate-400 mt-1">
                For domain <span className="text-brand-mint font-semibold">{dnsReviewData.domain}</span>. Review and customize the Cloudflare entries before provisioning.
              </p>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 px-4 py-3 rounded-2xl text-xs space-y-1">
              <span className="font-bold block">💡 Important Notes:</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Editing the DKIM key content manually is not recommended as it must match the server's private key.</li>
                <li>Ensure the MX and CNAME records point to the correct mail server.</li>
              </ul>
            </div>

            <div className="overflow-x-auto border border-white/5 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4">Type</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Content</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">TTL</th>
                    <th className="p-4">Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {editedDnsRecords.map((rec, index) => (
                    <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 font-mono font-bold text-brand-mint">{rec.type}</td>
                      <td className="p-4 font-mono">{rec.name}</td>
                      <td className="p-4">
                        <input
                          type="text"
                          value={rec.content}
                          onChange={(e) => handleDnsRecordFieldChange(index, 'content', e.target.value)}
                          className="w-full px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white focus:outline-none focus:border-brand-mint font-mono"
                        />
                      </td>
                      <td className="p-4">
                        {rec.type === 'MX' ? (
                          <input
                            type="number"
                            value={rec.priority || 10}
                            onChange={(e) => handleDnsRecordFieldChange(index, 'priority', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white text-center focus:outline-none focus:border-brand-mint font-mono"
                          />
                        ) : (
                          <span className="text-slate-500 font-mono">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          value={rec.ttl}
                          onChange={(e) => handleDnsRecordFieldChange(index, 'ttl', parseInt(e.target.value) || 3600)}
                          className="w-20 px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white text-center focus:outline-none focus:border-brand-mint font-mono"
                        />
                      </td>
                      <td className="p-4">
                        {['A', 'AAAA', 'CNAME'].includes(rec.type) ? (
                          <input
                            type="checkbox"
                            checked={rec.proxied}
                            onChange={(e) => handleDnsRecordFieldChange(index, 'proxied', e.target.checked)}
                            className="rounded bg-brand-plum-dark border-white/10 text-brand-mint focus:ring-brand-mint cursor-pointer"
                          />
                        ) : (
                          <span className="text-slate-500 font-mono">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowDnsReviewModal(false);
                  setDnsReviewData(null);
                }}
                className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-all cursor-pointer text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmProvision}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-brand-mint text-brand-plum-dark hover:bg-opacity-90 font-bold transition-all cursor-pointer text-sm shadow-lg flex items-center justify-center disabled:opacity-50"
              >
                {loading ? 'Confirming...' : 'Confirm & Push to Cloudflare'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provisioning Live Stepper Overlay */}
      {showProvisioningModal && trackedProvisioningDomain && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border-2 border-white/10 rounded-3xl p-8 w-full max-w-xl shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold bg-brand-mint/10 text-brand-mint border border-brand-mint/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {isFinished ? (isSuccess ? 'Provisioned Successfully' : 'Provisioning Failed') : 'Provisioning Active'}
                </span>
                <h3 className="text-2xl font-black text-white tracking-tight mt-3">
                  {trackedProvisioningDomain}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Mail Server Infrastructure Provisioning Pipeline
                </p>
              </div>
              {!isFinished && (
                <div className="p-2 bg-white/5 rounded-full animate-spin border border-white/10">
                  <RefreshCw className="w-5 h-5 text-brand-mint" />
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Overall Progress</span>
                <span className="text-brand-mint">{getProgressPercent()}%</span>
              </div>
              <div className="w-full h-3 bg-brand-plum-dark rounded-full overflow-hidden border border-white/5 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    isFailed ? 'bg-red-500' : 'bg-brand-mint'
                  }`}
                  style={{ width: `${getProgressPercent()}%` }}
                ></div>
              </div>
            </div>

            {/* Stepper Steps */}
            <div className="space-y-4 pt-2">
              {STEP_ORDER.map((code, index) => {
                const status = getStepStatus(code);
                let indicator;
                let textColor;
                
                if (status === 'success') {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-mint/20 border border-brand-mint text-brand-mint flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 stroke-[3px]" /></div>;
                  textColor = 'text-white font-semibold';
                } else if (status === 'failed') {
                  indicator = <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500 text-red-500 flex items-center justify-center shrink-0"><X className="w-3.5 h-3.5 stroke-[3px]" /></div>;
                  textColor = 'text-red-400 font-bold';
                } else if (status === 'running') {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-mint/10 border-2 border-brand-mint border-t-transparent animate-spin shrink-0"></div>;
                  textColor = 'text-brand-mint font-bold animate-pulse';
                } else if (status === 'aborted') {
                  indicator = <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center shrink-0"><X className="w-3.5 h-3.5" /></div>;
                  textColor = 'text-slate-500 line-through';
                } else {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-plum-dark border border-white/10 text-slate-500 flex items-center justify-center shrink-0 text-xs font-bold">{index + 1}</div>;
                  textColor = 'text-slate-500';
                }

                return (
                  <div key={code} className="flex items-start gap-4">
                    {indicator}
                    <div className="space-y-0.5">
                      <span className={`text-sm ${textColor}`}>{getStepLabel(code)}</span>
                      <p className="text-xs text-slate-400">{getStepDesc(code)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rollback Details */}
            {rollbackLogs.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Security Rollback Active
                </h4>
                <p className="text-xs text-slate-300">
                  To prevent a half-configured state, the system is automatically reversing all changes:
                </p>
                <div className="space-y-1 font-mono text-[10px] text-slate-400">
                  {rollbackLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-red-400" />
                      <span>{l.details}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message Box */}
            {isFailed && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-1">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Pipeline Failure Error
                </span>
                <p className="text-xs text-slate-300 font-mono">
                  {latestLog ? latestLog.details : 'An unexpected exception halted the provisioning sequence.'}
                </p>
              </div>
            )}

            {/* Success Credentials Card */}
            {isSuccess && getAdminCredentials() && (
              <div className="bg-brand-mint/10 border border-brand-mint/20 rounded-2xl p-6 space-y-4 animate-scale-up">
                <div className="flex items-center gap-2 text-brand-mint">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-wider">Default Admin Credentials</span>
                </div>
                <p className="text-xs text-slate-300">
                  These temporary credentials have been created automatically. Copy the password now to log in:
                </p>
                <div className="space-y-2.5 bg-brand-plum-dark border border-white/5 p-4 rounded-xl font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Username:</span>
                    <span className="text-white font-bold">{getAdminCredentials().email}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-white/5 pt-2.5">
                    <span className="text-slate-400">Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-mint font-bold select-all">{getAdminCredentials().password}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(getAdminCredentials().password);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                        title="Copy Password"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-brand-mint" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            {isFinished && (
              <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowProvisioningModal(false);
                    setTrackedProvisioningDomain(null);
                  }}
                  className="bg-white text-slate-950 hover:bg-slate-100 font-bold px-6 py-3 rounded-full text-sm transition-all cursor-pointer"
                >
                  {isSuccess ? 'Get Started' : 'Close Dashboard'}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Add Mailbox User Modal */}
      {showAddUserModal && selectedDomain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Create Mailbox</h3>
            <form onSubmit={handleAddMailbox} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Username</label>
                <div className="flex items-center bg-brand-plum-dark border border-white/10 rounded-xl overflow-hidden focus-within:border-brand-mint">
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. info" 
                    value={newMailboxLocal}
                    onChange={(e) => setNewMailboxLocal(e.target.value)}
                    className="flex-1 px-4 py-3 bg-transparent text-white focus:outline-none text-right pr-2"
                  />
                  <span className="px-4 py-3 text-slate-400 bg-white/2 border-l border-white/5 font-semibold text-sm">@{selectedDomain.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. John Doe" 
                  value={newMailboxName}
                  onChange={(e) => setNewMailboxName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      required
                      readOnly
                      placeholder="Click Generate to set password" 
                      value={newMailboxPwd}
                      className="w-full pl-4 pr-10 py-3 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm font-medium font-mono cursor-not-allowed select-all"
                    />
                    {newMailboxPwd && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newMailboxPwd);
                          setSuccessMsg("Password copied to clipboard!");
                        }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy password to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pwd = generateSecurePassword();
                      setNewMailboxPwd(pwd);
                      navigator.clipboard.writeText(pwd);
                      setSuccessMsg("Generated secure password and copied to clipboard!");
                    }}
                    className="px-4 py-3 bg-brand-mint text-slate-950 font-bold border-2 border-slate-950 rounded-xl shadow-[2px_2px_0_#151214] hover:bg-brand-mint-hover transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5 active:shadow-none text-xs"
                    title="Generate secure password"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Create Mailbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Alias Modal */}
      {showAddAliasModal && selectedDomain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Create Email Alias</h3>
            <form onSubmit={handleAddAlias} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Source (Forward From)</label>
                <div className="flex items-center bg-brand-plum-dark border border-white/10 rounded-xl overflow-hidden focus-within:border-brand-mint">
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. sales" 
                    value={newAliasSource}
                    onChange={(e) => setNewAliasSource(e.target.value)}
                    className="flex-1 px-4 py-3 bg-transparent text-white focus:outline-none text-right pr-2"
                  />
                  <span className="px-4 py-3 text-slate-400 bg-white/2 border-l border-white/5 font-semibold text-sm">@{selectedDomain.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Destination (Forward To)</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. inbox@external.com" 
                  value={newAliasDest}
                  onChange={(e) => setNewAliasDest(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddAliasModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Create Alias
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Alias Modal */}
      {editingAlias && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Edit Email Alias</h3>
            <form onSubmit={handleUpdateAlias} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Source</label>
                <input 
                  type="text" 
                  disabled
                  value={editingAlias.source}
                  className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/5 rounded-xl text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Destination (Forward To)</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. inbox@external.com" 
                  value={editAliasDest}
                  onChange={(e) => setEditAliasDest(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setEditingAlias(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
