import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, Copy, Sparkles, AlertTriangle } from 'lucide-react';
import { api } from '../../shared/api/client';
import { formatDateOnly, generateSecurePassword } from '../../shared/lib/helpers';

export function UsersPanel({
  user,
  setConfirmModal,
  hasPermission,
}) {
  const [consoleUsers, setConsoleUsers] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search/filter state
  const [consoleUserSearch, setConsoleUserSearch] = useState('');
  const [consoleUserRoleFilter, setConsoleUserRoleFilter] = useState('all');

  // Modals state
  const [showAddConsoleUserModal, setShowAddConsoleUserModal] = useState(false);
  const [showEditConsoleUserModal, setShowEditConsoleUserModal] = useState(false);
  const [selectedConsoleUser, setSelectedConsoleUser] = useState(null);

  // Form states
  const [addConsoleUsername, setAddConsoleUsername] = useState('');
  const [addConsolePassword, setAddConsolePassword] = useState('');
  const [addConsoleIsSuper, setAddConsoleIsSuper] = useState(false);
  const [addConsoleRoles, setAddConsoleRoles] = useState([]);
  const [addConsoleDomains, setAddConsoleDomains] = useState([]);

  const [editConsoleIsSuper, setEditConsoleIsSuper] = useState(false);
  const [editConsoleRoles, setEditConsoleRoles] = useState([]);
  const [editConsoleDomains, setEditConsoleDomains] = useState([]);
  const [editConsolePassword, setEditConsolePassword] = useState('');

  const fetchConsoleUsers = useCallback(async () => {
    try {
      const data = await api.get('/console-users');
      setConsoleUsers(data || []);
    } catch (err) {
      console.error("Failed to fetch console users:", err);
      setErrorMsg("Failed to load console users.");
    }
  }, []);

  const fetchDomains = useCallback(async () => {
    try {
      const data = await api.get('/domains');
      setDomains(data || []);
    } catch (err) {
      console.error("Failed to fetch domains:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConsoleUsers(), fetchDomains()]).finally(() => {
      setLoading(false);
    });
  }, [fetchConsoleUsers, fetchDomains]);

  const handleEditConsoleUser = (u) => {
    setSelectedConsoleUser(u);
    if (u) {
      setEditConsoleIsSuper(u.is_superuser);
      setEditConsoleRoles(u.roles.map(r => r.role));
      setEditConsoleDomains(u.assignments.map(a => a.domain_name));
      setEditConsolePassword('');
    } else {
      setEditConsoleIsSuper(false);
      setEditConsoleRoles([]);
      setEditConsoleDomains([]);
      setEditConsolePassword('');
    }
    setShowEditConsoleUserModal(true);
  };

  const handleCloseEditConsoleUserModal = () => {
    setShowEditConsoleUserModal(false);
    setSelectedConsoleUser(null);
    setEditConsoleIsSuper(false);
    setEditConsoleRoles([]);
    setEditConsoleDomains([]);
    setEditConsolePassword('');
  };

  const handleCreateConsoleUser = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const userData = {
      username: addConsoleUsername,
      password: addConsolePassword,
      is_superuser: addConsoleIsSuper,
      roles: addConsoleRoles,
      domains: addConsoleDomains
    };
    try {
      await api.post('/console-users', userData);
      setSuccessMsg("Console user created successfully.");
      fetchConsoleUsers();
      setShowAddConsoleUserModal(false);
      // reset form
      setAddConsoleUsername('');
      setAddConsolePassword('');
      setAddConsoleIsSuper(false);
      setAddConsoleRoles([]);
      setAddConsoleDomains([]);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to create console user.");
    }
  };

  const handleUpdateConsoleUser = async (userId, updateData) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updatedUser = await api.put(`/console-users/${userId}`, updateData);
      setSuccessMsg("Console user updated successfully.");
      fetchConsoleUsers();
      handleCloseEditConsoleUserModal();
      if (user && updatedUser.id === user.id) {
        // Force reload if editing self to update console credentials/permissions cleanly
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to update console user.");
    }
  };

  const handleDeleteConsoleUser = async (userId) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.delete(`/console-users/${userId}`);
      setSuccessMsg("Console user deleted successfully.");
      fetchConsoleUsers();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to delete console user.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Console Administrators</h2>
          <p className="text-slate-400 text-sm mt-1">Manage system administrators, Casbin roles, and scoped domain authorization.</p>
        </div>
        <button 
          onClick={() => {
            setAddConsoleUsername('');
            setAddConsolePassword('');
            setAddConsoleIsSuper(false);
            setAddConsoleRoles([]);
            setAddConsoleDomains([]);
            setShowAddConsoleUserModal(true);
          }}
          className="bg-sky-400 text-slate-950 border-2 border-slate-950 font-black px-4 py-2.5 rounded-xl shadow-[4px_4px_0_#151214] hover:bg-sky-300 transition-all flex items-center gap-2 cursor-pointer active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-sm font-bold"
        >
          <Plus className="w-4 h-4 stroke-[3px]" />
          Add Console User
        </button>
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
                                confirmLabel: "Delete",
                                tone: "danger",
                                onConfirm: () => handleDeleteConsoleUser(u.id)
                              });
                            }}
                            className={`p-2 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 transition-all ${
                              isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title="Delete Console User"
                            disabled={isSelf}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {consoleUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-400">No console users registered.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-400">Loading console users...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Console User Modal */}
      {showAddConsoleUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Add Console Administrator</h3>
                <p className="text-slate-400 text-xs mt-1">Register a new user to access the ZimPrices administrative console.</p>
              </div>
              <button 
                onClick={() => setShowAddConsoleUserModal(false)}
                className="p-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateConsoleUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                <input 
                  type="email" 
                  required
                  placeholder="admin@domain.com"
                  value={addConsoleUsername}
                  onChange={(e) => setAddConsoleUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-sky-400 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      required
                      readOnly
                      placeholder="Click Generate to set password"
                      value={addConsolePassword}
                      className="w-full pl-4 pr-10 py-3 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-sky-400 text-sm font-medium font-mono cursor-not-allowed select-all"
                    />
                    {addConsolePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(addConsolePassword);
                          setSuccessMsg("Password copied to clipboard!");
                        }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy password to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pwd = generateSecurePassword();
                      setAddConsolePassword(pwd);
                      navigator.clipboard.writeText(pwd);
                      setSuccessMsg("Generated secure password and copied to clipboard!");
                    }}
                    className="px-4 py-3 bg-sky-400 text-slate-950 font-bold border-2 border-slate-950 rounded-xl shadow-[2px_2px_0_#151214] hover:bg-sky-300 transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5 active:shadow-none text-xs"
                    title="Generate secure password"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-slate-200 font-bold select-none cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={addConsoleIsSuper}
                    onChange={(e) => setAddConsoleIsSuper(e.target.checked)}
                    className="rounded w-4 h-4 accent-sky-400"
                  />
                  Is Superuser (Global Access)
                </label>
                <p className="text-[10px] text-slate-400 pl-6">
                  Superusers bypass all Casbin checks and have access to all console settings, domains, credentials, and audit logs automatically.
                </p>
              </div>

              {!addConsoleIsSuper && (
                <>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Casbin Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['domain_admin', 'support_admin', 'readonly_admin'].map(role => {
                        const isChecked = addConsoleRoles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 font-medium select-none cursor-pointer hover:bg-white/10 animate-fade-in">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAddConsoleRoles(prev => [...prev, role]);
                                } else {
                                  setAddConsoleRoles(prev => prev.filter(r => r !== role));
                                }
                              }}
                              className="rounded w-3.5 h-3.5 accent-sky-400"
                            />
                            {role}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Domains Scope</label>
                    <div className="max-h-36 overflow-y-auto border border-white/10 rounded-xl p-2 bg-white/2 space-y-1.5">
                      {domains.map(d => {
                        const isChecked = addConsoleDomains.includes(d.name);
                        return (
                          <label key={d.id} className="flex items-center gap-2 p-1 text-xs text-slate-300 font-mono select-none cursor-pointer hover:text-white">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAddConsoleDomains(prev => [...prev, d.name]);
                                } else {
                                  setAddConsoleDomains(prev => prev.filter(name => name !== d.name));
                                }
                              }}
                              className="rounded w-3.5 h-3.5 accent-sky-400"
                            />
                            {d.name}
                          </label>
                        );
                      })}
                      {domains.length === 0 && (
                        <div className="text-[10px] text-slate-500 italic p-1">No domains provisioned yet.</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddConsoleUserModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold rounded-xl text-sm transition-all cursor-pointer font-black"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Console User Modal */}
      {showEditConsoleUserModal && selectedConsoleUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Edit Console Permissions</h3>
                <p className="text-slate-400 text-xs mt-1">Update roles, scopes, or password for <strong>{selectedConsoleUser.username}</strong>.</p>
              </div>
              <button 
                onClick={handleCloseEditConsoleUserModal}
                className="p-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const updateData = {
                is_superuser: editConsoleIsSuper,
                roles: editConsoleRoles,
                domains: editConsoleDomains
              };
              if (editConsolePassword) {
                updateData.password = editConsolePassword;
              }
              handleUpdateConsoleUser(selectedConsoleUser.id, updateData);
            }} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Change Password (Optional)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      readOnly
                      placeholder="Leave blank or generate new password"
                      value={editConsolePassword}
                      className="w-full pl-4 pr-10 py-3 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-sky-400 text-sm font-medium font-mono cursor-not-allowed select-all"
                    />
                    {editConsolePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(editConsolePassword);
                          setSuccessMsg("Password copied to clipboard!");
                        }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy password to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pwd = generateSecurePassword();
                      setEditConsolePassword(pwd);
                      navigator.clipboard.writeText(pwd);
                      setSuccessMsg("Generated secure password and copied to clipboard!");
                    }}
                    className="px-4 py-3 bg-sky-400 text-slate-950 font-bold border-2 border-slate-950 rounded-xl shadow-[2px_2px_0_#151214] hover:bg-sky-300 transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5 active:shadow-none text-xs"
                    title="Generate secure password"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-slate-200 font-bold select-none cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={editConsoleIsSuper}
                    disabled={selectedConsoleUser.id === user?.id}
                    onChange={(e) => setEditConsoleIsSuper(e.target.checked)}
                    className="rounded w-4 h-4 accent-sky-400"
                  />
                  Is Superuser (Global Access)
                </label>
                <p className="text-[10px] text-slate-400 pl-6">
                  {selectedConsoleUser.id === user?.id 
                    ? "You cannot demote yourself to prevent lockout."
                    : "Superusers bypass all Casbin checks and have access to all console settings, domains, credentials, and audit logs automatically."}
                </p>
              </div>

              {!editConsoleIsSuper && (
                <>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Casbin Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['domain_admin', 'support_admin', 'readonly_admin'].map(role => {
                        const isChecked = editConsoleRoles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 font-medium select-none cursor-pointer hover:bg-white/10 animate-fade-in">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              disabled={selectedConsoleUser.id === user?.id}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditConsoleRoles(prev => [...prev, role]);
                                } else {
                                  setEditConsoleRoles(prev => prev.filter(r => r !== role));
                                }
                              }}
                              className="rounded w-3.5 h-3.5 accent-sky-400"
                            />
                            {role}
                          </label>
                        );
                      })}
                    </div>
                    {selectedConsoleUser.id === user?.id && (
                      <p className="text-[10px] text-slate-500 italic mt-1">You cannot modify your own assigned roles directly.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Domains Scope</label>
                    <div className="max-h-36 overflow-y-auto border border-white/10 rounded-xl p-2 bg-white/2 space-y-1.5">
                      {domains.map(d => {
                        const isChecked = editConsoleDomains.includes(d.name);
                        return (
                          <label key={d.id} className="flex items-center gap-2 p-1 text-xs text-slate-300 font-mono select-none cursor-pointer hover:text-white">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditConsoleDomains(prev => [...prev, d.name]);
                                } else {
                                  setEditConsoleDomains(prev => prev.filter(name => name !== d.name));
                                }
                              }}
                              className="rounded w-3.5 h-3.5 accent-sky-400"
                            />
                            {d.name}
                          </label>
                        );
                      })}
                      {domains.length === 0 && (
                        <div className="text-[10px] text-slate-500 italic p-1">No domains provisioned yet.</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={handleCloseEditConsoleUserModal}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold rounded-xl text-sm transition-all cursor-pointer font-black"
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
