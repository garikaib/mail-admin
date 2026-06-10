import { Plus, Edit2, Trash2 } from 'lucide-react';

export function PlansPanel({
  hasPermission,
  handleAddPlanClick,
  plans,
  handleEditPlan,
  setConfirmModal,
  handleDeletePlan,
}) {
  return (
    <div className="space-y-6">
      {/* Plans Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Mail Hosting Plans</h2>
          <p className="text-sm text-slate-400 mt-1">Configure user limits, alias limits, and mailbox quotas for hosting domains.</p>
        </div>
        {hasPermission('plans:create') && (
          <button 
            onClick={handleAddPlanClick}
            className="px-5 py-2.5 bg-brand-mint text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            Create New Plan
          </button>
        )}
      </div>

      {/* Plans List Table */}
      <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur z-10">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Plan Name</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Max Mailboxes</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Max Aliases</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Mailbox Quota</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Default Plan</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                  <td className="p-4">
                    <div className="font-semibold text-slate-200">{p.name}</div>
                  </td>
                  <td className="p-4 text-slate-300 font-mono">
                    {p.max_users}
                  </td>
                  <td className="p-4 text-slate-300 font-mono">
                    {p.max_aliases}
                  </td>
                  <td className="p-4 text-slate-300 font-mono">
                    {p.quota_mb >= 1024 ? `${(p.quota_mb / 1024).toFixed(0)} GB` : `${p.quota_mb} MB`}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      p.is_default 
                        ? 'bg-brand-mint/20 text-brand-mint border border-brand-mint/30' 
                        : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}>
                      {p.is_default ? 'Default' : 'No'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {hasPermission('plans:update') && (
                        <button 
                          onClick={() => handleEditPlan(p)}
                          className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                          title="Edit Plan"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {hasPermission('plans:delete') && (
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              title: "Delete Mail Plan?",
                              message: `Are you sure you want to permanently delete plan ${p.name}? This cannot be undone.`,
                              onConfirm: () => handleDeletePlan(p.id)
                            });
                          }}
                          className="p-2 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                          title="Delete Plan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">No mail hosting plans registered.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
