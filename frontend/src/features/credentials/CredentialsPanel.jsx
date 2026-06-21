import { useState } from 'react';
import { 
  ArrowLeft, Sliders, Mail, Plus, Edit, Edit2, Trash2, Cloud, CloudOff, RefreshCw, Lock, Search
} from 'lucide-react';
import { formatDateOnly } from '../../shared/lib/helpers';



export function CredentialsPanel({
  // Functional props (remain unchanged)
  isMatched,
  getMatchedDomain,
  handleScanZoneOwnership = () => {},
  fetchDnsRecords = () => {},
  handleSelectDomain = () => {},
  handleDeleteCredential = () => {},
  handleDeleteDnsRecord = () => {},
  handleEditDnsRecord = () => {},
  showConfirm = ({ onConfirm } = {}) => { if (typeof onConfirm === 'function') onConfirm(); },
  hasPermission = () => false,
  groupedZones = {},

  // Props previously sourced from Zustand store
  credentials,
  setCredentials,
  loading,
  setLoading,
  cfZoneSearchQuery,
  setCfZoneSearchQuery,
  cfZoneStatusFilter,
  setCfZoneStatusFilter,
  cfAccountFilter,
  setCfAccountFilter,
  setNewCredEmail,
  showAddCredModal,
  setShowAddCredModal,
  editingCredential,
  setEditingCredential,
  editCredLabel,
  setEditCredLabel,
  editCredEmail,
  setEditCredEmail,
  editCredKey,
  setEditCredKey,
  showEditCredModal,
  setShowEditCredModal,
  setSelectedCredential,
  setSelectedZone,
  setSelectedDomain,
  setActiveTab,
  setNewDomainName,
  setSelectedCredId,
  setSelectedPlanId,
  setShowAddDomainModal,
  selectedZone,
  dnsRecordType,
  setDnsRecordType,
  dnsRecordName,
  setDnsRecordName,
  dnsRecordContent,
  setDnsRecordContent,
  dnsRecordPriority,
  setDnsRecordPriority,
  dnsRecordProxied,
  setDnsRecordProxied,
  dnsRecordTtl,
  setDnsRecordTtl,
  showAddDnsRecordModal,
  setShowAddDnsRecordModal,
  zoneDnsRecords,
  setEditingDnsRecord,
  setShowEditDnsRecordModal
}) {
  if (selectedZone) {
    return (
      <div className="space-y-6">
        {/* DNS Records Panel for Selected Zone */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-plum p-6 rounded-2xl border border-white/5">
          <div className="space-y-2">
            <button
              onClick={() => {
                setSelectedZone(null);
                setSelectedCredential(null);
                window.history.pushState(null, '', '/credentials');
              }}
              className="flex items-center gap-1.5 text-xs text-brand-mint hover:underline font-bold bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Domains Directory
            </button>
            
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white tracking-tight">DNS Settings: {selectedZone.name}</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                selectedZone.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {selectedZone.status}
              </span>
            </div>
            <p className="text-slate-400 text-xs font-medium">
              Cloudflare Account: <span className="font-mono text-slate-300">{selectedZone.cf_email}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3 self-end md:self-center">
            {isMatched(selectedZone.name) ? (
              <button
                onClick={() => {
                  const dom = getMatchedDomain(selectedZone.name);
                  setSelectedDomain(dom);
                  setActiveTab('domains');
                  window.history.pushState(null, '', `/domains?domain=${dom.name}`);
                  handleSelectDomain(dom);
                }}
                className="bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
              >
                <Mail className="w-3.5 h-3.5" />
                Manage Mailboxes
              </button>
            ) : (
              <button
                onClick={() => {
                  setNewDomainName(selectedZone.name);
                  setSelectedCredId(selectedZone.credential_id);
                  setSelectedPlanId('');
                  setActiveTab('domains');
                  setShowAddDomainModal(true);
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision Mail Server
              </button>
            )}
            
            {hasPermission('credentials:create') && (
              <button
                onClick={() => {
                  setDnsRecordType('A');
                  setDnsRecordName('');
                  setDnsRecordContent('');
                  setDnsRecordPriority('');
                  setDnsRecordProxied(false);
                  setDnsRecordTtl('3600');
                  setShowAddDnsRecordModal(true);
                }}
                className="bg-brand-yellow hover:bg-brand-yellow-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                Add Record
              </button>
            )}
          </div>
        </div>

        {/* Table of records */}
        <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
          <div className="px-4 py-3 border-b border-white/5 bg-white/2 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand-yellow" />
            <h3 className="text-sm font-bold text-white">Active DNS Records</h3>
          </div>
          
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-brand-plum/10">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
              Loading DNS records from Cloudflare...
            </div>
          ) : zoneDnsRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/2">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">Type</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-1/4">Name</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-2/5">Content</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">TTL</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">Proxy</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneDnsRecords.map(rec => {
                    const isMXSystem = rec.type === 'MX' && rec.content.includes('mail.zimprices.co.zw');
                    const isSPF = rec.type === 'TXT' && rec.content.includes('v=spf1');
                    const isDKIM = rec.type === 'TXT' && rec.name.includes('_domainkey');
                    const isDMARC = rec.type === 'TXT' && rec.name.includes('_dmarc');
                    const isMailServerHost = (rec.type === 'A' || rec.type === 'AAAA' || rec.type === 'CNAME') && rec.name === `mail.${selectedZone.name}`;
                    const isSystemRecord = isMXSystem || isSPF || isDKIM || isDMARC || isMailServerHost;
                    
                    return (
                      <tr key={rec.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider font-mono ${
                            rec.type === 'MX' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                            rec.type === 'TXT' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            rec.type === 'CNAME' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-brand-mint/10 text-brand-mint border border-brand-mint/20'
                          }`}>
                            {rec.type}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-bold text-white font-mono break-all">{rec.name}</td>
                        <td className="p-4 text-sm text-slate-300 font-mono break-all">
                          {rec.priority !== undefined && rec.priority !== null ? `[${rec.priority}] ` : ''}
                          {rec.content}
                        </td>
                        <td className="p-4 text-xs text-slate-400 font-mono">
                          {rec.ttl === 1 ? 'Auto' : `${rec.ttl}s`}
                        </td>
                        <td className="p-4">
                          {rec.proxied ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500" title="Proxied through Cloudflare">
                              <Cloud className="w-3.5 h-3.5 fill-amber-500/20" />
                              Proxied
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500" title="DNS Only">
                              <CloudOff className="w-3.5 h-3.5" />
                              DNS Only
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {isSystemRecord && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/20 text-[9px] font-bold uppercase tracking-wider" title="Critical mail system record. Modify with caution.">
                                <Lock className="w-2.5 h-2.5" />
                                Protected
                              </span>
                            )}
                            {hasPermission('credentials:create') && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingDnsRecord(rec);
                                    setDnsRecordType(rec.type);
                                    setDnsRecordName(rec.name);
                                    setDnsRecordContent(rec.content);
                                    setDnsRecordPriority(rec.priority !== undefined && rec.priority !== null ? String(rec.priority) : '');
                                    setDnsRecordProxied(rec.proxied || false);
                                    setDnsRecordTtl(String(rec.ttl));
                                    
                                    if (isSystemRecord) {
                                      showConfirm({
                                        title: 'Edit Protected DNS Record?',
                                        message: `Warning: ${rec.type} record for '${rec.name}' is a system-critical mail record. Modifying it may disrupt email flow. Are you sure you want to edit it?`,
                                        confirmLabel: 'Proceed to Edit',
                                        tone: 'warning',
                                        onConfirm: () => setShowEditDnsRecordModal(true)
                                      });
                                    } else {
                                      setShowEditDnsRecordModal(true);
                                    }
                                  }}
                                  className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none"
                                  title="Edit Record"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    const performDelete = () => handleDeleteDnsRecord(rec.id);
                                    
                                    showConfirm({
                                      title: isSystemRecord ? 'DELETE SYSTEM-CRITICAL DNS RECORD?' : 'Delete DNS record?',
                                      message: isSystemRecord 
                                        ? `CRITICAL WARNING: You are about to delete a system-managed mail record (${rec.type} ${rec.name}). THIS WILL DISRUPT EMAIL SERVICES for this domain. Are you absolutely certain you want to proceed?`
                                        : `Are you sure you want to delete this ${rec.type} record for '${rec.name}'?`,
                                      confirmLabel: 'Delete Record',
                                      tone: 'danger',
                                      onConfirm: performDelete
                                    });
                                  }}
                                  className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 bg-brand-plum/10">
              No DNS records found for this zone.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Cloudflare Credentials</h2>
          <p className="text-slate-400 text-sm mt-1">Manage global api credentials used to securely generate tokens for DNS updates.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={handleScanZoneOwnership} disabled={loading} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Scan Zones
          </button>
          <button type="button" onClick={() => { setNewCredEmail('gbdzoma@gmail.com'); setShowAddCredModal(true); }} className="bg-brand-yellow hover:bg-brand-yellow-hover text-brand-plum font-bold text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-all cursor-pointer border-none">
            <Plus className="w-4 h-4 stroke-[3px]" />
            Add Credential
          </button>
        </div>
      </div>

      <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/2">
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Label</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CF Email Account</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Created</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.length > 0 ? (
              credentials.map(c => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="p-4 text-sm font-bold text-white">{c.label}</td>
                  <td className="p-4 text-sm text-slate-300 font-mono">{c.email}</td>
                  <td className="p-4 text-xs text-slate-400">{formatDateOnly(c.created_at)}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { setEditingCredential(c); setEditCredLabel(c.label); setEditCredEmail(c.email); setEditCredKey(''); setShowEditCredModal(true); }} className="text-brand-mint hover:text-white p-2 rounded-lg hover:bg-brand-mint/10 transition-colors bg-transparent border-none cursor-pointer" title="Edit Credential / Rotate Key">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDeleteCredential(c.id)} className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition-colors bg-transparent border-none cursor-pointer" title="Delete Credential">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="4" className="p-8 text-center text-slate-400">No credentials added.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-6 pt-6 border-t border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Cloudflare Domains Directory</h3>
            <p className="text-slate-400 text-xs mt-0.5">Explore zones from all Cloudflare accounts, check local mail configurations, and manage DNS settings.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search domains..." value={cfZoneSearchQuery} onChange={(e) => setCfZoneSearchQuery(e.target.value)} className="pl-8 pr-4 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint w-44" />
            </div>
            <select value={cfZoneStatusFilter} onChange={(e) => setCfZoneStatusFilter(e.target.value)} className="px-3 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint cursor-pointer">
              <option value="all">All Console Status</option>
              <option value="matched">Matched (Mail Enabled)</option>
              <option value="unmatched">Unmatched (Not Configured)</option>
            </select>
            <select value={cfAccountFilter} onChange={(e) => setCfAccountFilter(e.target.value)} className="px-3 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint cursor-pointer">
              <option value="all">All Accounts</option>
              {credentials.map(c => (<option key={c.id} value={c.id}>{c.label} ({c.email})</option>))}
            </select>
          </div>
        </div>

        {Object.keys(groupedZones || {}).length > 0 ? (
          Object.keys(groupedZones || {}).map(accountKey => {
            const zonesInGroup = (groupedZones || {})[accountKey];
            return (
              <div key={accountKey} className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-brand-mint" />
                    <h4 className="text-sm font-bold text-white">{accountKey}</h4>
                    <span className="text-[10px] bg-brand-plum-dark text-slate-400 font-bold px-2 py-0.5 rounded border border-white/5">
                      {zonesInGroup.length} zone{zonesInGroup.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {zonesInGroup.map(zone => {
                    const matched = isMatched(zone.name);
                    const localDomain = getMatchedDomain(zone.name);
                    return (
                      <div key={zone.zone_id} className={`rounded-xl p-4 flex flex-col justify-between space-y-4 hover:-translate-y-0.5 transition-all shadow-md ${matched ? 'bg-brand-plum-dark/60 border border-white/5 hover:border-brand-mint/20' : 'bg-red-950/20 border border-red-500/40 hover:border-red-400/70 shadow-[0_0_0_1px_rgba(239,68,68,0.14)]'}`}>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-sm font-bold text-white tracking-tight truncate max-w-[150px]" title={zone.name}>{zone.name}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${zone.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{zone.status}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-semibold">Console Match:</span>
                            {matched ? <span className="text-[10px] font-bold text-brand-mint">Mail Server Configured</span> : <span className="text-[10px] font-black uppercase tracking-wider text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">Orphan Zone</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          <button onClick={() => { const matchingCred = credentials.find(c => c.id === zone.credential_id); setSelectedCredential(matchingCred); setSelectedZone(zone); window.history.pushState(null, '', `/credentials?cred_id=${zone.credential_id}&zone_id=${zone.zone_id}`); fetchDnsRecords(zone.credential_id, zone.zone_id); }} className="flex-1 py-1.5 bg-brand-purple hover:bg-brand-purple/80 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border-none">
                            <Sliders className="w-3 h-3" /> DNS Records
                          </button>
                          {matched ? <button onClick={() => { setSelectedDomain(localDomain); setActiveTab('domains'); window.history.pushState(null, '', `/domains?domain=${localDomain.name}`); handleSelectDomain(localDomain); }} className="py-1.5 px-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border-none" title="Manage Mailboxes / Add Emails"><Mail className="w-3 h-3" /> Emails</button> : <button onClick={() => { setNewDomainName(zone.name); setSelectedCredId(zone.credential_id); setSelectedPlanId(''); setActiveTab('domains'); setShowAddDomainModal(true); }} className="py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1" title="Provision Mail Server"><Plus className="w-3 h-3" /> Provision</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="glassmorphism-card rounded-2xl p-8 text-center text-slate-400 border border-white/5">No Cloudflare zones found matching the current filters.</div>
        )}
      </div>
    </div>
  );
}
