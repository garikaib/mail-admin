import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { formatDateOnly } from '../../shared/lib/helpers';

export function UsersPanel({

  setShowAddConsoleUserModal,
  consoleUserSearch,
  setConsoleUserSearch,
  consoleUserRoleFilter,
  setConsoleUserRoleFilter,
  consoleUsers,
  user,
  handleUpdateConsoleUser,
  handleEditConsoleUser,
  setErrorMsg,
  setConfirmModal,
  handleDeleteConsoleUser,
}) {
  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Console Administrators</h2>
          <p className="text-slate-400 text-sm mt-1">Manage system administrators, Casbin roles, and scoped domain authorization.</p>
        </div>
        <button 
          onClick={() => setShowAddConsoleUserModal(true)}
          className="bg-sky-400 text-slate-950 border-2 border-slate-950 font-black px-4 py-2.5 rounded-xl shadow-[4px_4px_0_#151214] hover:bg-sky-300 transition-all flex items-center gap-2 cursor-pointer active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-sm font-bold"
        >
          <Plus className="w-4 h-4 stroke-[3px]" />
          Add Console User
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
          <input 
            type="text"
            placeholder="Search administrators by username or email..."
            value={consoleUserSearch}
            onChange={(e) => setConsoleUserSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/5 border-2 border-white/10 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all text-sm font-medium"
          />
        </div>
        <div className="w-full md:w-64">
          <select
            value={consoleUserRoleFilter}
            onChange={(e) => setConsoleUserRoleFilter(e.target.value)}
            className="w-full px-4 py-3 bg-brand-plum border-2 border-white/10 rounded-2xl text-slate-200 focus:outline-none focus:border-sky-400 transition-all text-sm font-bold cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="super_admin">Super Admins</option>
            <option value="domain_admin">Domain Admins</option>
            <option value="support_admin">Support Admins</option>
            <option value="readonly_admin">Readonly Admins</option>
            <option value="no_role">No Assigned Roles</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur z-10">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Console User</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Roles</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Domains Scope</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {consoleUsers
                .filter(u => {
                  const matchesSearch = u.username.toLowerCase().includes(consoleUserSearch.toLowerCase());
                  const userRoles = u.roles.map(r => r.role);
                  let matchesRole = true;
                  if (consoleUserRoleFilter === 'super_admin') {
                    matchesRole = u.is_superuser || userRoles.includes('super_admin');
                  } else if (consoleUserRoleFilter === 'no_role') {
                    matchesRole = !u.is_superuser && userRoles.length === 0;
                  } else if (consoleUserRoleFilter !== 'all') {
                    matchesRole = userRoles.includes(consoleUserRoleFilter);
                  }
                  return matchesSearch && matchesRole;
                })
                .map(u => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                      <td className="p-4">
                        <div className="font-semibold text-slate-200">{u.username}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Joined: {formatDateOnly(u.date_joined)}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {u.is_superuser && (
                            <span className="px-2 py-0.5 bg-brand-purple/20 text-brand-purple border border-brand-purple/30 rounded text-[10px] font-bold uppercase tracking-wider">
                              super_admin
                            </span>
                          )}
                          {u.roles.map(r => (
                            <span key={r.id} className="px-2 py-0.5 bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 rounded text-[10px] font-bold uppercase tracking-wider">
                              {r.role}
                            </span>
                          ))}
                          {!u.is_superuser && u.roles.length === 0 && (
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-bold uppercase tracking-wider animate-pulse">
                              no roles assigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-300">
                        {u.is_superuser ? (
                          <span className="text-slate-400 italic">Global (Full System Access)</span>
                        ) : u.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.assignments.map(a => (
                              <span key={a.id} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-300 font-mono">
                                {a.domain_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">None (No domains assigned)</span>
                        )}
                      </td>
                      <td className="p-4">
                        <button
                          disabled={isSelf}
                          onClick={() => handleUpdateConsoleUser(u.id, { is_active: !u.is_active })}
                          className={`px-3 py-1 rounded-xl text-xs font-black transition-all border-2 border-slate-950 shadow-[2px_2px_0_#151214] active:translate-y-0.5 active:shadow-none hover:opacity-95 ${
                            u.is_active 
                              ? 'bg-brand-mint text-slate-950' 
                              : 'bg-red-500/20 text-red-400 border-red-500'
                          } ${isSelf ? 'opacity-50 cursor-not-allowed shadow-none translate-y-0' : 'cursor-pointer'}`}
                        >
                          {u.is_active ? 'Active' : 'Suspended'}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleEditConsoleUser(u)}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                            title="Edit User Roles & Scopes"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              if (isSelf) {
                                setErrorMsg("You cannot delete your own account.");
                                      return;
                              }
                              setConfirmModal({
                                title: "Delete Console Account?",
                                message: `Are you sure you want to permanently delete user ${u.username}? This will remove all their role assignments, scopes, and session keys immediately.`,
                                onConfirm: () => handleDeleteConsoleUser(u.id)
                              });
                            }}
                            disabled={isSelf}
                            className={`p-2 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 transition-all ${
                              isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title="Delete Console User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {consoleUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-400">No console users registered.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
