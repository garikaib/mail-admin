import { useState } from 'react';
import { Globe, Plus, Search, ChevronRight } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { DomainDetailPage } from './DomainDetailPage';

export default function DomainsScreen({
  hasPermission,
  setShowAddUserModal,
  setShowAddAliasModal,
  handleResetMailboxPwd,
  handleDeleteMailbox,
  handleDeleteAlias,
  setEditingAlias,
  setEditAliasDest,
  handleDeleteDomain,
  handleSelectDomain
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const domains = useAppStore(state => state.domains);
  const selectedDomain = useAppStore(state => state.selectedDomain);
  const setSelectedDomain = useAppStore(state => state.setSelectedDomain);
  const mailboxes = useAppStore(state => state.mailboxes);
  const aliases = useAppStore(state => state.aliases);
  const provisionLogs = useAppStore(state => state.provisionLogs);
  const plans = useAppStore(state => state.plans);
  const setShowAddDomainModal = useAppStore(state => state.setShowAddDomainModal);

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
    </div>
  );
}
