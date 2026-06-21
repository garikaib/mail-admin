import { useState, useEffect, lazy, Suspense } from 'react';
import { 
  Server, Shield, Key, Globe, LogOut, Search, Plus, Check, 
  AlertTriangle, RefreshCw, Trash2, Settings, Users, ChevronRight, 
  Activity, Clock, Grid2X2, CheckCircle2, MessageCircle, Flower2, Sparkles, Menu, X, Copy
} from 'lucide-react';
import useAuthStore from './store/useAuthStore';
import useUiStore from './store/useUiStore';
import useDomainsStore from './store/useDomainsStore';
import { usePermissions } from './shared/lib/usePermissions';

const API_BASE = '/api';

const DomainsScreen = lazy(() => import('./features/domains/DomainsScreen'));
const CredentialsScreen = lazy(() => import('./features/credentials/CredentialsScreen'));
const ServerHealthScreen = lazy(() => import('./features/server-health/ServerHealthScreen'));
const LogsScreen = lazy(() => import('./features/logs/LogsScreen'));
const UsersScreen = lazy(() => import('./features/users/UsersScreen'));
const PlansScreen = lazy(() => import('./features/plans/PlansScreen'));
const RegistrationsScreen = lazy(() => import('./features/registrations/RegistrationsScreen'));
const GeoAuthScreen = lazy(() => import('./features/geo-auth/GeoAuthScreen'));

const ScreenFallback = () => (
  <div className="flex items-center justify-center h-64">
    <RefreshCw className="w-8 h-8 text-brand-mint animate-spin" />
  </div>
);

const DASHBOARD_ROUTES = [
  {
    path: 'domains',
    label: 'Domains',
    icon: Globe,
    permission: 'domains:read',
    activeClass: 'bg-brand-mint text-slate-950 border-slate-950',
    countKey: 'domains'
  },
  {
    path: 'credentials',
    label: 'Cloudflare Creds',
    icon: Key,
    permission: 'credentials:read',
    activeClass: 'bg-brand-yellow text-slate-950 border-slate-950'
  },
  {
    path: 'health',
    label: 'Server Health',
    icon: Activity,
    permission: 'system:health',
    activeClass: 'bg-brand-purple text-white border-slate-950'
  },
  {
    path: 'logs',
    label: 'Audit Logs',
    icon: Clock,
    permission: 'system:logs',
    activeClass: 'bg-brand-pink text-slate-950 border-slate-950'
  },
  {
    path: 'users',
    label: 'Console Users',
    icon: Users,
    permission: 'users:read',
    activeClass: 'bg-sky-400 text-slate-950 border-slate-950'
  },
  {
    path: 'plans',
    label: 'Mail Plans',
    icon: Grid2X2,
    permission: 'plans:read',
    activeClass: 'bg-emerald-400 text-slate-950 border-slate-950'
  },
  {
    path: 'registrations',
    label: 'Domain Registration',
    icon: Shield,
    permission: 'registrations:read',
    activeClass: 'bg-rose-400 text-slate-950 border-slate-950'
  },
  {
    path: 'geo-auth',
    label: 'Geo Auth & SSH',
    icon: Lock,
    permission: 'geo_mail:view||geo_ssh:view',
    activeClass: 'bg-indigo-400 text-slate-950 border-slate-950'
  }
];

export default function App() {
  const token = useAuthStore(state => state.token);
  const setToken = useAuthStore(state => state.setToken);
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const logout = useAuthStore(state => state.logout);

  const activeTab = useUiStore(state => state.activeTab);
  const setActiveTab = useUiStore(state => state.setActiveTab);
  const mobileMenuOpen = useUiStore(state => state.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore(state => state.setMobileMenuOpen);
  const successMsg = useUiStore(state => state.successMsg);
  const setSuccessMsg = useUiStore(state => state.setSuccessMsg);
  const errorMsg = useUiStore(state => state.errorMsg);
  const setErrorMsg = useUiStore(state => state.setErrorMsg);
  const confirmModal = useUiStore(state => state.confirmModal);
  const setConfirmModal = useUiStore(state => state.setConfirmModal);

  const domains = useDomainsStore(state => state.domains);

  const [loading, setLoading] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [pwdModalError, setPwdModalError] = useState('');
  const [pwdModalSuccess, setPwdModalSuccess] = useState('');
  const [pwdModalLoading, setPwdModalLoading] = useState(false);

  const { hasPermission } = usePermissions();

  // URL Path Routing Effect
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.substring(1);
      const validPaths = DASHBOARD_ROUTES.map(r => r.path);
      setActiveTab(validPaths.includes(path) ? path : 'domains');
    };

    window.addEventListener('popstate', handlePopState);
    
    const currentPath = window.location.pathname.substring(1);
    const validPaths = DASHBOARD_ROUTES.map(r => r.path);
    if (user) {
      if (!currentPath || !validPaths.includes(currentPath)) {
        window.history.replaceState(null, '', '/domains');
        setTimeout(() => setActiveTab('domains'), 0);
      } else {
        setTimeout(handlePopState, 0);
      }
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, setActiveTab]);

  const handleTabChange = (path) => {
    window.history.pushState(null, '', `/${path}`);
    setActiveTab(path);
    setMobileMenuOpen(false);
  };

  // Google SSO & Session Token Hydration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const legacyAccessToken = params.get('access_token');

    const hydrateGoogleSession = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        let data;
        if (legacyAccessToken) {
          const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${legacyAccessToken}` }
          });
          if (!response.ok) {
            throw new Error('Google login completed, but the session could not be loaded.');
          }
          const profile = await response.json();
          data = {
            access_token: legacyAccessToken,
            email: profile.email || profile.username,
            is_superuser: profile.is_superuser,
            has_password: profile.has_password,
            roles: profile.roles || [],
            permissions: profile.permissions || []
          };
        } else {
          const localToken = localStorage.getItem('mail_admin_token');
          if (localToken) {
            const response = await fetch(`${API_BASE}/auth/me`, {
              headers: { 'Authorization': `Bearer ${localToken}` }
            });
            if (response.ok) {
              const profile = await response.json();
              data = {
                access_token: localToken,
                email: profile.email || profile.username,
                is_superuser: profile.is_superuser,
                has_password: profile.has_password,
                roles: profile.roles || [],
                permissions: profile.permissions || []
              };
            } else {
              localStorage.removeItem('mail_admin_token');
              localStorage.removeItem('mail_admin_user');
            }
          }
          
          if (!data) {
            const response = await fetch(`${API_BASE}/auth/session-token`, {
              method: 'POST',
              credentials: 'same-origin'
            });
            if (response.ok) {
              data = await response.json();
            }
          }
        }

        if (data) {
          setToken(data.access_token);
          setUser({
            email: data.email,
            is_superuser: data.is_superuser,
            has_password: data.has_password,
            roles: data.roles || [],
            permissions: data.permissions || []
          });
        }
        const currentParams = new URLSearchParams(window.location.search);
        if (currentParams.has('access_token')) {
          currentParams.delete('access_token');
          const newSearch = currentParams.toString();
          const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
          window.history.replaceState({}, document.title, newUrl);
        }
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };
    hydrateGoogleSession();
  }, [setToken, setUser, setErrorMsg]);

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/auth/google/login`;
  };

  const handleLogin = async (email, password, turnstileToken = '') => {
    setLoading(true);
    setErrorMsg('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      if (turnstileToken) {
        formData.append('cf-turnstile-response', turnstileToken);
      }
      
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Invalid email or password');
      }
      
      const data = await response.json();
      setToken(data.access_token);
      setUser({
        email: data.email,
        is_superuser: data.is_superuser,
        has_password: data.has_password,
        roles: data.roles || [],
        permissions: data.permissions || []
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    window.history.replaceState(null, '', '/');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdModalError('');
    setPwdModalSuccess('');
    
    if (newPasswordInput.length < 8) {
      setPwdModalError('New password must be at least 8 characters long.');
      return;
    }
    
    if (newPasswordInput !== confirmPasswordInput) {
      setPwdModalError('New passwords do not match.');
      return;
    }
    
    setPwdModalLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: user.has_password ? currentPasswordInput : null,
          new_password: newPasswordInput
        })
      });
      
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.detail || 'Failed to update password.');
      }
      
      setPwdModalSuccess('Password updated successfully!');
      const updatedUser = { ...user, has_password: true };
      setUser(updatedUser);
      localStorage.setItem('mail_admin_user', JSON.stringify(updatedUser));
      
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setPwdModalSuccess('');
      }, 2000);
      
    } catch (err) {
      setPwdModalError(err.message);
    } finally {
      setPwdModalLoading(false);
    }
  };

  // Dynamic Route Guard / Safeguard Redirects
  useEffect(() => {
    if (user) {
      const allowedRoutes = DASHBOARD_ROUTES.filter(r => hasPermission(r.permission));
      const currentRoute = DASHBOARD_ROUTES.find(r => r.path === activeTab);
      const isAuthorized = currentRoute ? hasPermission(currentRoute.permission) : (activeTab === 'unauthorized');
      
      if (!isAuthorized || activeTab === 'unauthorized') {
        if (allowedRoutes.length > 0) {
          if (activeTab === 'unauthorized' || !currentRoute || !hasPermission(currentRoute.permission)) {
            window.history.replaceState(null, '', `/${allowedRoutes[0].path}`);
            setTimeout(() => setActiveTab(allowedRoutes[0].path), 0);
          }
        } else {
          window.history.replaceState(null, '', '/unauthorized');
          setTimeout(() => setActiveTab('unauthorized'), 0);
        }
      }
    }
  }, [user, activeTab, setActiveTab]);

  // Auto-clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg, setSuccessMsg, setErrorMsg]);

  if (!user) {
    return <LoginScreen onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} loading={loading} errorMsg={errorMsg} />;
  }

  return (
    <div className="fasthtml-app flex flex-col md:flex-row h-screen bg-brand-plum-dark overflow-hidden font-sans">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-brand-plum border-b border-white/5 text-white z-40 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-mint/10 flex items-center justify-center border border-brand-mint/30">
            <Shield className="w-4 h-4 text-brand-mint" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">ZimPrices</h1>
            <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Admin Console</span>
          </div>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar Backdrop Overlay on Mobile */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <div className={`fasthtml-sidebar fixed inset-y-0 left-0 w-64 bg-brand-plum border-r border-white/5 flex flex-col justify-between shrink-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-mint/10 flex items-center justify-center border border-brand-mint/30">
                <Shield className="w-5 h-5 text-brand-mint" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight leading-none">ZimPrices</h1>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Admin Console</span>
              </div>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-3">
            {DASHBOARD_ROUTES.filter(route => hasPermission(route.permission)).map(route => {
              const Icon = route.icon;
              const isActive = activeTab === route.path;
              return (
                <button
                  key={route.path}
                  onClick={() => handleTabChange(route.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 ${
                    isActive 
                      ? `${route.activeClass} shadow-[4px_4px_0_#151214] -translate-x-[2px] -translate-y-[2px]` 
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white shadow-none translate-x-0 translate-y-0 active:translate-x-[1px] active:translate-y-[1px] cursor-pointer'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {route.label} {route.countKey === 'domains' ? `(${domains.length})` : ''}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info / Logout */}
        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs">
              {user.email.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.email}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {user.roles && user.roles.length > 0 ? (
                  user.roles.map(role => (
                    <span key={role} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-brand-yellow text-slate-950 border border-slate-950 shadow-[1px_1px_0_#151214]">
                      {role.replace('_', ' ')}
                    </span>
                  ))
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-700 text-slate-300 border border-white/10">
                    Domain Manager
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowChangePasswordModal(true)}
              className="w-1/2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 hover:text-white text-slate-400 transition-colors text-xs font-bold border border-white/5 cursor-pointer"
              title="Change Password"
            >
              <Key className="w-4 h-4" />
              Password
            </button>
            <button 
              onClick={handleLogout}
              className="w-1/2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-slate-400 transition-colors text-xs font-bold border border-white/5 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="fasthtml-main flex-1 flex flex-col min-w-0 overflow-y-auto bg-brand-plum-dark relative overflow-x-hidden">
        {/* FastHTML inspired organic backdrop shapes for main content */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
          <div className="fh-icon-shape fh-icon-green absolute -top-16 right-16 w-72 h-72 animate-float-mint"><Grid2X2 /></div>
          <div className="fh-icon-shape fh-icon-purple absolute bottom-12 -left-16 w-64 h-64 animate-float-purple"><MessageCircle /></div>
          <div className="fh-icon-shape fh-icon-yellow absolute top-[45%] left-[32%] w-56 h-56 animate-float-yellow"><CheckCircle2 /></div>
          <div className="fh-icon-shape fh-icon-pink absolute top-24 right-[28%] w-44 h-44"><Flower2 /></div>
          <div className="fh-icon-shape fh-icon-blue absolute bottom-28 right-20 w-48 h-48"><Sparkles /></div>
        </div>

        {/* Banner Messages */}
        {successMsg && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-500/10 border-b border-red-500/30 text-red-300 px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="p-8 max-w-6xl w-full mx-auto space-y-8 flex-1 relative z-10">
          <Suspense fallback={<ScreenFallback />}>
            {activeTab === 'unauthorized' ? (
              <div className="space-y-6 max-w-xl mx-auto pt-12">
                <div className="bg-red-500/10 border-2 border-slate-950 text-red-400 p-8 rounded-2xl shadow-[6px_6px_0_#151214] text-center space-y-5">
                  <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 border-2 border-slate-950 flex items-center justify-center shadow-[3px_3px_0_#151214]">
                    <Shield className="w-8 h-8 text-red-400 stroke-[2.5px]" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-white animate-pulse">Access Pending</h2>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Your account (<strong>{user?.email}</strong>) is authenticated, but no console roles or permissions have been assigned to you.
                    </p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-400 font-mono">
                    Please contact system administrator to seed roles & permissions.
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="bg-white text-slate-950 border-2 border-slate-950 font-black px-5 py-2.5 rounded-xl shadow-[4px_4px_0_#000] active:translate-y-0.5 active:shadow-none hover:bg-slate-100 transition-all text-xs cursor-pointer"
                  >
                    Logout & Try Another Account
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'domains' && hasPermission('domains:read') && (
                  <DomainsScreen />
                )}

                {activeTab === 'credentials' && hasPermission('credentials:read') && (
                  <CredentialsScreen />
                )}

                {activeTab === 'health' && hasPermission('system:health') && (
                  <ServerHealthScreen />
                )}

                {activeTab === 'logs' && hasPermission('system:logs') && (
                  <LogsScreen />
                )}

                {activeTab === 'users' && hasPermission('users:read') && (
                  <UsersScreen />
                )}

                {activeTab === 'plans' && hasPermission('plans:read') && (
                  <PlansScreen />
                )}

                {activeTab === 'registrations' && hasPermission('registrations:read') && (
                  <RegistrationsScreen />
                )}

                {activeTab === 'geo-auth' && (hasPermission('geo_mail:view') || hasPermission('geo_ssh:view')) && (
                  <GeoAuthScreen />
                )}
              </>
            )}
          </Suspense>
        </div>
      </div>

      {/* Global Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Update Admin Password</h3>
              <p className="text-xs text-slate-400 mt-1">Configure credentials for account {user?.email}.</p>
            </div>
            
            {pwdModalError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {pwdModalError}
              </div>
            )}
            {pwdModalSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                {pwdModalSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {user.has_password && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Current Password</label>
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••••••"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">New Password (min 8 chars)</label>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••••••"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••••••"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => { setShowChangePasswordModal(false); setPwdModalError(''); setPwdModalSuccess(''); }}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={pwdModalLoading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                >
                  {pwdModalLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          {...confirmModal}
          loading={loading}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => {
            if (confirmModal.onConfirm) {
              confirmModal.onConfirm();
            }
            setConfirmModal(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = 'Confirm', tone = 'default', loading, onCancel, onConfirm }) {
  const isDanger = tone === 'danger';
  const isWarning = tone === 'warning';
  const confirmClass = isDanger
    ? 'bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-[4px_4px_0_#4a1010]'
    : isWarning
      ? 'bg-[#f59e0b] text-[#20170a] hover:bg-[#d97706] shadow-[4px_4px_0_#4a2d08]'
      : 'bg-brand-mint text-brand-plum hover:bg-brand-mint-hover shadow-[4px_4px_0_#151214]';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="w-full max-w-md rounded-[24px] border-2 border-[#171717] bg-gradient-to-b from-[#1f1320] via-[#171318] to-[#120d12] p-7 shadow-[10px_10px_0_#000000] space-y-6">
        <div className="space-y-3">
          <div className={`w-14 h-14 rounded-2xl border-2 border-[#171717] flex items-center justify-center shadow-[4px_4px_0_#000000] ${isDanger ? 'bg-red-500/10 text-red-400' : isWarning ? 'bg-amber-500/10 text-amber-400' : 'bg-brand-mint/10 text-brand-mint'}`}>
            {isDanger ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">{title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 bg-white/95 border-2 border-[#171717] text-[#171717] font-black rounded-xl shadow-[4px_4px_0_#000000] transition-all hover:bg-white active:translate-y-0.5 active:shadow-[1px_1px_0_#000000] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 border-2 border-[#171717] font-black rounded-xl transition-all active:translate-y-0.5 active:shadow-[1px_1px_0_#000000] disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onGoogleLogin, loading, errorMsg }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    window.onTurnstileSuccess = (token) => {
      setTurnstileToken(token);
    };

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      delete window.onTurnstileSuccess;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!turnstileToken) {
      setLocalError("Complete the Cloudflare verification before signing in.");
      return;
    }
    setLocalError('');
    onLogin(email, password, turnstileToken);
  };

  return (
    <div className="fasthtml-login h-screen w-screen bg-brand-plum-dark flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div className="fh-icon-shape fh-icon-yellow absolute -top-8 left-[7vw] w-80 h-80"><Globe /></div>
        <div className="fh-icon-shape fh-icon-green absolute -top-16 right-[8vw] w-72 h-72"><Grid2X2 /></div>
        <div className="fh-icon-shape fh-icon-blue absolute top-[42vh] left-[3vw] w-56 h-56"><Globe /></div>
        <div className="fh-icon-shape fh-icon-coral absolute top-[36vh] right-[10vw] w-60 h-60"><Server /></div>
        <div className="fh-icon-shape fh-icon-pink absolute bottom-[8vh] left-[17vw] w-64 h-64"><Key /></div>
        <div className="fh-icon-shape fh-icon-purple absolute bottom-[5vh] right-[5vw] w-72 h-72"><Shield /></div>
        <div className="fh-icon-shape fh-icon-lime absolute top-[12vh] left-[44vw] w-40 h-40"><Sparkles /></div>
      </div>

      <div className="fasthtml-login-card glassmorphism-card rounded-3xl p-8 w-full max-w-md shadow-2xl relative z-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center mx-auto shadow-inner">
            <Shield className="w-6 h-6 text-brand-yellow" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Mail Server Admin</h2>
            <p className="text-xs text-slate-400 font-medium">Manage domains, mailboxes, aliases, DNS, and server health.</p>
          </div>
        </div>

        {(errorMsg || localError) && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMsg || localError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
            <input 
              type="email" 
              required
              placeholder="admin@domain.co.zw" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
            <input 
              type="password" 
              required
              placeholder="••••••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-mint"
            />
          </div>

          <div className="flex justify-center py-1 min-h-[65px]">
            <div 
              className="cf-turnstile" 
              data-sitekey="0x4AAAAAACTKXzb7GlULcNSk" 
              data-callback="onTurnstileSuccess"
            ></div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !turnstileToken}
            className="w-full bg-brand-mint hover:bg-brand-mint-hover disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-plum font-extrabold text-sm py-3.5 rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-brand-mint/15"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            Sign in to admin
          </button>
        </form>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="mx-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">or</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={loading}
          className="w-full bg-white hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-extrabold text-sm py-3.5 rounded-full transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-black text-blue-600">G</span>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
