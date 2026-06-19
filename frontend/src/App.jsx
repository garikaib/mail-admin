import { useState, useEffect, useRef } from 'react';
import { 
  Server, Shield, Key, Globe, Mail, Link as LinkIcon, LogOut, 
  Search, Plus, Check, AlertTriangle, RefreshCw, Trash2, Edit2, 
  Settings, Users, ChevronRight, Activity, Clock, Grid2X2, CheckCircle2, MessageCircle, Flower2, Sparkles,
  Menu, X, Copy, Lock, Cloud, CloudOff, ArrowLeft, Sliders, Edit, Eye, Power, RotateCcw, Play, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

const API_BASE = '/api';

import EditorModule from 'react-simple-code-editor';

const CodeEditor = EditorModule?.default?.default || EditorModule?.default || EditorModule;

import { 
  applyOnlyToText, highlightConfig, getNginxDirective, setNginxDirective,
  configDisplayPath, getFlagEmoji, parseUTC, formatDateTime, formatDateOnly,
  formatTimeOnly, generateSecurePassword 
} from './shared/lib/helpers';

import { CredentialsPanel } from './features/credentials/CredentialsPanel';
import { api } from './shared/api/client';
import { ServerHealthPanel } from './features/server-health/ServerHealthPanel';
import { LogsPanel } from './features/logs/LogsPanel';
import { UsersPanel } from './features/users/UsersPanel';
import { PlansPanel } from './features/plans/PlansPanel';
import { RegistrationsPanel } from './features/registrations/RegistrationsPanel';
import { GeoAuthPanel } from './features/geo-auth/GeoAuthPanel';
import useAppStore from './store/useAppStore';

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
  const logsContainerRef = useRef(null);
  const [token, setToken] = useState(() => localStorage.getItem('mail_admin_token') || '');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mail_admin_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    const path = window.location.pathname.substring(1);
    const validPaths = DASHBOARD_ROUTES.map(r => r.path);
    return validPaths.includes(path) ? path : 'domains';
  });
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const {
  domains, setDomains,
  plans, setPlans,
  credentials, setCredentials,
  systemHealth, setSystemHealth,
  mailboxes, setMailboxes,
  aliases, setAliases,
  showAddCredModal, setShowAddCredModal,
  showEditCredModal, setShowEditCredModal,
  editingCredential, setEditingCredential,
  editCredLabel, setEditCredLabel,
  editCredEmail, setEditCredEmail,
  editCredKey, setEditCredKey,
  provisionLogs, setProvisionLogs,
  pollingDomain, setPollingDomain,
  trackedProvisioningDomain, setTrackedProvisioningDomain,
  showProvisioningModal, setShowProvisioningModal,
  loading, setLoading,
  errorMsg, setErrorMsg,
  successMsg, setSuccessMsg,
  showAddDomainModal, setShowAddDomainModal,
  showDnsReviewModal, setShowDnsReviewModal,
  dnsReviewData, setDnsReviewData,
  editedDnsRecords, setEditedDnsRecords,
  copied, setCopied,
} = useAppStore();
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAddAliasModal, setShowAddAliasModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [resetPwdModal, setResetPwdModal] = useState(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const [serverControlTab, setServerControlTab] = useState('performance'); // performance, services, configs
  const [detailedServices, setDetailedServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [logsService, setLogsService] = useState('');
  const [serviceLogs, setServiceLogs] = useState([]);
  const [serviceLogsLoading, setServiceLogsLoading] = useState(false);
  const [logsLimit, setLogsLimit] = useState(100);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [logsInterval, setLogsInterval] = useState(5000);
  const [logsSince, setLogsSince] = useState('1h');
  const [logsPriority, setLogsPriority] = useState('all');
  const [logsQuery, setLogsQuery] = useState('');
  const [serviceRailExpanded, setServiceRailExpanded] = useState(false);
  const [configFiles, setConfigFiles] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configIsDirty, setConfigIsDirty] = useState(false);
  const [configValidation, setConfigValidation] = useState(null);
  const [isValidatingConfig, setIsValidatingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [serviceActionLoading, setServiceActionLoading] = useState({});

  // Geolocation Auth State
  const [geoSettings, setGeoSettings] = useState([]);
  const [geoExceptions, setGeoExceptions] = useState([]);
  const [geoBans, setGeoBans] = useState([]);
  const [showAddGeoExceptionModal, setShowAddGeoExceptionModal] = useState(false);
  const [sshAllowedCountries, setSshAllowedCountries] = useState('');
  const [sshAllowedRegions, setSshAllowedRegions] = useState('SADC');

  const [geoExcUsername, setGeoExcUsername] = useState('');
  const [geoExcService, setGeoExcService] = useState('all');
  const [geoExcCountries, setGeoExcCountries] = useState('');
  const [geoExcExpires, setGeoExcExpires] = useState('');

  const [selectedGeoDomainId, setSelectedGeoDomainId] = useState('');
  const [geoAllowedCountries, setGeoAllowedCountries] = useState('');
  const [geoAllowedRegions, setGeoAllowedRegions] = useState('SADC');
  const [geoAugmentDefault, setGeoAugmentDefault] = useState(true);
  const [sshAugmentDefault, setSshAugmentDefault] = useState(true);
  const [editingRegion, setEditingRegion] = useState(null);
  const [editingRegionCountries, setEditingRegionCountries] = useState('');
  const [geoRegions, setGeoRegions] = useState([]);
  const [geoSubTab, setGeoSubTab] = useState('mail');
  const [sshLogs, setSshLogs] = useState('');



  // Cloudflare Zones & DNS management state
  const [cloudflareZones, setCloudflareZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneDnsRecords, setZoneDnsRecords] = useState([]);
  const [selectedCredential, setSelectedCredential] = useState(null);
  
  // Filtering for Cloudflare zones
  const [cfZoneSearchQuery, setCfZoneSearchQuery] = useState('');
  const [cfZoneStatusFilter, setCfZoneStatusFilter] = useState('all'); // all, matched, unmatched
  const [cfAccountFilter, setCfAccountFilter] = useState('all');

  // Modals for DNS Record CRUD
  const [showAddDnsRecordModal, setShowAddDnsRecordModal] = useState(false);
  const [showEditDnsRecordModal, setShowEditDnsRecordModal] = useState(false);
  const [editingDnsRecord, setEditingDnsRecord] = useState(null);

  // Form inputs for DNS Record
  const [dnsRecordType, setDnsRecordType] = useState('A');
  const [dnsRecordName, setDnsRecordName] = useState('');
  const [dnsRecordContent, setDnsRecordContent] = useState('');
  const [dnsRecordPriority, setDnsRecordPriority] = useState('');
  const [dnsRecordProxied, setDnsRecordProxied] = useState(false);
  const [dnsRecordTtl, setDnsRecordTtl] = useState('3600');

  
  // Temporary Form Inputs
  const [newDomainName, setNewDomainName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedCredId, setSelectedCredId] = useState('');
  const [saveCredCheckbox, setSaveCredCheckbox] = useState(false);
  const [cfEmailInput, setCfEmailInput] = useState('');
  const [cfApiKeyInput, setCfApiKeyInput] = useState('');
  
  const [newMailboxLocal, setNewMailboxLocal] = useState('');
  const [newMailboxPwd, setNewMailboxPwd] = useState('');
  const [newMailboxName, setNewMailboxName] = useState('');
  const newMailboxQuota = 1048576; // 1GB in KB
  
  const [newAliasSource, setNewAliasSource] = useState('');
  const [newAliasDest, setNewAliasDest] = useState('');
  const [editingAlias, setEditingAlias] = useState(null);
  const [editAliasDest, setEditAliasDest] = useState('');
  
  const [newCredLabel, setNewCredLabel] = useState('');
  const [newCredEmail, setNewCredEmail] = useState('');
  const [newCredKey, setNewCredKey] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [pwdModalError, setPwdModalError] = useState('');
  const [pwdModalSuccess, setPwdModalSuccess] = useState('');
  const [pwdModalLoading, setPwdModalLoading] = useState(false);

  useEffect(() => {
    if (logsService && logsContainerRef.current && window.innerWidth < 768) {
      logsContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsService]);


  useEffect(() => {
    console.log('[credentials] modal state', {
      showAddCredModal,
      showEditCredModal,
      editingCredential,
      editCredLabel,
      editCredEmail,
      editCredKey,
    });
  }, [showAddCredModal, showEditCredModal, editingCredential, editCredLabel, editCredEmail, editCredKey]);



  // URL Path Routing Effect
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.substring(1);
      const validPaths = DASHBOARD_ROUTES.map(r => r.path);
      setActiveTab(validPaths.includes(path) ? path : 'domains');
    };

    window.addEventListener('popstate', handlePopState);
    
    // Set initial path if authenticated and path is empty
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
  }, [user]);

  const handleTabChange = (path) => {
    window.history.pushState(null, '', `/${path}`);
    setActiveTab(path);
    setSelectedDomain(null);
    setSelectedCredential(null);
    setSelectedZone(null);
    setMobileMenuOpen(false);
  };

  // Handle Deep Linking from URL parameters
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    
    if (activeTab === 'domains') {
      const domParam = params.get('domain');
      if (domParam) {
        if (domains.length > 0) {
          const found = domains.find(d => d.name === domParam);
          if (found && (!selectedDomain || selectedDomain.name !== domParam)) {
            handleSelectDomain(found);
          }
        }
      } else {
        if (selectedDomain) {
          setTimeout(() => setSelectedDomain(null), 0);
        }
      }
    }
    
    if (activeTab === 'credentials') {
      const credParam = params.get('cred_id');
      const zoneParam = params.get('zone_id');
      
      if (credParam) {
        if (credentials.length > 0) {
          const foundCred = credentials.find(c => c.id === parseInt(credParam));
          if (foundCred) {
            if (!selectedCredential || selectedCredential.id !== foundCred.id) {
              setTimeout(() => setSelectedCredential(foundCred), 0);
            }
            
            if (zoneParam && cloudflareZones.length > 0) {
              const foundZone = cloudflareZones.find(z => z.zone_id === zoneParam && z.credential_id === foundCred.id);
              if (foundZone) {
                if (!selectedZone || selectedZone.zone_id !== zoneParam) {
                  setTimeout(() => {
                    setSelectedZone(foundZone);
                    fetchDnsRecords(foundCred.id, zoneParam);
                  }, 0);
                }
              }
            } else if (!zoneParam && selectedZone) {
              setTimeout(() => setSelectedZone(null), 0);
            }
          }
        }
      } else {
        if (selectedCredential || selectedZone) {
          setTimeout(() => {
            setSelectedCredential(null);
            setSelectedZone(null);
          }, 0);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, domains, credentials, cloudflareZones, window.location.search, token]);

  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_superuser) return true;
    if (!user.permissions) return false;
    if (permission.includes('||')) {
      return permission.split('||').some(p => user.permissions.includes(p.trim()));
    }
    return !!user.permissions.includes(permission);
  };
  
  // Dynamic Route Guard / Safeguard Redirects
  useEffect(() => {
    if (user) {
      const allowedRoutes = DASHBOARD_ROUTES.filter(r => hasPermission(r.permission));
      
      // If current activeTab is unauthorized, redirect to the first allowed route
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  // Auto-clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  // Polling for provisioning status
  useEffect(() => {
    let interval;
    if (trackedProvisioningDomain) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${API_BASE}/domains/provision/status/${trackedProvisioningDomain}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const logs = await res.json();
            setProvisionLogs(logs);
            
            // Check if complete or failed
            const latest = logs[0];
            if (latest) {
              if ((latest.step === 'COMPLETE' && latest.status === 'SUCCESS') || latest.status === 'FAILED' || latest.step === 'CRITICAL') {
                setPollingDomain(null);
                fetchDomains();
                if (interval) {
                  clearInterval(interval);
                  interval = null;
                }
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchStatus();
      interval = setInterval(fetchStatus, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedProvisioningDomain, token]);

  // Sync server control detailed data
  useEffect(() => {
    if (token && activeTab === 'health') {
      if (serverControlTab === 'services') {
        fetchDetailedServices();
      } else if (serverControlTab === 'configs') {
        fetchConfigFiles();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, serverControlTab, token]);

  // Fetch config content when selected config ID changes
  useEffect(() => {
    if (token && activeTab === 'health' && serverControlTab === 'configs' && selectedConfigId) {
      fetchConfigContent(selectedConfigId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId, serverControlTab, activeTab, token]);

  // Fetch log lines when active log service selection changes
  useEffect(() => {
    if (token && activeTab === 'health' && serverControlTab === 'services' && logsService) {
      fetchServiceLogs(logsService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsService, serverControlTab, activeTab, token]);

  // Handle auto-refresh interval for service logs
  useEffect(() => {
    let interval;
    if (token && activeTab === 'health' && serverControlTab === 'services' && logsService && autoRefreshLogs) {
      interval = setInterval(() => {
        fetchServiceLogs(logsService, logsLimit);
      }, logsInterval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab, serverControlTab, logsService, autoRefreshLogs, logsLimit, logsInterval, logsSince, logsPriority, logsQuery]);

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
          // Check local storage for persistent token first
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
          localStorage.setItem('mail_admin_token', data.access_token);
          localStorage.setItem('mail_admin_user', JSON.stringify({
            email: data.email,
            is_superuser: data.is_superuser,
            has_password: data.has_password,
            roles: data.roles || [],
            permissions: data.permissions || []
          }));
          fetchInitialData(data.access_token, data.is_superuser, data.permissions || []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      localStorage.setItem('mail_admin_token', data.access_token);
      localStorage.setItem('mail_admin_user', JSON.stringify({
        email: data.email,
        is_superuser: data.is_superuser,
        has_password: data.has_password,
        roles: data.roles || [],
        permissions: data.permissions || []
      }));
      // Fetch initial data
      fetchInitialData(data.access_token, data.is_superuser, data.permissions || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('mail_admin_token');
    localStorage.removeItem('mail_admin_user');
    window.history.replaceState(null, '', '/');
    setSelectedDomain(null);
    setDomains([]);
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
      
      // Update the user state locally so it knows they now have a password set
      const updatedUser = { ...user, has_password: true };
      setUser(updatedUser);
      localStorage.setItem('mail_admin_user', JSON.stringify(updatedUser));
      
      // Reset inputs
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      
      // Close modal after a brief delay
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

  function fetchInitialData(authToken, isSuper, userPermissions = []) {
    fetchDomains(authToken);
    fetchPlans(authToken);
    fetchCredentials(authToken);
    fetchCloudflareZones(authToken);
    if (isSuper || userPermissions.includes('system:health')) {
      fetchSystemHealth(authToken);
    }
    if (isSuper || userPermissions.includes('system:service_status')) {
      fetchDetailedServices(authToken);
    }

    if (isSuper || userPermissions.includes('geo_mail:view') || userPermissions.includes('geo_ssh:view')) {
      fetchGeoData(authToken);
    }
  };

  async function fetchGeoData(t = token) {
    try {
      const isSuper = user?.is_superuser;
      const permissions = user?.permissions || [];
      const hasMail = isSuper || permissions.includes('geo_mail:view');
      const hasSsh = isSuper || permissions.includes('geo_ssh:view');

      const promises = [];
      if (hasMail) {
        promises.push(fetch(`${API_BASE}/geo-auth/settings`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : []));
      } else {
        promises.push(Promise.resolve([]));
      }
      if (hasMail || hasSsh) {
        promises.push(fetch(`${API_BASE}/geo-auth/exceptions`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : []));
        promises.push(fetch(`${API_BASE}/geo-auth/bans`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : []));
        promises.push(fetch(`${API_BASE}/geo-auth/regions`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : []));
      } else {
        promises.push(Promise.resolve([]));
        promises.push(Promise.resolve([]));
        promises.push(Promise.resolve([]));
      }
      if (hasSsh) {
        promises.push(fetch(`${API_BASE}/geo-auth/ssh-settings`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : null));
        promises.push(fetch(`${API_BASE}/geo-auth/ssh-logs`, { headers: { 'Authorization': `Bearer ${t}` } }).then(r => r.ok ? r.json() : { logs: '' }));
      } else {
        promises.push(Promise.resolve(null));
        promises.push(Promise.resolve({ logs: '' }));
      }

      const [settings, exceptions, bans, regionsData, sshData, sshLogsData] = await Promise.all(promises);
      setGeoSettings(settings);
      setGeoExceptions(exceptions);
      setGeoBans(bans);
      setGeoRegions(regionsData || []);
      if (sshData) {
        setSshAllowedCountries(sshData.allowed_countries || '');
        setSshAllowedRegions(sshData.allowed_regions || 'SADC');
        setSshAugmentDefault(sshData.augment_default !== false);
      }
      if (sshLogsData) {
        setSshLogs(sshLogsData.logs || '');
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleSaveGeoPolicy = async (e) => {
    e.preventDefault();
    if (!selectedGeoDomainId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/geo-auth/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          domain_id: parseInt(selectedGeoDomainId),
          allowed_countries: geoAllowedCountries,
          allowed_regions: geoAllowedRegions,
          augment_default: geoAugmentDefault
        })
      });
      if (res.ok) {
        setSuccessMsg('Domain policy updated successfully.');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to update policy.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSshPolicy = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/geo-auth/ssh-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          allowed_countries: sshAllowedCountries,
          allowed_regions: sshAllowedRegions,
          augment_default: sshAugmentDefault
        })
      });
      if (res.ok) {
        setSuccessMsg('SSH global policy updated successfully.');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to update SSH policy.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRegion = async (name, countries) => {
    try {
      const res = await fetch(`${API_BASE}/geo-auth/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, countries })
      });
      if (res.ok) {
        setSuccessMsg(`Region ${name} updated successfully.`);
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to update region.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleResetRegions = async () => {
    if (!window.confirm('Are you sure you want to reset all country groups to default templates? All custom definitions will be restored to presets.')) return;
    try {
      const res = await fetch(`${API_BASE}/geo-auth/regions/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setSuccessMsg('Region templates restored successfully.');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to reset regions.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };



  const handleDeleteGeoException = async (username, service, allowedCountries = '', expiresAt = null) => {
    if (!window.confirm(`Delete exception for ${username} (${service})?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/geo-auth/exceptions`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          service,
          allowed_countries: allowedCountries,
          expires_at: expiresAt,
        })
      });
      if (res.ok) {
        setSuccessMsg('User exception deleted successfully.');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to delete exception.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeoException = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/geo-auth/exceptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: geoExcUsername,
          service: geoExcService,
          allowed_countries: geoExcCountries,
          expires_at: geoExcExpires ? new Date(geoExcExpires).toISOString() : null
        })
      });
      if (res.ok) {
        setSuccessMsg('User exception created successfully.');
        setShowAddGeoExceptionModal(false);
        setGeoExcUsername('');
        setGeoExcService('all');
        setGeoExcCountries('');
        setGeoExcExpires('');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to create exception.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearGeoBan = async (ipAddress, service) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/geo-auth/bans/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ip_address: ipAddress, service })
      });
      if (res.ok) {
        setSuccessMsg('Ban cleared successfully.');
        fetchGeoData();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to clear ban.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  async function fetchDomains(t = token) {
    try {
      const res = await fetch(`${API_BASE}/domains`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  async function fetchPlans() {
    try {
      const data = await api.get('/domains/plans');
      setPlans(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCredentials = async (t = token) => {
    try {
      const res = await fetch(`${API_BASE}/domains/credentials`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCredentials(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCloudflareZones = async (t = token) => {
    try {
      const res = await fetch(`${API_BASE}/domains/cloudflare-zones`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCloudflareZones(data);
      }
    } catch (err) {
      console.error(err);
    }
  };


  async function fetchDnsRecords(credId, zoneId, t = token) {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${credId}/zones/${zoneId}/dns-records`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setZoneDnsRecords(data);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to fetch DNS records");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load DNS records");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDnsRecord = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: dnsRecordType,
          name: dnsRecordName,
          content: dnsRecordContent,
          priority: dnsRecordPriority ? parseInt(dnsRecordPriority) : null,
          proxied: dnsRecordProxied,
          ttl: dnsRecordTtl ? parseInt(dnsRecordTtl) : 3600
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create DNS record");
      
      setSuccessMsg("DNS record created successfully!");
      setShowAddDnsRecordModal(false);
      
      // Reset form
      setDnsRecordType('A');
      setDnsRecordName('');
      setDnsRecordContent('');
      setDnsRecordPriority('');
      setDnsRecordProxied(false);
      setDnsRecordTtl('3600');
      
      // Refresh
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleUpdateDnsRecord = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records/${editingDnsRecord.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: dnsRecordType,
          name: dnsRecordName,
          content: dnsRecordContent,
          priority: dnsRecordPriority ? parseInt(dnsRecordPriority) : null,
          proxied: dnsRecordProxied,
          ttl: dnsRecordTtl ? parseInt(dnsRecordTtl) : 3600
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update DNS record");
      
      setSuccessMsg("DNS record updated successfully!");
      setShowEditDnsRecordModal(false);
      setEditingDnsRecord(null);
      
      // Refresh
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleEditDnsRecord = (record) => {
    setEditingDnsRecord(record);
    setDnsRecordType(record.type);
    setDnsRecordName(record.name);
    setDnsRecordContent(record.content);
    setDnsRecordPriority(record.priority !== undefined && record.priority !== null ? String(record.priority) : '');
    setDnsRecordProxied(record.proxied || false);
    setDnsRecordTtl(String(record.ttl || 3600));
    setShowEditDnsRecordModal(true);
  };

  const handleDeleteDnsRecord = async (recordId) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${selectedCredential.id}/zones/${selectedZone.zone_id}/dns-records/${recordId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete DNS record");
      
      setSuccessMsg("DNS record deleted successfully!");
      // Refresh
      fetchDnsRecords(selectedCredential.id, selectedZone.zone_id);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const fetchSystemHealth = async (t = token) => {
    try {
      const res = await fetch(`${API_BASE}/system/health`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (err) {
      console.error(err);
    }
  };



  async function fetchDetailedServices(t = token) {
    setServicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system/services/status`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDetailedServices(data);
      }
    } catch (err) {
      console.error("Failed to fetch detailed services status:", err);
    } finally {
      setServicesLoading(false);
    }
  };

  const handleServiceControl = async (serviceName, action) => {
    if (action === 'stop' && !window.confirm(`Are you absolutely sure you want to STOP the ${serviceName} service? This may disrupt mail delivery.`)) {
      return;
    }
    
    setServiceActionLoading(prev => ({ ...prev, [serviceName]: action }));
    try {
      const res = await fetch(`${API_BASE}/system/services/${serviceName}/control`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || `Service ${serviceName} ${action}ed successfully.`);
        fetchDetailedServices();
        fetchSystemHealth();
      } else {
        setErrorMsg(data.detail || `Failed to ${action} service.`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(`An error occurred while controlling the service.`);
    } finally {
      setServiceActionLoading(prev => ({ ...prev, [serviceName]: null }));
    }
  };

  async function fetchServiceLogs(serviceName, limit = logsLimit) {
    setServiceLogsLoading(true);
    try {
      const params = new URLSearchParams({ service: serviceName, limit: String(limit) });
      if (logsSince) params.set('since', logsSince);
      if (logsPriority && logsPriority !== 'all') params.set('priority', logsPriority);
      if (logsQuery) params.set('q', logsQuery);
      const res = await fetch(`${API_BASE}/system/journal?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServiceLogs(data.logs || []);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to fetch logs.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to fetch service logs.");
    } finally {
      setServiceLogsLoading(false);
    }
  };

  async function fetchConfigFiles() {
    try {
      const res = await fetch(`${API_BASE}/system/configs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfigFiles(data);
        if (data.length > 0 && !selectedConfigId) {
          setSelectedConfigId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch configs list:", err);
    }
  };

  async function fetchConfigContent(configId) {
    if (!configId) return;
    setConfigLoading(true);
    setConfigValidation(null);
    try {
      const res = await fetch(`${API_BASE}/system/configs/${configId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfigContent(data.content);
        setConfigIsDirty(false);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to fetch configuration content.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load configuration file.");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleValidateConfig = async () => {
    if (!selectedConfigId) return;
    setIsValidatingConfig(true);
    setConfigValidation(null);
    try {
      const res = await fetch(`${API_BASE}/system/configs/${selectedConfigId}/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: configContent })
      });
      const data = await res.json();
      if (res.ok) {
        setConfigValidation(data);
      } else {
        setConfigValidation({ valid: false, message: data.detail || "Validation check failed." });
      }
    } catch (err) {
      console.error(err);
      setConfigValidation({ valid: false, message: "Network error during syntax validation." });
    } finally {
      setIsValidatingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedConfigId) return;
    if (!window.confirm("Are you sure you want to save and apply this configuration? Syntax tests will run, and the service will be reloaded on success.")) {
      return;
    }
    setIsSavingConfig(true);
    setConfigValidation(null);
    try {
      const res = await fetch(`${API_BASE}/system/configs/${selectedConfigId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: configContent })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || "Configuration saved and applied successfully!");
        setConfigIsDirty(false);
        setConfigValidation({ valid: true, message: "Configuration applied and syntax validation passed." });
      } else {
        const detail = data.detail || "Failed to save configuration.";
        setErrorMsg(detail);
        setConfigValidation({ valid: false, message: detail });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error occurred while saving the configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleToggleNginxSite = () => {
    const selectedConfig = configFiles.find(cf => cf.id === selectedConfigId);
    if (!selectedConfig || selectedConfig.kind !== 'nginx_site') return;
    const action = selectedConfig.enabled ? 'disable' : 'enable';
    
    showConfirm({
      title: `${selectedConfig.enabled ? 'Disable' : 'Enable'} Nginx Site`,
      message: `Are you sure you want to ${action} ${selectedConfig.filename}? A configuration syntax test will run automatically to prevent server failures.`,
      confirmLabel: selectedConfig.enabled ? 'Confirm Disable' : 'Confirm Enable',
      tone: selectedConfig.enabled ? 'danger' : 'default',
      onConfirm: async () => {
        setIsSavingConfig(true);
        setConfigValidation(null);
        try {
          const siteId = selectedConfigId.replace('nginx_site_', '');
          const res = await fetch(`${API_BASE}/system/configs/nginx/${siteId}/toggle`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            setSuccessMsg(data.message || `Nginx site ${action}d successfully.`);
            setConfigFiles(prev => prev.map(cf => cf.id === selectedConfigId ? { ...cf, enabled: data.enabled } : cf));
            setConfigValidation({ valid: true, message: data.message || `Nginx site ${action}d successfully.` });
          } else {
            const detail = data.detail || `Failed to ${action} Nginx site.`;
            setErrorMsg(detail);
            setConfigValidation({ valid: false, message: detail });
          }
        } catch (err) {
          console.error(err);
          setErrorMsg("Network error occurred while toggling the Nginx site.");
        } finally {
          setIsSavingConfig(false);
        }
      }
    });
  };





  async function handleSelectDomain(dom) {
    setSelectedDomain(dom);
    const params = new URLSearchParams(window.location.search);
    if (params.get('domain') !== dom.name) {
      window.history.pushState(null, '', `/domains?domain=${dom.name}`);
    }
    setLoading(true);
    try {
      // Fetch users
      const usersRes = await fetch(`${API_BASE}/users/domain/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setMailboxes(usersData);
      }
      
      // Fetch aliases
      const aliasesRes = await fetch(`${API_BASE}/aliases/domain/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (aliasesRes.ok) {
        const aliasesData = await aliasesRes.json();
        setAliases(aliasesData);
      }

      // Fetch provision logs
      const logsRes = await fetch(`${API_BASE}/domains/provision/status/${dom.name}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setProvisionLogs(logsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionDomain = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    try {
      let body = {
        name: newDomainName,
        plan_id: parseInt(selectedPlanId)
      };

      if (selectedCredId && selectedCredId !== 'new') {
        body.cred_id = parseInt(selectedCredId);
      } else {
        body.cf_email = cfEmailInput;
        body.cf_key = cfApiKeyInput;
        body.save_cred = saveCredCheckbox;
      }

      const res = await fetch(`${API_BASE}/domains/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to start provisioning');
      }

      if (data.status === 'pending_dns_review') {
        setDnsReviewData(data);
        setEditedDnsRecords(data.dns_records);
        setShowDnsReviewModal(true);
        setShowAddDomainModal(false);
        setNewDomainName('');
        setCfEmailInput('');
        setCfApiKeyInput('');
        return;
      }

      setSuccessMsg(data.message);
      setPollingDomain(newDomainName);
      setTrackedProvisioningDomain(newDomainName);
      setShowProvisioningModal(true);
      setProvisionLogs([]);
      setShowAddDomainModal(false);
      
      // Clear forms
      setNewDomainName('');
      setCfEmailInput('');
      setCfApiKeyInput('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmProvision = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/provision/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          domain: dnsReviewData.domain,
          plan_id: dnsReviewData.plan_id,
          cred_id: dnsReviewData.cred_id,
          cf_email: dnsReviewData.cf_email,
          cf_key: dnsReviewData.cf_key,
          dns_records: editedDnsRecords
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to confirm provisioning');
      }

      setSuccessMsg(data.message);
      setPollingDomain(dnsReviewData.domain);
      setTrackedProvisioningDomain(dnsReviewData.domain);
      setShowProvisioningModal(true);
      setProvisionLogs([]);
      setShowDnsReviewModal(false);
      setDnsReviewData(null);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDnsRecordFieldChange = (index, field, value) => {
    const updated = [...editedDnsRecords];
    updated[index] = { ...updated[index], [field]: value };
    setEditedDnsRecords(updated);
  };


  const showConfirm = ({ title, message, confirmLabel = 'Confirm', tone = 'default', onConfirm }) => {
    setConfirmModal({ title, message, confirmLabel, tone, onConfirm });
  };

  const runConfirmedAction = async () => {
    if (!confirmModal?.onConfirm) return;
    const action = confirmModal.onConfirm;
    setConfirmModal(null);
    await action();
  };

  async function deleteDomainConfirmed(domainId) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/domains/${domainId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete domain');
      }
      setSuccessMsg(data.message);
      fetchDomains();
      if (selectedDomain && selectedDomain.id === domainId) {
        setSelectedDomain(null);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteDomain = (domainId, domainName) => {
    showConfirm({
      title: 'Delete domain?',
      message: (
        <div className="space-y-3">
          <p className="text-sm text-red-600 font-semibold bg-red-50 p-3 rounded-xl border border-red-200">
            ⚠️ WARNING: This is a destructive action that will completely purge all data!
          </p>
          <div className="bg-slate-100 p-4 rounded-xl border border-black/10 text-xs space-y-2 text-[#3c353d]">
            <span className="font-bold text-[#151214] block">Assets Scheduled for Removal:</span>
            <ul className="list-disc pl-4 space-y-1 font-mono">
              <li>Cloudflare DNS records (MX, SPF, DMARC, DKIM, CNAME)</li>
              <li>Wildcard SSL certificates from Lego</li>
              <li>Nginx site configurations ({domainName}.conf)</li>
              <li>Mailboxes & folders in /var/vmail/{domainName}/*</li>
              <li>All associated mail user accounts & aliases</li>
              <li>SOGo database tables & user profiles</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500 italic">
            Please verify all backups before proceeding.
          </p>
        </div>
      ),
      confirmLabel: 'Purge Everything',
      tone: 'danger',
      onConfirm: () => deleteDomainConfirmed(domainId),
    });
  };

  const handleAddMailbox = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/users/domain/${selectedDomain.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: `${newMailboxLocal}@${selectedDomain.name}`,
          password: newMailboxPwd,
          full_name: newMailboxName || newMailboxLocal,
          quota_kb: parseInt(newMailboxQuota)
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create mailbox');
      }
      
      setSuccessMsg(`Mailbox created successfully. Email: ${data.email}`);
      setShowAddUserModal(false);
      setNewMailboxLocal('');
      setNewMailboxPwd('');
      setNewMailboxName('');
      
      // Refresh user list
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetMailboxPwdConfirmed = async (email) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${email}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }
      setResetPwdModal({ email, password: data.new_password });
      setSuccessMsg(`Password reset for ${email}`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetMailboxPwd = (email) => {
    showConfirm({
      title: 'Reset mailbox password?',
      message: `Generate a new password for ${email}. The password will be shown once after reset.`,
      confirmLabel: 'Reset password',
      tone: 'warning',
      onConfirm: () => resetMailboxPwdConfirmed(email),
    });
  };

  const deleteMailboxConfirmed = async (email) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${email}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete mailbox');
      }
      setSuccessMsg(data.message);
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMailbox = (email) => {
    showConfirm({
      title: 'Delete mailbox?',
      message: `This will purge ${email} and its mailbox folder on the server.`,
      confirmLabel: 'Delete mailbox',
      tone: 'danger',
      onConfirm: () => deleteMailboxConfirmed(email),
    });
  };

  const handleAddAlias = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/aliases/domain/${selectedDomain.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          source: `${newAliasSource}@${selectedDomain.name}`,
          destination: newAliasDest
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create alias');
      }
      
      setSuccessMsg(`Alias created: ${data.source} -> ${data.destination}`);
      setShowAddAliasModal(false);
      setNewAliasSource('');
      setNewAliasDest('');
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAlias = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/aliases/${editingAlias.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          destination: editAliasDest
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update alias');
      }
      
      setSuccessMsg(`Alias updated successfully`);
      setEditingAlias(null);
      setEditAliasDest('');
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAliasConfirmed = async (aliasId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/aliases/${aliasId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete alias');
      }
      setSuccessMsg(data.message);
      handleSelectDomain(selectedDomain);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlias = (aliasId) => {
    showConfirm({
      title: 'Delete alias?',
      message: 'This forwarding rule will be removed immediately.',
      confirmLabel: 'Delete alias',
      tone: 'danger',
      onConfirm: () => deleteAliasConfirmed(aliasId),
    });
  };

  const handleAddCredential = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: newCredLabel,
          email: newCredEmail,
          api_key: newCredKey
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to add credential');
      }
      setSuccessMsg(`Cloudflare credential '${newCredLabel}' added successfully.`);
      setShowAddCredModal(false);
      setNewCredLabel('');
      setNewCredEmail('');
      setNewCredKey('');
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCredential = async (e) => {
    e.preventDefault();
    if (!editingCredential) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${editingCredential.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: editCredLabel,
          email: editCredEmail,
          api_key: editCredKey || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update credential');
      }
      setSuccessMsg(`Cloudflare credential '${editCredLabel}' updated successfully.`);
      setShowEditCredModal(false);
      setEditingCredential(null);
      setEditCredLabel('');
      setEditCredEmail('');
      setEditCredKey('');
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleScanZoneOwnership = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/domains/zone-ownership/scan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to scan Cloudflare zones');
      }
      fetchCloudflareZones();
      setSuccessMsg(`Scanned ${data.length} domain zones.`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteCredentialConfirmed = async (credId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/domains/credentials/${credId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete credential');
      }
      setSuccessMsg(data.message);
      fetchCredentials();
      fetchCloudflareZones();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCredential = (credId) => {
    showConfirm({
      title: 'Delete Cloudflare credential?',
      message: 'This credential set will be removed. Domains using it may need a replacement credential before future DNS changes.',
      confirmLabel: 'Delete credential',
      tone: 'danger',
      onConfirm: () => deleteCredentialConfirmed(credId),
    });
  };

  const STEP_ORDER = ['TOKEN', 'DNS', 'SSL', 'DKIM', 'NGINX', 'DB'];
  
  const getStepLabel = (stepCode) => {
    switch (stepCode) {
      case 'TOKEN': return 'API Token & Auth';
      case 'DNS': return 'DNS Mail Stack Setup';
      case 'SSL': return 'Wildcard SSL Generation';
      case 'DKIM': return 'DKIM Key Setup';
      case 'NGINX': return 'Nginx Webmail Configuration';
      case 'DB': return 'Database Setup & Admin';
      default: return stepCode;
    }
  };

  const getStepDesc = (stepCode) => {
    switch (stepCode) {
      case 'TOKEN': return 'Creating zone-scoped Cloudflare API Token';
      case 'DNS': return 'Configuring MX, SPF, DMARC, Webmail, and Mail subdomain records';
      case 'SSL': return 'Requesting Let\'s Encrypt SSL certificates via Lego';
      case 'DKIM': return 'Generating signing keys and configuring Rspamd';
      case 'NGINX': return 'Enabling webmail virtual hosts and reloading proxy config';
      case 'DB': return 'Creating database entries and generating default admin account';
      default: return '';
    }
  };

  const getStepStatus = (stepCode) => {
    const stepLogs = provisionLogs.filter(l => l.step === stepCode);
    if (stepLogs.length > 0) {
      if (stepLogs.some(l => l.status === 'FAILED')) return 'failed';
      if (stepLogs.some(l => l.status === 'SUCCESS')) return 'success';
      return 'running';
    }
    
    const myIndex = STEP_ORDER.indexOf(stepCode);
    const hasLaterStep = provisionLogs.some(l => STEP_ORDER.indexOf(l.step) > myIndex);
    if (hasLaterStep) return 'success';
    
    const hasFailure = provisionLogs.some(l => l.status === 'FAILED' || l.step === 'CRITICAL');
    if (hasFailure) return 'aborted';
    
    if (myIndex === 0) return 'running';
    const prevStep = STEP_ORDER[myIndex - 1];
    const prevStatus = getStepStatus(prevStep);
    if (prevStatus === 'success') return 'running';
    
    return 'pending';
  };

  const getProgressPercent = () => {
    let successCount = 0;
    STEP_ORDER.forEach(code => {
      if (getStepStatus(code) === 'success') successCount++;
    });
    return Math.round((successCount / STEP_ORDER.length) * 100);
  };

  const getAdminCredentials = () => {
    const dbLog = provisionLogs.find(l => l.step === 'DB' && l.status === 'SUCCESS');
    if (dbLog && dbLog.details.includes('Admin:')) {
      const match = dbLog.details.match(/Admin:\s*([^\s|]+)\s*\|\s*Password:\s*([^\s|]+)/);
      if (match) {
        return { email: match[1], password: match[2] };
      }
    }
    return null;
  };

  const latestLog = provisionLogs[0];
  const isFinished = latestLog && (
    (latestLog.step === 'COMPLETE' && latestLog.status === 'SUCCESS') || 
    latestLog.status === 'FAILED' || 
    latestLog.step === 'CRITICAL'
  );
  const isSuccess = latestLog && latestLog.step === 'COMPLETE' && latestLog.status === 'SUCCESS';
  const isFailed = latestLog && (latestLog.status === 'FAILED' || latestLog.step === 'CRITICAL');
  const rollbackLogs = provisionLogs.filter(l => l.step === 'ROLLBACK');

  // Filtered domains list
  const filteredDomains = domains.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && d.is_active) || 
                         (statusFilter === 'suspended' && !d.is_active);
    return matchesSearch && matchesStatus;
  });

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
            {/* Close button for Mobile Menu */}
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
        {pollingDomain && (
          <div className="bg-brand-mint/10 border-b border-brand-mint/30 text-brand-mint px-6 py-3 text-sm font-semibold flex items-center justify-between animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Provisioning in progress for <strong>{pollingDomain}</strong>...</span>
            </div>
            <button 
              onClick={() => {
                setTrackedProvisioningDomain(pollingDomain);
                setShowProvisioningModal(true);
              }}
              className="bg-brand-mint/20 hover:bg-brand-mint/30 text-brand-mint text-xs font-bold px-3 py-1.5 rounded-lg border border-brand-mint/30 transition-all cursor-pointer"
            >
              Track Live Progress
            </button>
          </div>
        )}

        <div className="p-8 max-w-6xl w-full mx-auto space-y-8 flex-1 relative z-10">
          {selectedDomain ? (
            /* Selected Domain Detail Page */
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
          ) : (
            <>
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
              )}

              {activeTab === 'credentials' && hasPermission('credentials:read') && (() => {
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
                    handleSelectDomain={handleSelectDomain}
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
                    showConfirm={showConfirm}
                    hasPermission={hasPermission}
                    setEditingDnsRecord={setEditingDnsRecord}
                    setShowEditDnsRecordModal={setShowEditDnsRecordModal}
                  />
                );
              })()}

              {activeTab === 'health' && hasPermission('system:health') && systemHealth && (
                <ServerHealthPanel
                  hasPermission={hasPermission}
                  systemHealth={systemHealth}
                  serverControlTab={serverControlTab}
                  setServerControlTab={setServerControlTab}
                  fetchDetailedServices={fetchDetailedServices}
                  fetchConfigFiles={fetchConfigFiles}
                  detailedServices={detailedServices}
                  fetchSystemHealth={fetchSystemHealth}
                  servicesLoading={servicesLoading}
                  serviceActionLoading={serviceActionLoading}
                  handleServiceControl={handleServiceControl}
                  setLogsService={setLogsService}
                  logsService={logsService}
                  serviceRailExpanded={serviceRailExpanded}
                  setServiceRailExpanded={setServiceRailExpanded}
                  logsSince={logsSince}
                  setLogsSince={setLogsSince}
                  logsPriority={logsPriority}
                  setLogsPriority={setLogsPriority}
                  logsLimit={logsLimit}
                  setLogsLimit={setLogsLimit}
                  logsInterval={logsInterval}
                  setLogsInterval={setLogsInterval}
                  logsQuery={logsQuery}
                  setLogsQuery={setLogsQuery}
                  autoRefreshLogs={autoRefreshLogs}
                  setAutoRefreshLogs={setAutoRefreshLogs}
                  fetchServiceLogs={fetchServiceLogs}
                  serviceLogsLoading={serviceLogsLoading}
                  serviceLogs={serviceLogs}
                  configFiles={configFiles}
                  selectedConfigId={selectedConfigId}
                  setSelectedConfigId={setSelectedConfigId}
                  isSavingConfig={isSavingConfig}
                  handleToggleNginxSite={handleToggleNginxSite}
                  configIsDirty={configIsDirty}
                  configLoading={configLoading}
                  fetchConfigContent={fetchConfigContent}
                  configContent={configContent}
                  setConfigContent={setConfigContent}
                  setConfigIsDirty={setConfigIsDirty}
                  isValidatingConfig={isValidatingConfig}
                  handleValidateConfig={handleValidateConfig}
                  handleSaveConfig={handleSaveConfig}
                  configValidation={configValidation}
                />
              )}

              {activeTab === 'logs' && hasPermission('system:logs') && (
                <LogsPanel
                  hasPermission={hasPermission}
                />
              )}

              {activeTab === 'users' && hasPermission('users:read') && (
                <UsersPanel
                  user={user}
                  setConfirmModal={setConfirmModal}
                  hasPermission={hasPermission}
                />
              )}

              {activeTab === 'plans' && hasPermission('plans:read') && (
                <PlansPanel
                  hasPermission={hasPermission}
                  setConfirmModal={setConfirmModal}
                  onPlansChange={(updatedPlans) => setPlans(updatedPlans)}
                />
              )}

              {activeTab === 'registrations' && hasPermission('registrations:read') && (
                <RegistrationsPanel
                  credentials={credentials}
                  hasPermission={hasPermission}
                />
              )}

              {activeTab === 'geo-auth' && (hasPermission('geo_mail:view') || hasPermission('geo_ssh:view')) && (
                <GeoAuthPanel
                  hasPermission={hasPermission}
                  geoSubTab={geoSubTab}
                  setGeoSubTab={setGeoSubTab}
                  selectedGeoDomainId={selectedGeoDomainId}
                  setSelectedGeoDomainId={setSelectedGeoDomainId}
                  geoSettings={geoSettings}
                  geoAllowedCountries={geoAllowedCountries}
                  setGeoAllowedCountries={setGeoAllowedCountries}
                  geoAllowedRegions={geoAllowedRegions}
                  setGeoAllowedRegions={setGeoAllowedRegions}
                  geoRegions={geoRegions}
                  geoAugmentDefault={geoAugmentDefault}
                  setGeoAugmentDefault={setGeoAugmentDefault}
                  domains={domains}
                  loading={loading}
                  sshAllowedRegions={sshAllowedRegions}
                  setSshAllowedRegions={setSshAllowedRegions}
                  sshAllowedCountries={sshAllowedCountries}
                  setSshAllowedCountries={setSshAllowedCountries}
                  sshAugmentDefault={sshAugmentDefault}
                  setSshAugmentDefault={setSshAugmentDefault}
                  sshLogs={sshLogs}
                  geoBans={geoBans}
                  geoExceptions={geoExceptions}
                  fetchGeoData={fetchGeoData}
                  handleSaveGeoPolicy={handleSaveGeoPolicy}
                  handleSaveSshPolicy={handleSaveSshPolicy}
                  handleClearGeoBan={handleClearGeoBan}
                  handleResetRegions={handleResetRegions}
                  setEditingRegion={setEditingRegion}
                  editingRegion={editingRegion}
                  editingRegionCountries={editingRegionCountries}
                  setEditingRegionCountries={setEditingRegionCountries}
                  handleUpdateRegion={handleUpdateRegion}
                  showAddGeoExceptionModal={showAddGeoExceptionModal}
                  setShowAddGeoExceptionModal={setShowAddGeoExceptionModal}
                  geoExcUsername={geoExcUsername}
                  setGeoExcUsername={setGeoExcUsername}
                  geoExcService={geoExcService}
                  setGeoExcService={setGeoExcService}
                  geoExcCountries={geoExcCountries}
                  setGeoExcCountries={setGeoExcCountries}
                  geoExcExpires={geoExcExpires}
                  setGeoExcExpires={setGeoExcExpires}
                  handleSaveGeoException={handleSaveGeoException}
              handleDeleteGeoException={handleDeleteGeoException}
                />
              )}
            </>
          )}
        </>
      )}
        </div>
      </div>

      {/* MODALS */}
      {/* Provision Domain Modal */}
      {showAddDomainModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Provision New Mail Domain</h3>
            <form onSubmit={handleProvisionDomain} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Domain Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. business.co.zw" 
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Allocation Plan</label>
                  <select 
                    required
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  >
                    <option value="">Select Plan...</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.max_users} Box, {p.quota_mb}MB)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Cloudflare Account</label>
                  <select 
                    required
                    value={selectedCredId}
                    onChange={(e) => { setSelectedCredId(e.target.value); if (e.target.value === 'new' && !cfEmailInput) setCfEmailInput('gbdzoma@gmail.com'); }}
                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                  >
                    <option value="">Choose Credentials...</option>
                    <option value="new">+ Enter New Keys</option>
                    {credentials.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedCredId === 'new' && (
                <div className="bg-brand-plum-dark p-4 rounded-2xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300">New Cloudflare Credentials</h4>
                  <div>
                    <input 
                      type="email" 
                      placeholder="Cloudflare account email" 
                      value={cfEmailInput}
                      onChange={(e) => setCfEmailInput(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-plum border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-mint"
                    />
                  </div>
                  <div>
                    <input 
                      type="password" 
                      placeholder="Cloudflare Global Key or Token" 
                      value={cfApiKeyInput}
                      onChange={(e) => setCfApiKeyInput(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-plum border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-mint"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400 select-none">
                    <input 
                      type="checkbox" 
                      checked={saveCredCheckbox}
                      onChange={(e) => setSaveCredCheckbox(e.target.checked)}
                      className="rounded accent-brand-mint"
                    />
                    Encrypt & save keys for server-side provisioning
                  </label>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddDomainModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Deploy Infrastructure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DNS Review Modal */}
      {showDnsReviewModal && dnsReviewData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Review Proposed DNS Records</h3>
              <p className="text-sm text-slate-400 mt-1">
                For domain <span className="text-brand-mint font-semibold">{dnsReviewData.domain}</span>. Review and customize the Cloudflare entries before provisioning.
              </p>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 px-4 py-3 rounded-2xl text-xs space-y-1">
              <span className="font-bold block">💡 Important Notes:</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Editing the DKIM key content manually is not recommended as it must match the server's private key.</li>
                <li>Ensure the MX and CNAME records point to the correct mail server.</li>
              </ul>
            </div>

            <div className="overflow-x-auto border border-white/5 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4">Type</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Content</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">TTL</th>
                    <th className="p-4">Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {editedDnsRecords.map((rec, index) => (
                    <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 font-mono font-bold text-brand-mint">{rec.type}</td>
                      <td className="p-4 font-mono">{rec.name}</td>
                      <td className="p-4">
                        <input
                          type="text"
                          value={rec.content}
                          onChange={(e) => handleDnsRecordFieldChange(index, 'content', e.target.value)}
                          className="w-full px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white focus:outline-none focus:border-brand-mint font-mono"
                        />
                      </td>
                      <td className="p-4">
                        {rec.type === 'MX' ? (
                          <input
                            type="number"
                            value={rec.priority || 10}
                            onChange={(e) => handleDnsRecordFieldChange(index, 'priority', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white text-center focus:outline-none focus:border-brand-mint font-mono"
                          />
                        ) : (
                          <span className="text-slate-500 font-mono">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          value={rec.ttl}
                          onChange={(e) => handleDnsRecordFieldChange(index, 'ttl', parseInt(e.target.value) || 3600)}
                          className="w-20 px-2 py-1 bg-brand-plum-dark border border-white/10 rounded text-xs text-white text-center focus:outline-none focus:border-brand-mint font-mono"
                        />
                      </td>
                      <td className="p-4">
                        {['A', 'AAAA', 'CNAME'].includes(rec.type) ? (
                          <input
                            type="checkbox"
                            checked={rec.proxied}
                            onChange={(e) => handleDnsRecordFieldChange(index, 'proxied', e.target.checked)}
                            className="rounded bg-brand-plum-dark border-white/10 text-brand-mint focus:ring-brand-mint cursor-pointer"
                          />
                        ) : (
                          <span className="text-slate-500 font-mono">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowDnsReviewModal(false);
                  setDnsReviewData(null);
                }}
                className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-all cursor-pointer text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmProvision}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-brand-mint text-brand-plum-dark hover:bg-opacity-90 font-bold transition-all cursor-pointer text-sm shadow-lg flex items-center justify-center disabled:opacity-50"
              >
                {loading ? 'Confirming...' : 'Confirm & Push to Cloudflare'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Provisioning Live Stepper Overlay */}
      {showProvisioningModal && trackedProvisioningDomain && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border-2 border-white/10 rounded-3xl p-8 w-full max-w-xl shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold bg-brand-mint/10 text-brand-mint border border-brand-mint/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {isFinished ? (isSuccess ? 'Provisioned Successfully' : 'Provisioning Failed') : 'Provisioning Active'}
                </span>
                <h3 className="text-2xl font-black text-white tracking-tight mt-3">
                  {trackedProvisioningDomain}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Mail Server Infrastructure Provisioning Pipeline
                </p>
              </div>
              {!isFinished && (
                <div className="p-2 bg-white/5 rounded-full animate-spin border border-white/10">
                  <RefreshCw className="w-5 h-5 text-brand-mint" />
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Overall Progress</span>
                <span className="text-brand-mint">{getProgressPercent()}%</span>
              </div>
              <div className="w-full h-3 bg-brand-plum-dark rounded-full overflow-hidden border border-white/5 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    isFailed ? 'bg-red-500' : 'bg-brand-mint'
                  }`}
                  style={{ width: `${getProgressPercent()}%` }}
                ></div>
              </div>
            </div>

            {/* Stepper Steps */}
            <div className="space-y-4 pt-2">
              {STEP_ORDER.map((code, index) => {
                const status = getStepStatus(code);
                let indicator;
                let textColor;
                
                if (status === 'success') {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-mint/20 border border-brand-mint text-brand-mint flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 stroke-[3px]" /></div>;
                  textColor = 'text-white font-semibold';
                } else if (status === 'failed') {
                  indicator = <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500 text-red-500 flex items-center justify-center shrink-0"><X className="w-3.5 h-3.5 stroke-[3px]" /></div>;
                  textColor = 'text-red-400 font-bold';
                } else if (status === 'running') {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-mint/10 border-2 border-brand-mint border-t-transparent animate-spin shrink-0"></div>;
                  textColor = 'text-brand-mint font-bold animate-pulse';
                } else if (status === 'aborted') {
                  indicator = <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center shrink-0"><X className="w-3.5 h-3.5" /></div>;
                  textColor = 'text-slate-500 line-through';
                } else {
                  indicator = <div className="w-6 h-6 rounded-full bg-brand-plum-dark border border-white/10 text-slate-500 flex items-center justify-center shrink-0 text-xs font-bold">{index + 1}</div>;
                  textColor = 'text-slate-500';
                }

                return (
                  <div key={code} className="flex items-start gap-4">
                    {indicator}
                    <div className="space-y-0.5">
                      <span className={`text-sm ${textColor}`}>{getStepLabel(code)}</span>
                      <p className="text-xs text-slate-400">{getStepDesc(code)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rollback Details */}
            {rollbackLogs.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Security Rollback Active
                </h4>
                <p className="text-xs text-slate-300">
                  To prevent a half-configured state, the system is automatically reversing all changes:
                </p>
                <div className="space-y-1 font-mono text-[10px] text-slate-400">
                  {rollbackLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-red-400" />
                      <span>{l.details}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message Box */}
            {isFailed && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-1">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Pipeline Failure Error
                </span>
                <p className="text-xs text-slate-300 font-mono">
                  {latestLog ? latestLog.details : 'An unexpected exception halted the provisioning sequence.'}
                </p>
              </div>
            )}

            {/* Success Credentials Card */}
            {isSuccess && getAdminCredentials() && (
              <div className="bg-brand-mint/10 border border-brand-mint/20 rounded-2xl p-6 space-y-4 animate-scale-up">
                <div className="flex items-center gap-2 text-brand-mint">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-wider">Default Admin Credentials</span>
                </div>
                <p className="text-xs text-slate-300">
                  These temporary credentials have been created automatically. Copy the password now to log in:
                </p>
                <div className="space-y-2.5 bg-brand-plum-dark border border-white/5 p-4 rounded-xl font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Username:</span>
                    <span className="text-white font-bold">{getAdminCredentials().email}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-white/5 pt-2.5">
                    <span className="text-slate-400">Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-mint font-bold select-all">{getAdminCredentials().password}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(getAdminCredentials().password);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                        title="Copy Password"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-brand-mint" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            {isFinished && (
              <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowProvisioningModal(false);
                    setTrackedProvisioningDomain(null);
                  }}
                  className="bg-white text-slate-950 hover:bg-slate-100 font-bold px-6 py-3 rounded-full text-sm transition-all cursor-pointer"
                >
                  {isSuccess ? 'Get Started' : 'Close Dashboard'}
                </button>
              </div>
            )}

          </div>
        </div>
      )}


      {/* Add Mailbox User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Create Mailbox</h3>
            <form onSubmit={handleAddMailbox} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Username</label>
                <div className="flex items-center bg-brand-plum-dark border border-white/10 rounded-xl overflow-hidden focus-within:border-brand-mint">
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. info" 
                    value={newMailboxLocal}
                    onChange={(e) => setNewMailboxLocal(e.target.value)}
                    className="flex-1 px-4 py-3 bg-transparent text-white focus:outline-none text-right pr-2"
                  />
                  <span className="px-4 py-3 text-slate-400 bg-white/2 border-l border-white/5 font-semibold text-sm">@{selectedDomain.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. John Doe" 
                  value={newMailboxName}
                  onChange={(e) => setNewMailboxName(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
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
                      value={newMailboxPwd}
                      className="w-full pl-4 pr-10 py-3 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm font-medium font-mono cursor-not-allowed select-all"
                    />
                    {newMailboxPwd && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newMailboxPwd);
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
                      setNewMailboxPwd(pwd);
                      navigator.clipboard.writeText(pwd);
                      setSuccessMsg("Generated secure password and copied to clipboard!");
                    }}
                    className="px-4 py-3 bg-brand-mint text-slate-950 font-bold border-2 border-slate-950 rounded-xl shadow-[2px_2px_0_#151214] hover:bg-brand-mint-hover transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5 active:shadow-none text-xs"
                    title="Generate secure password"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Create Mailbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Alias Modal */}
      {showAddAliasModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Create Email Alias</h3>
            <form onSubmit={handleAddAlias} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Source (Forward From)</label>
                <div className="flex items-center bg-brand-plum-dark border border-white/10 rounded-xl overflow-hidden focus-within:border-brand-mint">
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. sales" 
                    value={newAliasSource}
                    onChange={(e) => setNewAliasSource(e.target.value)}
                    className="flex-1 px-4 py-3 bg-transparent text-white focus:outline-none text-right pr-2"
                  />
                  <span className="px-4 py-3 text-slate-400 bg-white/2 border-l border-white/5 font-semibold text-sm">@{selectedDomain.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Destination (Forward To)</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. inbox@external.com" 
                  value={newAliasDest}
                  onChange={(e) => setNewAliasDest(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddAliasModal(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Create Alias
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Alias Modal */}
      {editingAlias && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Edit Email Alias</h3>
            <form onSubmit={handleUpdateAlias} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Source</label>
                <input 
                  type="text" 
                  disabled
                  value={editingAlias.source}
                  className="w-full px-4 py-3 bg-brand-plum-dark/50 border border-white/5 rounded-xl text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Destination (Forward To)</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. inbox@external.com" 
                  value={editAliasDest}
                  onChange={(e) => setEditAliasDest(e.target.value)}
                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setEditingAlias(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
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

      {/* Add Credential Modal */}
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

                {(dnsRecordType === 'A' || dnsRecordType === 'AAAA' || dnsRecordType === 'CNAME') && (
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

                {(dnsRecordType === 'A' || dnsRecordType === 'AAAA' || dnsRecordType === 'CNAME') && (
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
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold rounded-xl text-sm transition-all"
                >
                  Update Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change/Set Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-plum border-2 border-slate-950 rounded-2xl p-8 w-full max-w-md shadow-[8px_8px_0_#151214] relative space-y-6">
            <button 
              onClick={() => { setShowChangePasswordModal(false); setPwdModalError(''); setPwdModalSuccess(''); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                {user?.has_password ? 'Change Password' : 'Set Account Password'}
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                {user?.has_password 
                  ? 'Update your console credential for password logins.' 
                  : 'You authenticated via social login. Set a password to enable direct logins.'}
              </p>
            </div>

            {pwdModalError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{pwdModalError}</span>
              </div>
            )}

            {pwdModalSuccess && (
              <div className="p-3 bg-brand-mint/10 border border-brand-mint/20 text-brand-mint rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{pwdModalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {user?.has_password && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Current Password
                  </label>
                  <input 
                    type="password" 
                    required
                    placeholder="Enter current password" 
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      required
                      readOnly
                      placeholder="Click Generate to set password" 
                      value={newPasswordInput}
                      className="w-full pl-4 pr-10 py-2.5 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm font-mono cursor-not-allowed select-all"
                    />
                    {newPasswordInput && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newPasswordInput);
                          setPwdModalSuccess("Password copied to clipboard!");
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
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
                      setNewPasswordInput(pwd);
                      setConfirmPasswordInput(pwd);
                      navigator.clipboard.writeText(pwd);
                      setPwdModalSuccess("Generated secure password and copied to clipboard!");
                    }}
                    className="px-4 py-2.5 bg-brand-mint text-slate-950 font-bold border-2 border-slate-950 rounded-xl shadow-[2px_2px_0_#151214] hover:bg-brand-mint-hover transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5 active:shadow-none text-xs"
                    title="Generate secure password"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input 
                  type="text" 
                  required
                  readOnly
                  placeholder="Click Generate to set password" 
                  value={confirmPasswordInput}
                  className="w-full px-4 py-2.5 bg-brand-plum border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-mint text-sm font-mono cursor-not-allowed select-all"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => { setShowChangePasswordModal(false); setPwdModalError(''); setPwdModalSuccess(''); }}
                  className="w-1/2 bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 rounded-xl border border-white/10 transition-all text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={pwdModalLoading}
                  className="w-1/2 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-extrabold py-2.5 rounded-xl border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-y-0.5 active:shadow-none transition-all text-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {pwdModalLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {user?.has_password ? 'Update Password' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          {...confirmModal}
          loading={loading}
          onCancel={() => setConfirmModal(null)}
          onConfirm={runConfirmedAction}
        />
      )}

      {resetPwdModal && (
        <PasswordResetModal
          email={resetPwdModal.email}
          password={resetPwdModal.password}
          onClose={() => setResetPwdModal(null)}
        />
      )}
    </div>
  );
}


function ConfirmModal({ title, message, confirmLabel, tone = 'default', loading, onCancel, onConfirm }) {
  const isDanger = tone === 'danger';
  const isWarning = tone === 'warning';
  const confirmClass = isDanger
    ? 'bg-red-500 text-white hover:bg-red-600'
    : isWarning
      ? 'bg-brand-yellow text-brand-plum hover:bg-brand-yellow-hover'
      : 'bg-brand-mint text-brand-plum hover:bg-brand-mint-hover';

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="bg-[#fffaf0] border-2 border-black rounded-[20px] p-7 w-full max-w-md shadow-[8px_8px_0_#151214] space-y-6">
        <div className="space-y-3">
          <div className={`w-12 h-12 rounded-2xl border-2 border-black flex items-center justify-center shadow-[2px_2px_0_#151214] ${isDanger ? 'bg-red-100 text-red-600' : isWarning ? 'bg-brand-yellow/40 text-brand-plum' : 'bg-brand-mint/30 text-brand-plum'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-black text-[#151214] tracking-tight">{title}</h3>
          <p className="text-sm text-[#625a63] leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 bg-white border-2 border-black text-[#151214] font-black rounded-xl shadow-[3px_3px_0_#151214] transition-all hover:bg-slate-50 active:translate-y-0.5 active:shadow-[1px_1px_0_#151214] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 border-2 border-black font-black rounded-xl shadow-[3px_3px_0_#151214] transition-all active:translate-y-0.5 active:shadow-[1px_1px_0_#151214] disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetModal({ email, password, onClose }) {
  const [copied, setCopied] = useState(false);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="bg-[#fffaf0] border-2 border-black rounded-[20px] p-7 w-full max-w-md shadow-[8px_8px_0_#151214] space-y-6">
        <div className="space-y-3">
          <div className="w-12 h-12 rounded-2xl border-2 border-black bg-brand-mint text-brand-plum flex items-center justify-center shadow-[2px_2px_0_#151214]">
            <Key className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-2xl font-black text-[#151214] tracking-tight">Password reset</h3>
          <p className="text-sm text-[#625a63] leading-relaxed">
            New mailbox password for <strong className="text-brand-plum font-extrabold">{email}</strong>. Copy it now; it will not be shown again.
          </p>
        </div>
        
        <div className="relative">
          <input
            type="text"
            readOnly
            value={password}
            className="w-full bg-white border-2 border-black rounded-xl px-4 py-3.5 font-mono text-base text-[#151214] shadow-[3px_3px_0_#151214] focus:outline-none text-center tracking-wider font-bold select-all cursor-pointer"
            onClick={(e) => e.target.select()}
          />
          {copied && (
            <div className="absolute -top-3.5 right-3 bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-md border-2 border-black shadow-[2px_2px_0_#000] animate-bounce">
              ✓ COPIED
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-white border-2 border-black text-[#151214] font-black rounded-xl shadow-[3px_3px_0_#151214] transition-all hover:bg-slate-50 active:translate-y-0.5 active:shadow-[1px_1px_0_#151214]"
          >
            Close
          </button>
          <button
            type="button"
            onClick={copyPassword}
            className={`flex-1 py-2.5 border-2 border-black font-black rounded-xl shadow-[3px_3px_0_#151214] transition-all active:translate-y-0.5 active:shadow-[1px_1px_0_#151214] ${
              copied 
                ? 'bg-brand-yellow text-brand-plum' 
                : 'bg-brand-mint text-brand-plum hover:bg-brand-mint-hover'
            }`}
          >
            {copied ? 'Copied! ✓' : 'Copy password'}
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
    // Dynamic global callback for Cloudflare Turnstile
    window.onTurnstileSuccess = (token) => {
      setTurnstileToken(token);
    };

    // Load Cloudflare Turnstile API script dynamically
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
      {/* FastHTML inspired organic backdrop shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div className="fh-icon-shape fh-icon-yellow absolute -top-8 left-[7vw] w-80 h-80"><Mail /></div>
        <div className="fh-icon-shape fh-icon-green absolute -top-16 right-[8vw] w-72 h-72"><Grid2X2 /></div>
        <div className="fh-icon-shape fh-icon-blue absolute top-[42vh] left-[3vw] w-56 h-56"><Globe /></div>
        <div className="fh-icon-shape fh-icon-coral absolute top-[36vh] right-[10vw] w-60 h-60"><Server /></div>
        <div className="fh-icon-shape fh-icon-pink absolute bottom-[8vh] left-[17vw] w-64 h-64"><Key /></div>
        <div className="fh-icon-shape fh-icon-purple absolute bottom-[5vh] right-[5vw] w-72 h-72"><Shield /></div>
        <div className="fh-icon-shape fh-icon-lime absolute top-[12vh] left-[44vw] w-40 h-40"><Sparkles /></div>
      </div>

      <div className="fasthtml-login-card glassmorphism-card rounded-3xl p-8 w-full max-w-md shadow-2xl relative z-10 space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center mx-auto shadow-inner">
            <Mail className="w-6 h-6 text-brand-yellow" />
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

        {/* Form */}
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

          {/* Cloudflare Turnstile CAPTCHA */}
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

function DomainDetailPage({ 
  domain, mailboxes, aliases, provisionLogs, onBack, onAddUser, 
  onAddAlias, onResetPassword, onDeleteMailbox, onDeleteAlias, 
  onEditAlias, plans, hasPermission, onDeleteDomain, refresh 
}) {
  const [activeSubTab, setActiveSubTab] = useState('mailboxes');

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
        <button 
          onClick={() => setActiveSubTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'logs' ? 'bg-brand-mint/10 text-brand-mint border border-brand-mint/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5 inline mr-1.5" />
          Provision Logs
        </button>
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

      {activeSubTab === 'logs' && (
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
