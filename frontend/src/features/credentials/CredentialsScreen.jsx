// src/features/credentials/CredentialsScreen.jsx
import { useCredentialsController } from './useCredentialsController';
import { usePermissions } from '../../shared/lib/usePermissions';
import { CredentialsPanel } from './CredentialsPanel';
import { RefreshCw } from 'lucide-react';

export default function CredentialsScreen() {
  const { hasPermission } = usePermissions();
  
  const {
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

    // Local controller states
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

    // Domains helpers
    setSelectedDomain,
    setActiveTab,
    setNewDomainName,
    setSelectedCredId,
    setSelectedPlanId,
    setShowAddDomainModal,
  } = useCredentialsController();

  const isMatched = (zoneName) => domains.some(d => d.name === zoneName);
  const getMatchedDomain = (zoneName) => domains.find(d => d.name === zoneName);
  
  // Grouping and Filtering logic
  const groupedZones = {};
  const filteredZones = cloudflareZones.filter(z => {
    const matchesSearch = z.name.toLowerCase().includes(cfZoneSearchQuery.toLowerCase());
    const matchesLocal = isMatched(z.name);
    const matchesStatus = cfZoneStatusFilter === 'all' || 
      (cfZoneStatusFilter === 'matched' && matchesLocal) ||
      (cfZoneStatusFilter === 'unmatched' && !matchesLocal);
    const matchesAccount = cfAccountFilter === 'all' || cfAccountFilter === String(z.credential_id);
    return matchesSearch && matchesStatus && matchesAccount;
  });

  filteredZones.forEach(z => {
    const key = z.cf_email || 'Shared Account';
    if (!groupedZones[key]) groupedZones[key] = [];
    groupedZones[key].push(z);
  });

  return (
    <>
      <CredentialsPanel
        credentials={credentials}
        loading={loading}
        cfZoneSearchQuery={cfZoneSearchQuery}
        setCfZoneSearchQuery={setCfZoneSearchQuery}
        cfZoneStatusFilter={cfZoneStatusFilter}
        setCfZoneStatusFilter={setCfZoneStatusFilter}
        cfAccountFilter={cfAccountFilter}
        setCfAccountFilter={setCfAccountFilter}
        groupedZones={groupedZones}
        isMatched={isMatched}
        getMatchedDomain={getMatchedDomain}
        handleScanZoneOwnership={handleScanZoneOwnership}
        setNewCredEmail={setNewCredEmail}
        setShowAddCredModal={setShowAddCredModal}
        setEditingCredential={setEditingCredential}
        setEditCredLabel={setEditCredLabel}
        setEditCredEmail={setEditCredEmail}
        setEditCredKey={setEditCredKey}
        setShowEditCredModal={setShowEditCredModal}
        handleDeleteCredential={handleDeleteCredential}
        setSelectedCredential={setSelectedCredential}
        setSelectedZone={setSelectedZone}
        fetchDnsRecords={fetchDnsRecords}
        setSelectedDomain={setSelectedDomain}
        setActiveTab={setActiveTab}
        handleSelectDomain={handleSelectDomain => {}}
        setNewDomainName={setNewDomainName}
        setSelectedCredId={setSelectedCredId}
        setSelectedPlanId={setSelectedPlanId}
        setShowAddDomainModal={setShowAddDomainModal}
        selectedZone={selectedZone}
        dnsRecordType={dnsRecordType}
        setDnsRecordType={setDnsRecordType}
        dnsRecordName={dnsRecordName}
        setDnsRecordName={setDnsRecordName}
        dnsRecordContent={dnsRecordContent}
        setDnsRecordContent={setDnsRecordContent}
        dnsRecordPriority={dnsRecordPriority}
        setDnsRecordPriority={setDnsRecordPriority}
        dnsRecordProxied={dnsRecordProxied}
        setDnsRecordProxied={setDnsRecordProxied}
        dnsRecordTtl={dnsRecordTtl}
        setDnsRecordTtl={setDnsRecordTtl}
        showAddDnsRecordModal={showAddDnsRecordModal}
        setShowAddDnsRecordModal={setShowAddDnsRecordModal}
        zoneDnsRecords={zoneDnsRecords}
        handleDeleteDnsRecord={handleDeleteDnsRecord}
        handleEditDnsRecord={handleEditDnsRecord}
        showConfirm={({ onConfirm }) => onConfirm()}
        hasPermission={hasPermission}
        setEditingDnsRecord={setEditingDnsRecord}
        setShowEditDnsRecordModal={setShowEditDnsRecordModal}
      />

      {/* Add DNS Record Modal */}
      {showAddDnsRecordModal && selectedZone && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Add DNS Record</h3>
            <p className="text-slate-400 text-xs">Adding a record to zone <span className="font-mono text-slate-300">{selectedZone.name}</span></p>
            
            <form onSubmit={handleCreateDnsRecord} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                <select
                  value={dnsRecordType}
                  onChange={(e) => setDnsRecordType(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                >
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="TXT">TXT</option>
                  <option value="SRV">SRV</option>
                  <option value="CAA">CAA</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Name (use @ for root)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. @ or mail" 
                  value={dnsRecordName}
                  onChange={(e) => setDnsRecordName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Content (IPv4, target domain, text, etc.)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 192.0.2.1 or target.domain" 
                  value={dnsRecordContent}
                  onChange={(e) => setDnsRecordContent(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              {dnsRecordType === 'MX' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                  <input 
                    type="number" 
                    required
                    placeholder="e.g. 10" 
                    value={dnsRecordPriority}
                    onChange={(e) => setDnsRecordPriority(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">TTL</label>
                  <select
                    value={dnsRecordTtl}
                    onChange={(e) => setDnsRecordTtl(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                  >
                    <option value="3600">Auto (1 hour)</option>
                    <option value="120">2 min</option>
                    <option value="300">5 min</option>
                    <option value="600">10 min</option>
                    <option value="1800">30 min</option>
                    <option value="3600">1 hour</option>
                    <option value="7200">2 hours</option>
                    <option value="14400">4 hours</option>
                    <option value="86400">1 day</option>
                  </select>
                </div>

                {['A', 'AAAA', 'CNAME'].includes(dnsRecordType) && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Proxy Status</label>
                    <div className="flex items-center pt-2">
                      <button
                        type="button"
                        onClick={() => setDnsRecordProxied(!dnsRecordProxied)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all ${
                          dnsRecordProxied ? 'bg-amber-500 justify-end' : 'bg-white/10 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </button>
                      <span className="text-xs text-slate-300 ml-2 font-bold">{dnsRecordProxied ? 'Proxied' : 'DNS Only'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddDnsRecordModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all border-none cursor-pointer"
                >
                  Create Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit DNS Record Modal */}
      {showEditDnsRecordModal && selectedZone && editingDnsRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Edit DNS Record</h3>
            <p className="text-slate-400 text-xs">Editing record in zone <span className="font-mono text-slate-300">{selectedZone.name}</span></p>
            
            <form onSubmit={handleUpdateDnsRecord} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                <select
                  value={dnsRecordType}
                  onChange={(e) => setDnsRecordType(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                  disabled
                >
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="TXT">TXT</option>
                  <option value="SRV">SRV</option>
                  <option value="CAA">CAA</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Name (use @ for root)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. @ or mail" 
                  value={dnsRecordName}
                  onChange={(e) => setDnsRecordName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Content (IPv4, target domain, text, etc.)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 192.0.2.1 or target.domain" 
                  value={dnsRecordContent}
                  onChange={(e) => setDnsRecordContent(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              {dnsRecordType === 'MX' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                  <input 
                    type="number" 
                    required
                    placeholder="e.g. 10" 
                    value={dnsRecordPriority}
                    onChange={(e) => setDnsRecordPriority(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">TTL</label>
                  <select
                    value={dnsRecordTtl}
                    onChange={(e) => setDnsRecordTtl(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                  >
                    <option value="3600">Auto (1 hour)</option>
                    <option value="120">2 min</option>
                    <option value="300">5 min</option>
                    <option value="600">10 min</option>
                    <option value="1800">30 min</option>
                    <option value="3600">1 hour</option>
                    <option value="7200">2 hours</option>
                    <option value="14400">4 hours</option>
                    <option value="86400">1 day</option>
                  </select>
                </div>

                {['A', 'AAAA', 'CNAME'].includes(dnsRecordType) && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Proxy Status</label>
                    <div className="flex items-center pt-2">
                      <button
                        type="button"
                        onClick={() => setDnsRecordProxied(!dnsRecordProxied)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all ${
                          dnsRecordProxied ? 'bg-amber-500 justify-end' : 'bg-white/10 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </button>
                      <span className="text-xs text-slate-300 ml-2 font-bold">{dnsRecordProxied ? 'Proxied' : 'DNS Only'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowEditDnsRecordModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all border-none cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Credential Modal */}
      {showAddCredModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Add Cloudflare Keys</h3>
            <form onSubmit={handleAddCredential} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Label (e.g. My Account)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Primary Account" 
                  value={newCredLabel}
                  onChange={(e) => setNewCredLabel(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">CF Account Email</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. name@domain.com" 
                  value={newCredEmail}
                  onChange={(e) => setNewCredEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Global Key or API Token</label>
                <input 
                  type="password" 
                  required
                  placeholder="Cloudflare authentication string" 
                  value={newCredKey}
                  onChange={(e) => setNewCredKey(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddCredModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Save Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Credential Modal */}
      {showEditCredModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Edit Cloudflare Keys</h3>
            <form onSubmit={handleUpdateCredential} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Label (e.g. My Account)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Primary Account" 
                  value={editCredLabel}
                  onChange={(e) => setEditCredLabel(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">CF Account Email</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. name@domain.com" 
                  value={editCredEmail}
                  onChange={(e) => setEditCredEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Global Key or API Token (Leave blank to keep current key)</label>
                <input 
                  type="password" 
                  placeholder="Leave blank unless changing key / token" 
                  value={editCredKey}
                  onChange={(e) => setEditCredKey(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowEditCredModal(false);
                    setEditingCredential(null);
                  }}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-brand-plum font-bold rounded-xl text-sm transition-all"
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
    </>
  );
}
