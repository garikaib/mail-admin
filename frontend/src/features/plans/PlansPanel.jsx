import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '../../shared/api/client';

export function PlansPanel({
  hasPermission,
  setConfirmModal,
  onPlansChange,
}) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Plan Modal Form States
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planMaxUsers, setPlanMaxUsers] = useState(10);
  const [planMaxAliases, setPlanMaxAliases] = useState(20);
  const [planQuotaMb, setPlanQuotaMb] = useState(1024);
  const [planIsDefault, setPlanIsDefault] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/domains/plans');
      setPlans(data || []);
      if (onPlansChange) {
        onPlansChange(data || []);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  }, [onPlansChange]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const resetPlanForm = () => {
    setSelectedPlan(null);
    setPlanName('');
    setPlanMaxUsers(10);
    setPlanMaxAliases(20);
    setPlanQuotaMb(1024);
    setPlanIsDefault(false);
  };

  const handleEditPlan = (p) => {
    setSelectedPlan(p);
    if (p) {
      setPlanName(p.name);
      setPlanMaxUsers(p.max_users);
      setPlanMaxAliases(p.max_aliases);
      setPlanQuotaMb(p.quota_mb);
      setPlanIsDefault(p.is_default);
    } else {
      setPlanName('');
      setPlanMaxUsers(10);
      setPlanMaxAliases(20);
      setPlanQuotaMb(1024);
      setPlanIsDefault(false);
    }
    setShowEditPlanModal(true);
  };

  const handleAddPlanClick = () => {
    setSelectedPlan(null);
    setPlanName('');
    setPlanMaxUsers(10);
    setPlanMaxAliases(20);
    setPlanQuotaMb(1024);
    setPlanIsDefault(false);
    setShowAddPlanModal(true);
  };

  const handleCreatePlan = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const url = `/domains/plans?name=${encodeURIComponent(planName)}&max_users=${planMaxUsers}&max_aliases=${planMaxAliases}&quota_mb=${planQuotaMb}&is_default=${planIsDefault}`;
      await api.post(url);
      setSuccessMsg("Plan created successfully!");
      fetchPlans();
      setShowAddPlanModal(false);
      resetPlanForm();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to create plan.");
    }
  };

  const handleUpdatePlan = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPlan) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const url = `/domains/plans/${selectedPlan.id}?name=${encodeURIComponent(planName)}&max_users=${planMaxUsers}&max_aliases=${planMaxAliases}&quota_mb=${planQuotaMb}&is_default=${planIsDefault}`;
      await api.put(url);
      setSuccessMsg("Plan updated successfully!");
      fetchPlans();
      setShowEditPlanModal(false);
      resetPlanForm();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to update plan.");
    }
  };

  const handleDeletePlan = async (planId) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.delete(`/domains/plans/${planId}`);
      setSuccessMsg("Plan deleted successfully!");
      fetchPlans();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to delete plan.");
    }
  };

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

      {/* Messages */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in">
          {successMsg}
        </div>
      )}

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
              {plans.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">No mail hosting plans registered.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">Loading plans...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Plan Modal */}
      {showAddPlanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-brand-plum border-2 border-slate-950 rounded-2xl p-6 shadow-[8px_8px_0_#151214] relative">
            <h3 className="text-xl font-black text-white mb-2">Create New Mail Plan</h3>
            <p className="text-xs text-slate-400 mb-6">Define resources and quotas for domains on this plan.</p>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Plan Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Starter, Premium"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Mailboxes</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={planMaxUsers}
                    onChange={(e) => setPlanMaxUsers(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Aliases</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={planMaxAliases}
                    onChange={(e) => setPlanMaxAliases(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mailbox Quota (MB)</label>
                <input 
                  type="number" 
                  required
                  min="10"
                  value={planQuotaMb}
                  onChange={(e) => setPlanQuotaMb(parseInt(e.target.value) || 10)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="addPlanIsDefault"
                  checked={planIsDefault}
                  onChange={(e) => setPlanIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-brand-plum-dark text-brand-mint focus:ring-0 cursor-pointer"
                />
                <label htmlFor="addPlanIsDefault" className="text-xs text-slate-300 font-semibold cursor-pointer select-none">
                  Set as Default Plan for new domains
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddPlanModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold transition-all cursor-pointer text-center text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-brand-mint text-slate-950 hover:bg-opacity-90 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer text-center text-sm"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {showEditPlanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-brand-plum border-2 border-slate-950 rounded-2xl p-6 shadow-[8px_8px_0_#151214] relative">
            <h3 className="text-xl font-black text-white mb-2">Edit Mail Plan</h3>
            <p className="text-xs text-slate-400 mb-6">Modify resource limits and defaults for this plan.</p>
            <form onSubmit={handleUpdatePlan} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Plan Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Starter, Premium"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Mailboxes</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={planMaxUsers}
                    onChange={(e) => setPlanMaxUsers(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Aliases</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={planMaxAliases}
                    onChange={(e) => setPlanMaxAliases(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mailbox Quota (MB)</label>
                <input 
                  type="number" 
                  required
                  min="10"
                  value={planQuotaMb}
                  onChange={(e) => setPlanQuotaMb(parseInt(e.target.value) || 10)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="editPlanIsDefault"
                  checked={planIsDefault}
                  onChange={(e) => setPlanIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-brand-plum-dark text-brand-mint focus:ring-0 cursor-pointer"
                />
                <label htmlFor="editPlanIsDefault" className="text-xs text-slate-300 font-semibold cursor-pointer select-none">
                  Set as Default Plan for new domains
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => { setShowEditPlanModal(false); resetPlanForm(); }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold transition-all cursor-pointer text-center text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-brand-mint text-slate-950 hover:bg-opacity-90 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer text-center text-sm"
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
