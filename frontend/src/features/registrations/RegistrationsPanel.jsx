import { useState, useEffect } from 'react';
import { Shield, RefreshCw, AlertTriangle, Sparkles, CheckCircle2, Trash2, Check } from 'lucide-react';
import { formatDateTime } from '../../shared/lib/helpers';
import { api } from '../../shared/api/client';

export function RegistrationsPanel({ credentials, hasPermission }) {
  // State variables for Registrations Panel
  const [isBulkReg, setIsBulkReg] = useState(false);
  const [regAction, setRegAction] = useState('N');
  const [searchResult, setSearchResult] = useState(null);
  const [cfResult, setCfResult] = useState(null);
  const [searchDomainName, setSearchDomainName] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [cfCredentialId, setCfCredentialId] = useState('');
  const [cfLoading, setCfLoading] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerOrg, setOwnerOrg] = useState('Civil Engineering Projects');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerFax, setOwnerFax] = useState('None');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [ownerCity, setOwnerCity] = useState('Harare');
  const [ownerCountry, setOwnerCountry] = useState('Zimbabwe');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [bulkDomainsInput, setBulkDomainsInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [regFilter, setRegFilter] = useState('all');
  const [registrations, setRegistrations] = useState([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchRegistrations = async () => {
    try {
      const data = await api.get('/registrations');
      setRegistrations(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  // Auto-clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  const handleCheckDomain = async (e) => {
    e.preventDefault();
    if (!searchDomainName) return;
    setSearchLoading(true);
    setSearchResult(null);
    setCfResult(null);
    setErrorMsg('');
    try {
      const data = await api.post('/registrations/check-domain', { domain: searchDomainName });
      setSearchResult(data);
      if (data.exists) {
        setErrorMsg(`Domain ${searchDomainName} already exists on public DNS or locally.`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to check domain availability.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddCloudflare = async (e) => {
    e.preventDefault();
    if (!searchDomainName || !cfCredentialId) return;
    setCfLoading(true);
    setCfResult(null);
    setErrorMsg('');
    try {
      const data = await api.post('/registrations/add-cloudflare', { 
        domain: searchDomainName, 
        credential_id: parseInt(cfCredentialId) 
      });
      setCfResult(data);
      if (data.default_owner) {
        setOwnerName(data.default_owner.owner_name || '');
        setOwnerOrg(data.default_owner.owner_org || 'Civil Engineering Projects');
        setOwnerAddress(data.default_owner.owner_address || '');
        setOwnerCity(data.default_owner.owner_city || 'Harare');
        setOwnerCountry(data.default_owner.owner_country || 'Zimbabwe');
        setOwnerPhone(data.default_owner.owner_phone || '');
        setOwnerFax(data.default_owner.owner_fax || 'None');
        setOwnerEmail(data.default_owner.owner_email || '');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to retrieve Cloudflare zone configuration.');
    } finally {
      setCfLoading(false);
    }
  };

  const handleSubmitRegistration = async (e) => {
    e.preventDefault();
    if (!searchDomainName || !cfResult) return;
    setSubmitLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = {
        domain_name: searchDomainName,
        action: regAction,
        cf_email: credentials.find(c => c.id === parseInt(cfCredentialId))?.email || null,
        owner_name: ownerName,
        owner_org: ownerOrg,
        owner_address: ownerAddress,
        owner_city: ownerCity,
        owner_country: ownerCountry,
        owner_phone: ownerPhone,
        owner_fax: ownerFax,
        owner_email: ownerEmail,
        zone_id: cfResult.zone_id,
        ns1_hostname: cfResult.ns1_hostname,
        ns1_ip: cfResult.ns1_ip,
        ns2_hostname: cfResult.ns2_hostname,
        ns2_ip: cfResult.ns2_ip,
        credential_id: parseInt(cfCredentialId)
      };
      await api.post('/registrations/submit', payload);
      setSuccessMsg(`ZISPA application email sent for ${searchDomainName}!`);
      setSearchDomainName('');
      setSearchResult(null);
      setCfResult(null);
      fetchRegistrations();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit registration.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleResendRegistrationEmail = async (id) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post(`/registrations/${id}/email-template`);
      setSuccessMsg(`ZISPA application email resent successfully!`);
      fetchRegistrations();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to resend registration email.');
    }
  };

  const handleDeleteRegistration = async (id) => {
    if (!window.confirm("Are you sure you want to delete this registration record?")) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.delete(`/registrations/${id}`);
      setSuccessMsg(`Registration record deleted.`);
      fetchRegistrations();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete registration.');
    }
  };

  const handlePollRegistration = async (id, silent = false) => {
    if (!silent) {
      setErrorMsg('');
      setSuccessMsg('');
    }
    try {
      const data = await api.post(`/registrations/${id}/poll`);
      if (data.status === 'active') {
        if (!silent) setSuccessMsg(`Domain ${data.domain_name} has resolved successfully and is now active!`);
      } else {
        if (!silent) setErrorMsg(`Domain ${data.domain_name} is still not resolving on public DNS (status: ${data.status}).`);
      }
      fetchRegistrations();
    } catch (err) {
      if (!silent) setErrorMsg(err.message || 'Failed to check domain DNS resolution.');
    }
  };

  const handlePollAllRegistrations = async () => {
    setErrorMsg('');
    setSuccessMsg('Started checking DNS resolution for all pending domains...');
    const pending = registrations.filter(r => r.status !== 'active');
    if (pending.length === 0) {
      setSuccessMsg('No pending domain registrations found.');
      return;
    }
    let activatedCount = 0;
    for (const r of pending) {
      try {
        const data = await api.post(`/registrations/${r.id}/poll`);
        if (data.status === 'active') {
          activatedCount++;
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchRegistrations();
    setSuccessMsg(`Completed checking DNS resolution. ${activatedCount} domain(s) activated!`);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setBulkResult(null);

    const domains = bulkDomainsInput
      .split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0);

    if (domains.length === 0) {
      setErrorMsg('Please enter at least one domain name.');
      return;
    }

    if (!cfCredentialId) {
      setErrorMsg('Please select a Cloudflare credential.');
      return;
    }

    setBulkLoading(true);

    try {
      const payload = {
        domains,
        credential_id: parseInt(cfCredentialId),
        action: regAction,
        owner_name: ownerName,
        owner_org: ownerOrg,
        owner_address: ownerAddress,
        owner_city: ownerCity,
        owner_country: ownerCountry,
        owner_phone: ownerPhone,
        owner_fax: ownerFax,
        owner_email: ownerEmail
      };

      const data = await api.post('/registrations/bulk', payload);
      setBulkResult(data);
      setSuccessMsg(`Bulk processing complete! Success: ${data.success_count}, Failed: ${data.failed_count}.`);
      setBulkDomainsInput('');
      fetchRegistrations();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to process bulk registration.');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Banner Messages */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in shrink-0">
          <Check className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-rose-400" />
            Domain Registration Console
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Register, transfer, or modify Zimbabwean .CO.ZW sub-domains using automated ZISPA templates.
          </p>
        </div>
      </div>

      {/* Form & Checker Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left & Middle Column: Interactive Form Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-6">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">1</span>
              Search Domain & Link DNS
            </h3>

            {/* Mode Toggle */}
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 text-xs w-fit">
              <button
                type="button"
                onClick={() => {
                  setIsBulkReg(false);
                  setRegAction('N');
                  setSearchResult(null);
                  setCfResult(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  !isBulkReg
                    ? 'bg-rose-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Domain Check
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBulkReg(true);
                  setRegAction('bulk_edit');
                  setSearchResult(null);
                  setCfResult(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  isBulkReg
                    ? 'bg-rose-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bulk Edit
              </button>
            </div>

            {!isBulkReg ? (
              <>
                {/* Step 1: Availability Check */}
                <form onSubmit={handleCheckDomain} className="space-y-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Domain Name (e.g. example.co.zw)
                  </label>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. yourbusiness.co.zw" 
                      value={searchDomainName}
                      onChange={(e) => {
                        setSearchDomainName(e.target.value);
                        setSearchResult(null);
                        setCfResult(null);
                      }}
                      className="flex-1 px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 font-mono text-sm"
                    />
                    <button
                      type="submit"
                      disabled={searchLoading}
                      className="px-6 py-3 bg-brand-yellow text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center gap-2 cursor-pointer"
                    >
                      {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Check'}
                    </button>
                  </div>
                </form>

                {/* Check Result */}
                {searchResult && (
                  <div className={`p-4 rounded-xl border ${
                    !searchResult.is_valid || searchResult.exists 
                      ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  } text-sm flex items-start gap-3`}>
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        {!searchResult.is_valid
                          ? `Invalid Domain Name: ${searchResult.error_message}`
                          : searchResult.exists 
                          ? `Domain "${searchResult.domain}" is registered or exists.` 
                          : `Domain "${searchResult.domain}" is available for registration!`
                        }
                      </p>
                      {searchResult.is_valid && !searchResult.exists && (
                        <p className="text-slate-300 text-xs mt-1">
                          Proceed to Cloudflare configuration below to retrieve Nameservers and resolve IPs.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Cloudflare Credential selection */}
                {searchResult && searchResult.is_valid && !searchResult.exists && (
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
                      <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">2</span>
                      DNS & Cloudflare Setup
                    </h3>

                    <form onSubmit={handleAddCloudflare} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Select Cloudflare Credentials
                        </label>
                        <select
                          required
                          value={cfCredentialId}
                          onChange={(e) => setCfCredentialId(e.target.value)}
                          className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                        >
                          <option value="">-- Choose Credential --</option>
                          {credentials.map(c => (
                            <option key={c.id} value={c.id}>{c.label} ({c.email})</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={cfLoading || !cfCredentialId}
                        className="px-6 py-3 bg-brand-mint text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Retrieve DNS Details'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Step 3: ZISPA Form Details */}
                {cfResult && (
                  <div className="space-y-6 pt-4 border-t border-white/5">
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
                      <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">3</span>
                      ZISPA Registration Info
                    </h3>

                    <form onSubmit={handleSubmitRegistration} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Action</label>
                          <select
                            value={regAction}
                            onChange={(e) => setRegAction(e.target.value)}
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          >
                            <option value="N">New Registration</option>
                            <option value="M">Modification</option>
                            <option value="T">Transfer</option>
                            <option value="D">Delete</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Name</label>
                          <input 
                            type="text" 
                            required 
                            value={ownerName}
                            onChange={(e) => setOwnerName(e.target.value)}
                            placeholder="e.g. John Doe"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Organisation</label>
                          <input 
                            type="text" 
                            value={ownerOrg}
                            onChange={(e) => setOwnerOrg(e.target.value)}
                            placeholder="e.g. Civil Engineering Projects"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Email</label>
                          <input 
                            type="email" 
                            required 
                            value={ownerEmail}
                            onChange={(e) => setOwnerEmail(e.target.value)}
                            placeholder="e.g. owner@example.com"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Phone</label>
                          <input 
                            type="text" 
                            required 
                            value={ownerPhone}
                            onChange={(e) => setOwnerPhone(e.target.value)}
                            placeholder="e.g. +263777000000"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Fax</label>
                          <input 
                            type="text" 
                            value={ownerFax}
                            onChange={(e) => setOwnerFax(e.target.value)}
                            placeholder="None"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Address</label>
                        <textarea 
                          required 
                          rows="2"
                          value={ownerAddress}
                          onChange={(e) => setOwnerAddress(e.target.value)}
                          placeholder="e.g. 123 Samora Machel Avenue"
                          className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                          <input 
                            type="text" 
                            required 
                            value={ownerCity}
                            onChange={(e) => setOwnerCity(e.target.value)}
                            placeholder="Harare"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Country</label>
                          <input 
                            type="text" 
                            required 
                            value={ownerCountry}
                            onChange={(e) => setOwnerCountry(e.target.value)}
                            placeholder="Zimbabwe"
                            className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>
                      </div>

                      {/* Nameserver readout info */}
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2 text-xs">
                        <div className="font-bold text-slate-300 font-sans">Resolved Nameservers:</div>
                        <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono">
                          <div>NS1: {cfResult.ns1_hostname || 'None'}</div>
                          <div>IP: {cfResult.ns1_ip || 'Unresolved'}</div>
                          <div>NS2: {cfResult.ns2_hostname || 'None'}</div>
                          <div>IP: {cfResult.ns2_ip || 'Unresolved'}</div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitLoading}
                        className="w-full py-3 bg-brand-pink text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {submitLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Submit ZISPA Email Application'}
                      </button>
                    </form>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Domains list (one per line, max 50)
                  </label>
                  <textarea
                    rows="5"
                    required
                    placeholder="e.g.&#10;domain1.co.zw&#10;domain2.co.zw"
                    value={bulkDomainsInput}
                    onChange={(e) => setBulkDomainsInput(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Select Cloudflare Credentials
                    </label>
                    <select
                      required
                      value={cfCredentialId}
                      onChange={(e) => setCfCredentialId(e.target.value)}
                      className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                    >
                      <option value="">-- Choose Credential --</option>
                      {credentials.map(c => (
                        <option key={c.id} value={c.id}>{c.label} ({c.email})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Action Type
                    </label>
                    <select
                      value={regAction}
                      onChange={(e) => setRegAction(e.target.value)}
                      className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                    >
                      <option value="bulk_edit">Bulk Edit (Nameservers)</option>
                      <option value="T">Transfer (T)</option>
                      <option value="M">Modify (M)</option>
                      <option value="N">New Registration (N)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Owner Information Details</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Name</label>
                      <input 
                        type="text" 
                        required 
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Organization</label>
                      <input 
                        type="text" 
                        value={ownerOrg}
                        onChange={(e) => setOwnerOrg(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Email</label>
                      <input 
                        type="email" 
                        required 
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder="e.g. owner@example.co.zw"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Phone</label>
                      <input 
                        type="text" 
                        required 
                        value={ownerPhone}
                        onChange={(e) => setOwnerPhone(e.target.value)}
                        placeholder="e.g. +263777000000"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Address</label>
                    <textarea 
                      required 
                      rows="2"
                      value={ownerAddress}
                      onChange={(e) => setOwnerAddress(e.target.value)}
                      placeholder="e.g. 123 Samora Machel Avenue"
                      className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                      <input 
                        type="text" 
                        required 
                        value={ownerCity}
                        onChange={(e) => setOwnerCity(e.target.value)}
                        placeholder="Harare"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Country</label>
                      <input 
                        type="text" 
                        required 
                        value={ownerCountry}
                        onChange={(e) => setOwnerCountry(e.target.value)}
                        placeholder="Zimbabwe"
                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="w-full py-3 bg-brand-pink text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {bulkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Process Bulk Application'}
                </button>

                {/* Bulk Results Readout */}
                {bulkResult && (
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-sm space-y-2 mt-4 text-slate-300">
                    <div className="font-bold text-white">Bulk Process Results:</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Success Count: <span className="text-emerald-400 font-bold">{bulkResult.success_count}</span></div>
                      <div>Failed Count: <span className="text-red-400 font-bold">{bulkResult.failed_count}</span></div>
                      <div>Groups Created: <span className="text-blue-400 font-bold">{bulkResult.groups_created}</span></div>
                    </div>
                    {bulkResult.failed_domains && bulkResult.failed_domains.length > 0 && (
                      <div className="pt-2 border-t border-white/5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Failed/Skipped Domains:</div>
                        <ul className="list-disc list-inside text-xs text-red-300 font-mono space-y-0.5 max-h-32 overflow-y-auto">
                          {bulkResult.failed_domains.map((fd, idx) => (
                            <li key={idx}>{fd}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Information & Help Panel */}
        <div className="space-y-6">
          <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
            <h4 className="font-bold text-white text-md flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-yellow" />
              ZISPA Guidelines
            </h4>
            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                Zimbabwean <strong>.co.zw</strong> domain registrations are managed via plain ASCII templates submitted to the registrar via email.
              </p>
              <p className="border-l-2 border-brand-yellow pl-2 py-0.5 text-slate-400">
                Our system automates this by linking the domain to Cloudflare to allocate nameservers, checking resolution, generating the ASCII file, and dispatching it from <strong>dns@zimpricecheck.com</strong>.
              </p>
              <p>
                For testing and verification purposes, all registration applications are currently forwarded to <strong>garikaib@gmail.com</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Past Registrations List */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-xl font-extrabold text-white tracking-tight">Recent Registration Submissions</h3>
          <div className="flex items-center gap-3">
            {/* Filter tabs */}
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 text-xs">
              {['all', 'pending', 'active'].map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRegFilter(f)}
                  className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                    regFilter === f
                      ? 'bg-rose-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Poll All Button */}
            <button
              type="button"
              onClick={handlePollAllRegistrations}
              className="px-4 py-2 bg-brand-yellow text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[2px_2px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
              title="Query DNS for all pending registrations"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Verify All Pending
            </button>
          </div>
        </div>

        <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur z-10">
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Domain</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Submitted</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registrations.filter(r => {
                  if (regFilter === 'active') return r.status === 'active';
                  if (regFilter === 'pending') return r.status !== 'active';
                  return true;
                }).map(r => (
                  <tr key={r.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                    <td className="p-4">
                      <div className="font-semibold text-slate-200 font-mono">{r.domain_name}</div>
                      {r.error_message && (
                        <div className="text-[10px] text-red-400 mt-1 max-w-xs truncate" title={r.error_message}>
                          Err: {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-300">
                      {r.action === 'N' && 'New'}
                      {r.action === 'M' && 'Modify'}
                      {r.action === 'T' && 'Transfer'}
                      {r.action === 'D' && 'Delete'}
                    </td>
                    <td className="p-4 text-slate-300 font-sans">
                      <div>{r.owner_name}</div>
                      <div className="text-xs text-slate-500">{r.owner_org}</div>
                    </td>
                    <td className="p-4 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        r.status === 'active' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : r.status === 'submitted' 
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : r.status === 'failed'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 text-xs font-mono">
                      {formatDateTime(r.submitted_at)}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => handlePollRegistration(r.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer text-xs flex items-center gap-1 font-bold animate-pulse"
                            title="Verify if domain is active on DNS"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verify DNS
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResendRegistrationEmail(r.id)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1 font-bold"
                          title="Resend ZISPA template email"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRegistration(r.id)}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                          title="Delete Registration Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {registrations.filter(r => {
                  if (regFilter === 'active') return r.status === 'active';
                  if (regFilter === 'pending') return r.status !== 'active';
                  return true;
                }).length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400 font-sans">
                      No domain registrations matching this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
