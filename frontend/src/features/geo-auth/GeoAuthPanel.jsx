import { Shield, Mail, Lock, Globe, RefreshCw, Plus, X } from 'lucide-react';
import { useState } from 'react';
import Modal from '../../shared/components/Modal';
import Button from '../../shared/components/Button';
import { CountrySelector, RegionSelector } from './GeoSelectors';
import { getFlagEmoji, formatDateTime } from '../../shared/lib/helpers';

export function GeoAuthPanel({
  hasPermission,
  geoSubTab,
  setGeoSubTab,
  selectedGeoDomainId,
  setSelectedGeoDomainId,
  geoSettings,
  geoAllowedCountries,
  setGeoAllowedCountries,
  geoAllowedRegions,
  setGeoAllowedRegions,
  geoRegions,
  geoAugmentDefault,
  setGeoAugmentDefault,
  domains,
  loading,
  sshAllowedRegions,
  setSshAllowedRegions,
  sshAllowedCountries,
  setSshAllowedCountries,
  sshAugmentDefault,
  setSshAugmentDefault,
  sshLogs,
  geoBans,
  geoExceptions,
  fetchGeoData,
  handleSaveGeoPolicy,
  handleSaveSshPolicy,
  handleClearGeoBan,
  handleResetRegions,
  setEditingRegion,
  editingRegion,
  editingRegionCountries,
  setEditingRegionCountries,
  handleUpdateRegion,
  showAddGeoExceptionModal,
  setShowAddGeoExceptionModal,
  geoExcUsername,
  setGeoExcUsername,
  geoExcService,
  setGeoExcService,
  geoExcCountries,
  setGeoExcCountries,
  geoExcExpires,
  setGeoExcExpires,
  handleSaveGeoException,
  handleDeleteGeoException,
}) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title & Sub-tabs */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-brand-purple" />
            Geolocation Auth & SSH Firewall
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Protect IMAP, SMTP, and SSH ports from brute-force campaigns using dynamic geofencing and nftables.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-white/5 pb-2">
          <Button
            variant={geoSubTab === 'mail' ? 'purple' : 'ghost'}
            size="sm"
            icon={Mail}
            onClick={() => setGeoSubTab('mail')}
          >
            Mail Geofencing
          </Button>
          <Button
            variant={geoSubTab === 'ssh' ? 'purple' : 'ghost'}
            size="sm"
            icon={Lock}
            onClick={() => setGeoSubTab('ssh')}
          >
            SSH Geofencing
          </Button>
          <Button
            variant={geoSubTab === 'bans-exceptions' ? 'purple' : 'ghost'}
            size="sm"
            icon={Shield}
            onClick={() => setGeoSubTab('bans-exceptions')}
          >
            Bans & Exceptions
          </Button>
          <Button
            variant={geoSubTab === 'regions' ? 'purple' : 'ghost'}
            size="sm"
            icon={Globe}
            onClick={() => setGeoSubTab('regions')}
          >
            Region Definitions
          </Button>
        </div>
      </div>

      {/* Tab Contents */}
      {geoSubTab === 'mail' && hasPermission('geo_mail:view') && (
        <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-6">
          <h3 className="text-lg font-bold text-slate-100 pb-3 border-b border-white/5 flex justify-between items-center">
            <span>Domain-Level Geofence Policy (Mail)</span>
          </h3>

          <form onSubmit={handleSaveGeoPolicy} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Select Mail Domain
              </label>
              <select
                required
                value={selectedGeoDomainId}
                onChange={(e) => {
                  setSelectedGeoDomainId(e.target.value);
                  const existing = geoSettings.find(s => s.domain_id === parseInt(e.target.value));
                  if (existing) {
                    setGeoAllowedCountries(existing.allowed_countries);
                    setGeoAllowedRegions(existing.allowed_regions);
                  } else {
                    setGeoAllowedCountries('');
                    setGeoAllowedRegions('SADC');
                  }
                }}
                className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-400 text-sm"
              >
                <option value="">-- Choose Domain --</option>
                {domains.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Allowed Regions
                  </label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Select regions below..."
                    value={geoAllowedRegions}
                    className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/10 rounded-xl text-slate-400 font-mono focus:outline-none text-sm cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Allowed Countries
                  </label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Select countries below..."
                    value={geoAllowedCountries}
                    className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/10 rounded-xl text-slate-400 font-mono focus:outline-none text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Interactive Region Selector
                  </label>
                  <RegionSelector
                    value={geoAllowedRegions}
                    onChange={setGeoAllowedRegions}
                    geoRegions={geoRegions}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Interactive Country Selector
                  </label>
                  <CountrySelector
                    value={geoAllowedCountries}
                    onChange={setGeoAllowedCountries}
                    geoRegions={geoRegions}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="geoAugmentDefault"
                  checked={geoAugmentDefault}
                  onChange={(e) => setGeoAugmentDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-brand-plum-dark text-indigo-500 focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="geoAugmentDefault" className="text-xs text-slate-300 cursor-pointer select-none">
                  Augment default policy (automatically allow SADC countries)
                </label>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!selectedGeoDomainId}
              loading={loading}
              size="lg"
            >
              Save Mail Policy
            </Button>
          </form>
        </div>
      )}

      {geoSubTab === 'ssh' && hasPermission('geo_ssh:view') && (
        <div className="space-y-6">
          <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-6">
            <h3 className="text-lg font-bold text-slate-100 pb-3 border-b border-white/5 flex justify-between items-center">
              <span>Global SSH Geofence Policy</span>
            </h3>

            <form onSubmit={handleSaveSshPolicy} className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      SSH Allowed Regions
                    </label>
                    <input
                      type="text"
                      readOnly
                      placeholder="Select SSH regions below..."
                      value={sshAllowedRegions}
                      className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/10 rounded-xl text-slate-400 font-mono focus:outline-none text-sm cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      SSH Allowed Countries
                    </label>
                    <input
                      type="text"
                      readOnly
                      placeholder="Select SSH countries below..."
                      value={sshAllowedCountries}
                      className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/10 rounded-xl text-slate-400 font-mono focus:outline-none text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Interactive SSH Region Selector
                    </label>
                    <RegionSelector
                      value={sshAllowedRegions}
                      onChange={setSshAllowedRegions}
                      geoRegions={geoRegions}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Interactive SSH Country Selector
                    </label>
                    <CountrySelector
                      value={sshAllowedCountries}
                      onChange={setSshAllowedCountries}
                      geoRegions={geoRegions}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="sshAugmentDefault"
                    checked={sshAugmentDefault}
                    onChange={(e) => setSshAugmentDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-white/10 bg-brand-plum-dark text-indigo-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="sshAugmentDefault" className="text-xs text-slate-300 cursor-pointer select-none">
                    Augment default policy (automatically allow SADC countries)
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                size="lg"
              >
                Save SSH Policy
              </Button>
            </form>
          </div>

          {/* SSH Audit Logs Section */}
          <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <h3 className="text-lg font-bold text-slate-100">SSH Connection & Auth Logs (Past 3 Days)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchGeoData}
              >
                Refresh Logs
              </Button>
            </div>
            <div className="bg-brand-plum-dark/80 rounded-xl p-4 border border-white/10 font-mono text-xs text-slate-300 overflow-auto max-h-96 custom-scrollbar">
              {sshLogs ? (
                <pre className="whitespace-pre-wrap">{sshLogs}</pre>
              ) : (
                <p className="text-slate-500 italic py-4 text-center">No recent SSH log entries found or empty.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {geoSubTab === 'bans-exceptions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left & Middle: Active Bans */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
              <h3 className="text-lg font-bold text-slate-100 pb-3 border-b border-white/5">
                Active Firewall Port Bans (Nftables)
              </h3>

              <div className="overflow-auto max-h-[420px] border border-white/5 rounded-2xl custom-scrollbar">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-[#fffaf0] sticky top-0 z-10">
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">IP Address</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Service</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Banned At</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Expires At</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoBans.map(ban => (
                      <tr key={ban.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                        <td className="p-4 font-mono text-slate-200">
                          <span className="flex items-center gap-2">
                            <span className="text-base" title={ban.country_code || 'UNKNOWN'}>
                              {getFlagEmoji(ban.country_code)}
                            </span>
                            <span>{ban.ip_address}</span>
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            ban.service === 'mail' 
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {ban.service}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 text-xs font-mono">
                          {formatDateTime(ban.banned_at)}
                        </td>
                        <td className="p-4 text-slate-400 text-xs font-mono">
                          {formatDateTime(ban.expires_at)}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleClearGeoBan(ban.ip_address, ban.service)}
                          >
                            Clear Ban
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {geoBans.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400">
                          No active IP bans matching the policy rules.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Exceptions */}
          <div className="space-y-6">
            <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <h3 className="text-lg font-bold text-slate-100">User Exceptions</h3>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    if (hasPermission('geo_mail:view')) setGeoExcService('mail');
                    else setGeoExcService('ssh');
                    setShowAddGeoExceptionModal(true);
                  }}
                >
                  Add Exception
                </Button>
              </div>

              <div className="space-y-3">
                {geoExceptions.map(exc => (
                  <div key={exc.username + '-' + exc.service} className="p-4 bg-brand-plum-dark border border-white/10 rounded-xl space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-200 text-sm break-all">{exc.username}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10 text-indigo-300">
                          {exc.service}
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteGeoException(exc.username, exc.service, exc.allowed_countries, exc.expires_at)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      <strong>Allowed Countries:</strong> {exc.allowed_countries}
                    </div>
                    {exc.expires_at && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        <strong>Expires:</strong> {formatDateTime(exc.expires_at)}
                      </div>
                    )}
                  </div>
                ))}
                {geoExceptions.length === 0 && (
                  <div className="text-center p-6 text-slate-400 text-sm">
                    No user level exceptions defined.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {geoSubTab === 'regions' && (
        <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
          <h3 className="text-lg font-bold text-slate-100 pb-3 border-b border-white/5 flex justify-between items-center">
            <span>Dynamic Geofence Region Definitions</span>
            <Button
              variant="danger"
              size="sm"
              onClick={handleResetRegions}
            >
              Reset Templates
            </Button>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {geoRegions.map(reg => (
              <div key={reg.name} className="bg-brand-plum-dark/40 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-sm text-indigo-400 uppercase tracking-wider">{reg.name}</span>
                    <span className="text-[10px] text-slate-500 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      {reg.countries.split(',').filter(Boolean).length} countries
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {reg.countries.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <span key={c} className="text-lg" title={c}>
                        {getFlagEmoji(c)}
                      </span>
                    ))}
                    {reg.countries.split(',').filter(Boolean).length === 0 && (
                      <span className="text-xs text-slate-600 italic">No countries</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 bg-black/25 p-2.5 rounded-xl max-h-16 overflow-y-auto break-all border border-white/5">
                    {reg.countries || <span className="text-slate-600 italic">Empty region</span>}
                  </div>
                </div>
                
                <Button
                  variant="purple"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setEditingRegion(reg);
                    setEditingRegionCountries(reg.countries);
                  }}
                >
                  Edit Region Countries
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
      <Modal
        isOpen={showAddGeoExceptionModal}
        onClose={() => setShowAddGeoExceptionModal(false)}
        title="Add User Geo Exception"
        size="lg"
      >
        <form onSubmit={handleSaveGeoException} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">User Username / Email</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. traveler@domain.com or systemuser" 
                  value={geoExcUsername}
                  onChange={(e) => setGeoExcUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Service Scope</label>
                <select
                  required
                  value={geoExcService}
                  onChange={(e) => setGeoExcService(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm"
                >
                  {hasPermission('geo_mail:view') && <option value="mail">Mail Only</option>}
                  {hasPermission('geo_ssh:view') && <option value="ssh">SSH Only</option>}
                  {hasPermission('geo_mail:view') && hasPermission('geo_ssh:view') && <option value="all">All Services (Mail & SSH)</option>}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Allowed Countries (ISO codes)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. US, GB, ZA" 
                  value={geoExcCountries}
                  onChange={(e) => setGeoExcCountries(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm mb-2"
                />
                <CountrySelector
                  value={geoExcCountries}
                  onChange={setGeoExcCountries}
                  geoRegions={geoRegions}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expiration Timestamp (Optional)</label>
                <input 
                  type="datetime-local" 
                  value={geoExcExpires}
                  onChange={(e) => setGeoExcExpires(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm text-slate-300"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button 
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddGeoExceptionModal(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  variant="primary"
                  loading={loading}
                  className="flex-1"
                >
                  Create Exception
                </Button>
              </div>
            </form>
      </Modal>

      <Modal
        isOpen={!!editingRegion}
        onClose={() => setEditingRegion(null)}
        title={`Edit Region: ${editingRegion?.name || ''}`}
        size="2xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Countries for this Region</label>
                <div className="bg-brand-plum-dark/40 border border-white/5 p-4 rounded-2xl mb-4 font-mono text-xs text-slate-400 break-all max-h-20 overflow-y-auto">
                  <strong>Selected Codes:</strong> {editingRegionCountries || <span className="text-slate-600 italic">None</span>}
                </div>
                <CountrySelector
                  value={editingRegionCountries}
                  onChange={setEditingRegionCountries}
                  geoRegions={[]}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingRegion(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleUpdateRegion(editingRegion.name, editingRegionCountries);
                    setEditingRegion(null);
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
      </Modal>
    </div>
  );
}
