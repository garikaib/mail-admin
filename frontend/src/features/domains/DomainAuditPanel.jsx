import { AlertTriangle, CloudOff, Globe, RefreshCw } from 'lucide-react';

export function DomainAuditPanel({
  auditData,
  auditLoading,
  fetchDomainAudit,
  setActiveTab,
  setNewDomainName,
  setSelectedCredId,
  setSelectedPlanId,
  plans,
  setShowAddDomainModal,
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-amber-400 w-7 h-7" />
            Domain Configuration & Health Audit
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Identify orphaned zones, misconfigured mail accounts, and unprovisioned domains.
          </p>
        </div>
        <button
          onClick={() => fetchDomainAudit()}
          disabled={auditLoading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-2 transition-all border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
          Refresh Audit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 border border-red-500/20 rounded-2xl p-5 shadow-lg shadow-red-500/5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-300">Orphan Zones</span>
            <div className="p-2 bg-red-500/10 rounded-xl">
              <AlertTriangle className="text-red-400 w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-white">{auditData.orphan_zones?.length || 0}</span>
            <p className="text-xs text-slate-400 mt-1">Domains setup but missing from Cloudflare</p>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-orange-500/20 rounded-2xl p-5 shadow-lg shadow-orange-500/5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-300">Broken Webmail</span>
            <div className="p-2 bg-orange-500/10 rounded-xl">
              <CloudOff className="text-orange-400 w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-white">{auditData.broken_webmail_domains?.length || 0}</span>
            <p className="text-xs text-slate-400 mt-1">Missing primary webmail routing host</p>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-300">Unprovisioned Zones</span>
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Globe className="text-amber-400 w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-white">{auditData.unprovisioned_domains?.length || 0}</span>
            <p className="text-xs text-slate-400 mt-1">Cloudflare domains with no mail setup</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            Orphan Zones ({auditData.orphan_zones?.length || 0})
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            These domains are configured on this mail server but not found in any connected Cloudflare accounts. Mail will not deliver unless MX records are pointed here manually.
          </p>
          {auditData.orphan_zones?.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-2">No orphaned domains detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-4">Domain</th>
                    <th className="pb-3">Max Users</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {auditData.orphan_zones.map(zone => (
                    <tr key={zone.id} className="hover:bg-slate-800/20 group">
                      <td className="py-4 pl-4 font-semibold text-white">{zone.name}</td>
                      <td className="py-4 text-slate-300">{zone.max_users} users</td>
                      <td className="py-4">
                        <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                          Orphaned
                        </span>
                      </td>
                      <td className="py-4 text-right pr-4">
                        <button
                          onClick={() => {
                            setActiveTab('domains');
                            window.history.pushState(null, '', `/domains?domain=${zone.name}`);
                          }}
                          className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-750"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            Broken Webmail - SMTP/IMAP Only ({auditData.broken_webmail_domains?.length || 0})
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            These domains have active email configuration on our server, but their Cloudflare account does not have a primary webmail origin server configured. Mail clients work fine, but browser webmail will fail.
          </p>
          {auditData.broken_webmail_domains?.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-2">No domains with broken webmail detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-4">Domain</th>
                    <th className="pb-3">CF Account ID</th>
                    <th className="pb-3">Issue Reason</th>
                    <th className="pb-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {auditData.broken_webmail_domains.map(zone => (
                    <tr key={zone.id} className="hover:bg-slate-800/20">
                      <td className="py-4 pl-4 font-semibold text-white">{zone.name}</td>
                      <td className="py-4 text-xs font-mono text-slate-400">{zone.cloudflare_account_id || 'Unknown'}</td>
                      <td className="py-4 text-orange-300 text-xs">{zone.reason}</td>
                      <td className="py-4 text-right pr-4">
                        <button
                          onClick={() => {
                            setActiveTab('domains');
                            window.history.pushState(null, '', `/domains?domain=${zone.name}`);
                          }}
                          className="text-xs font-semibold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg border border-orange-500/25"
                        >
                          Fix / Promote
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            Unprovisioned Cloudflare Domains ({auditData.unprovisioned_domains?.length || 0})
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            These domains exist in your Cloudflare accounts but do not have email services set up on our mail server. If they are already using third-party email, do not provision them unless you intend to migrate.
          </p>
          {auditData.unprovisioned_domains?.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-2">No unprovisioned domains detected in Cloudflare.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-4">Domain</th>
                    <th className="pb-3">Cloudflare Account</th>
                    <th className="pb-3">MX Status / Provider</th>
                    <th className="pb-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {auditData.unprovisioned_domains.map(zone => {
                    const isThirdParty = zone.email_provider !== 'No MX Records' && zone.email_provider !== 'ZimPrices Mail';
                    return (
                      <tr key={zone.name} className="hover:bg-slate-800/20">
                        <td className="py-4 pl-4 font-semibold text-white">{zone.name}</td>
                        <td className="py-4 text-slate-300">{zone.cloudflare_account_name || 'Unknown Account'}</td>
                        <td className="py-4">
                          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                            zone.email_provider === 'Google Workspace' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                            zone.email_provider === 'Microsoft 365' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                            zone.email_provider === 'Zoho Mail' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                            zone.email_provider === 'ZimPrices Mail' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            zone.email_provider === 'No MX Records' ? 'bg-slate-500/10 border-slate-500/20 text-slate-400' :
                            'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {zone.email_provider}
                          </span>
                        </td>
                        <td className="py-4 text-right pr-4">
                          <button
                            onClick={() => {
                              setNewDomainName(zone.name);
                              setSelectedCredId(zone.credential_id || '');
                              if (!plans.length) return;
                              if (!plans[0]) return;
                              if (!setSelectedPlanId) return;
                              setSelectedPlanId(plans[0].id);
                              setActiveTab('domains');
                              setShowAddDomainModal(true);
                            }}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                              isThirdParty
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-brand-mint hover:bg-emerald-400 text-slate-950 border-emerald-500/50'
                            }`}
                          >
                            {isThirdParty ? 'Migrate to ZimPrices' : 'Provision Email'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
