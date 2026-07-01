import { useState } from 'react';
import { 
  Users, Link as LinkIcon, Clock, Plus, Trash2, RefreshCw, Edit2 
} from 'lucide-react';
import { formatTimeOnly } from '../../shared/lib/helpers';

export function DomainDetailPage({ 
  domain, mailboxes, aliases, provisionLogs, onBack, onAddUser, 
  onAddAlias, onResetPassword, onDeleteMailbox, onDeleteAlias, 
  onEditAlias, plans, hasPermission, onDeleteDomain, refresh,
  activeSubTab, setActiveSubTab
}) {

  const activePlan = plans.find(p => p.max_users === domain.max_users && p.max_aliases === domain.max_aliases);

  return (
    <div className="space-y-6">
      {/* Back Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <button 
          onClick={onBack}
          className="text-slate-400 hover:text-white text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          ← Back to Domains
        </button>
        <div className="flex gap-2">
          <button 
            onClick={refresh}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {hasPermission('domains:delete') && (
            <button 
              onClick={onDeleteDomain}
              className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-bold transition-all cursor-pointer"
            >
              Delete Domain
            </button>
          )}
        </div>
      </div>

      {/* Domain Top Info */}
      <div className="glassmorphism-card p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
            domain.is_active ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {domain.is_active ? 'Active' : 'Suspended'}
          </span>
          <h2 className="text-2xl font-black text-white mt-1.5">{domain.name}</h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">Incoming Mailserver: MX mail.zimprices.co.zw (Priority 10)</p>
        </div>

        <div className="flex gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400">Mailbox Limit</span>
            <p className="text-white font-bold">{mailboxes.length} / {domain.max_users}</p>
          </div>
          <div className="text-right border-l border-white/10 pl-4">
            <span className="text-xs text-slate-400">Alias Limit</span>
            <p className="text-white font-bold">{aliases.length} / {domain.max_aliases}</p>
          </div>
          <div className="text-right border-l border-white/10 pl-4">
            <span className="text-xs text-slate-400">Service Plan</span>
            <p className="text-brand-mint font-bold">{activePlan ? activePlan.name : 'Standard'}</p>
          </div>
        </div>
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        <button 
          onClick={() => setActiveSubTab('mailboxes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'mailboxes' ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1.5" />
          Mailboxes ({mailboxes.length})
        </button>
        <button 
          onClick={() => setActiveSubTab('aliases')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'aliases' ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5 inline mr-1.5" />
          Forwarders ({aliases.length})
        </button>
        {hasPermission('domains:provision_status') && (
          <button 
            onClick={() => setActiveSubTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'logs' ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 inline mr-1.5" />
            Provision Logs
          </button>
        )}
      </div>

      {/* TAB SUBSECTIONS */}
      {activeSubTab === 'mailboxes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white">Active Mailboxes</h3>
            {hasPermission('mailboxes:create') && (
              <button 
                onClick={onAddUser}
                className="bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-full flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                New Mailbox
              </button>
            )}
          </div>

          <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Quota Allocation</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mailboxes.length > 0 ? (
                  mailboxes.map(u => (
                    <tr key={u.email} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="p-4 text-sm font-semibold text-white">{u.email}</td>
                      <td className="p-4 text-sm text-slate-300">{u.full_name}</td>
                      <td className="p-4">
                        {(() => {
                          const formatBytes = (kb) => {
                            if (kb === 0 || !kb) return '0 KB';
                            const mb = kb / 1024;
                            if (mb >= 1024) {
                              const gb = mb / 1024;
                              return `${Number(gb.toFixed(1))} GB`;
                            }
                            return `${Number(mb.toFixed(0))} MB`;
                          };
                          const pct = u.quota_kb > 0 ? ((u.used_kb || 0) / u.quota_kb) * 100 : 0;
                          return (
                            <div className="space-y-1.5 max-w-[150px]">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatBytes(u.used_kb || 0)} / {formatBytes(u.quota_kb)}
                              </span>
                              <div className="w-full h-2 bg-brand-plum rounded-full overflow-hidden indicator-track">
                                <div 
                                  className="h-full bg-brand-mint rounded-full indicator-bar" 
                                  style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1">
                        {hasPermission('mailboxes:update') && (
                          <button 
                            onClick={() => onResetPassword(u.email)}
                            className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors text-xs font-bold flex items-center gap-1"
                            title="Reset Password"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reset
                          </button>
                        )}
                        {hasPermission('mailboxes:delete') && (
                          <button 
                            onClick={() => onDeleteMailbox(u.email)}
                            className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="Delete Box"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">No mailboxes created.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'aliases' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white">Mail Forwarding Rules</h3>
            {hasPermission('aliases:create') && (
              <button 
                onClick={onAddAlias}
                className="bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-full flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                New Alias
              </button>
            )}
          </div>

          <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Source (Forward From)</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Destination (Forward To)</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Managed</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {aliases.length > 0 ? (
                  aliases.map(a => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="p-4 text-sm font-semibold text-white">{a.source}</td>
                      <td className="p-4 text-sm text-slate-300 font-mono">{a.destination}</td>
                      <td className="p-4 text-xs">
                        <span className={`px-2 py-0.5 rounded ${a.managed_by_platform ? 'bg-brand-mint/10 text-brand-mint' : 'bg-white/5 text-slate-400'}`}>
                          {a.managed_by_platform ? 'User' : 'System'}
                        </span>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1">
                        {a.managed_by_platform && (
                          <>
                            {hasPermission('aliases:update') && (
                              <button 
                                onClick={() => onEditAlias(a)}
                                className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasPermission('aliases:delete') && (
                              <button 
                                onClick={() => onDeleteAlias(a.id)}
                                className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">No active alias rules.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'logs' && hasPermission('domains:provision_status') && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Infrastructure Provisioning Log</h3>
          <div className="glassmorphism-card p-6 rounded-2xl border border-white/5 font-mono text-xs space-y-2 max-h-[400px] overflow-y-auto">
            {provisionLogs.length > 0 ? (
              provisionLogs.map(l => (
                <div key={l.id} className="flex gap-4 hover:bg-white/2 py-1 rounded px-2">
                  <span className="text-slate-500 shrink-0">{formatTimeOnly(l.created_at)}</span>
                  <span className={`font-bold shrink-0 w-16 ${l.status === 'SUCCESS' ? 'text-brand-mint' : 'text-red-400'}`}>[{l.step}]</span>
                  <span className="text-slate-300">{l.details}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No logs found for this domain.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
