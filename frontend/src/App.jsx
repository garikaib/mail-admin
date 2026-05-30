import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, Shield, Key, Globe, Mail, Link as LinkIcon, LogOut, 
  Search, Plus, Check, AlertTriangle, RefreshCw, Trash2, Edit2, 
  Settings, Users, ChevronRight, Activity, Clock, Grid2X2, CheckCircle2, MessageCircle, Flower2, Sparkles,
  Menu, X, Copy, Lock, Cloud, CloudOff, ArrowLeft, Sliders, Edit, Eye, Power, RotateCcw, Play, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

const API_BASE = '/api';

import EditorModule from 'react-simple-code-editor';

const CodeEditor = EditorModule?.default?.default || EditorModule?.default || EditorModule;

const applyOnlyToText = (html, regex, replacement) => {
  return html
    .split(/(<[^>]+>)/g)
    .map((part, index) => (index % 2 === 0 ? part.replace(regex, replacement) : part))
    .join('');
};

const highlightConfig = (code) => {
  if (!code) return "";

  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = applyOnlyToText(html, /(#[^\n]*|\/\/[^\n]*)/g, '<span style="color:#94a3b8;font-style:italic;">$1</span>');
  html = applyOnlyToText(html, /("[^"]*"|'[^']*')/g, '<span style="color:#34d399;font-weight:600;">$1</span>');
  html = applyOnlyToText(html, /(^|\n)(\s*)([a-zA-Z0-9_\-\/]+)(\s*)(=|\s)/g, '$1$2<span style="color:#f472b6;font-weight:700;">$3</span>$4$5');
  html = applyOnlyToText(html, /([\{\}\[\]\(\)])/g, '<span style="color:#fbbf24;font-weight:700;">$1</span>');
  html = applyOnlyToText(html, /\b(\d+)\b/g, '<span style="color:#a78bfa;font-weight:700;">$1</span>');

  return html;
};


const getNginxDirective = (content, directive, fallback = '') => {
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`(^|\\n)\\s*${escaped}\\s+([^;]+);`));
  return match ? match[2].trim() : fallback;
};

const setNginxDirective = (content, directive, value) => {
  const line = `${directive} ${value};`;
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\n)(\\s*)${escaped}\\s+[^;]+;`);
  if (regex.test(content)) {
    return content.replace(regex, `$1$2${line}`);
  }
  return `${line}\n${content}`;
};

const configDisplayPath = (configId, files = []) => {
  if (!configId) return '';
  const config = files.find(cf => cf.id === configId);
  if (config?.path) return config.path;
  const filenames = {
    nginx_global: 'nginx.conf',
    rspamd_local: 'rspamd.local.lua',
    postfix_main: 'main.cf',
    postfix_master: 'master.cf',
    dovecot: 'dovecot.conf',
    sogo: 'sogo.conf'
  };
  return `/etc/${config?.service || 'config'}/${filenames[configId] || configId}`;
};

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
  }
];

const generateSecurePassword = () => {
  const length = 16;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  const u = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const l = "abcdefghijklmnopqrstuvwxyz";
  const n = "0123456789";
  const s = "!@#$%^&*()_+";
  retVal += u.charAt(Math.floor(Math.random() * u.length));
  retVal += l.charAt(Math.floor(Math.random() * l.length));
  retVal += n.charAt(Math.floor(Math.random() * n.length));
  retVal += s.charAt(Math.floor(Math.random() * s.length));
  for (let i = 0; i < length - 4; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return retVal.split('').sort(() => 0.5 - Math.random()).join('');
};

export default function App() {
  const logsContainerRef = useRef(null);
  const [token, setToken] = useState(() => localStorage.getItem('mail_admin_token') || '');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mail_admin_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
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
  
  // App Data State
  const [domains, setDomains] = useState([]);
  const [plans, setPlans] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [cfCredentialId, setCfCredentialId] = useState('');
  const [searchDomainName, setSearchDomainName] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfResult, setCfResult] = useState(null);
  
  const [regAction, setRegAction] = useState('N');
  const [ownerName, setOwnerName] = useState('');
  const [ownerOrg, setOwnerOrg] = useState('Civil Engineering Projects');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [ownerCity, setOwnerCity] = useState('Harare');
  const [ownerCountry, setOwnerCountry] = useState('Zimbabwe');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerFax, setOwnerFax] = useState('None');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [regFilter, setRegFilter] = useState('all');
  const [isBulkReg, setIsBulkReg] = useState(false);
  const [bulkDomainsInput, setBulkDomainsInput] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [credentials, setCredentials] = useState([]);
  const [zoneOwnership, setZoneOwnership] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  
  const [mailboxes, setMailboxes] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [provisionLogs, setProvisionLogs] = useState([]);
  const [pollingDomain, setPollingDomain] = useState(null);
  const [trackedProvisioningDomain, setTrackedProvisioningDomain] = useState(null);
  const [showProvisioningModal, setShowProvisioningModal] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Forms & UI control
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [showDnsReviewModal, setShowDnsReviewModal] = useState(false);
  const [dnsReviewData, setDnsReviewData] = useState(null);
  const [editedDnsRecords, setEditedDnsRecords] = useState([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAddAliasModal, setShowAddAliasModal] = useState(false);
  const [showAddCredModal, setShowAddCredModal] = useState(false);
  const [showEditCredModal, setShowEditCredModal] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [editCredLabel, setEditCredLabel] = useState('');
  const [editCredEmail, setEditCredEmail] = useState('');
  const [editCredKey, setEditCredKey] = useState('');
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
  const [auditFilters, setAuditFilters] = useState({ q: '', admin_email: '', action: '', target: '', from: '', to: '', limit: 100 });
  const [auditPurgePreset, setAuditPurgePreset] = useState('yesterday');
  const [auditPurgeDate, setAuditPurgeDate] = useState('');
  const [configFiles, setConfigFiles] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configIsDirty, setConfigIsDirty] = useState(false);
  const [configValidation, setConfigValidation] = useState(null);
  const [isValidatingConfig, setIsValidatingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [serviceActionLoading, setServiceActionLoading] = useState({});

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

  // Console Users State
  const [consoleUsers, setConsoleUsers] = useState([]);
  const [showAddConsoleUserModal, setShowAddConsoleUserModal] = useState(false);
  const [showEditConsoleUserModal, setShowEditConsoleUserModal] = useState(false);
  const [selectedConsoleUser, setSelectedConsoleUser] = useState(null);
  const [consoleUsersLoading, setConsoleUsersLoading] = useState(false);
  const [consoleUserSearch, setConsoleUserSearch] = useState('');
  const [consoleUserRoleFilter, setConsoleUserRoleFilter] = useState('all');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [pwdModalError, setPwdModalError] = useState('');
  const [pwdModalSuccess, setPwdModalSuccess] = useState('');
  const [pwdModalLoading, setPwdModalLoading] = useState(false);
  
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
  const [newMailboxQuota, setNewMailboxQuota] = useState(1048576); // 1GB in KB
  
  const [newAliasSource, setNewAliasSource] = useState('');
  const [newAliasDest, setNewAliasDest] = useState('');
  const [editingAlias, setEditingAlias] = useState(null);
  const [editAliasDest, setEditAliasDest] = useState('');
  
  const [newCredLabel, setNewCredLabel] = useState('');
  const [newCredEmail, setNewCredEmail] = useState('');
  const [newCredKey, setNewCredKey] = useState('');
  
  // Console User Modal Form States
  const [addConsoleUsername, setAddConsoleUsername] = useState('');
  const [addConsolePassword, setAddConsolePassword] = useState('');
  const [addConsoleIsSuper, setAddConsoleIsSuper] = useState(false);
  const [addConsoleRoles, setAddConsoleRoles] = useState([]);
  const [addConsoleDomains, setAddConsoleDomains] = useState([]);

  const [editConsoleIsSuper, setEditConsoleIsSuper] = useState(false);
  const [editConsoleRoles, setEditConsoleRoles] = useState([]);
  const [editConsoleDomains, setEditConsoleDomains] = useState([]);
  const [editConsolePassword, setEditConsolePassword] = useState('');

  // Plan Modal Form States
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planMaxUsers, setPlanMaxUsers] = useState(10);
  const [planMaxAliases, setPlanMaxAliases] = useState(20);
  const [planQuotaMb, setPlanQuotaMb] = useState(1024);
  const [planIsDefault, setPlanIsDefault] = useState(false);

  useEffect(() => {
    if (logsService && logsContainerRef.current && window.innerWidth < 768) {
      logsContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsService]);

  useEffect(() => {
    if (selectedPlan) {
      setPlanName(selectedPlan.name);
      setPlanMaxUsers(selectedPlan.max_users);
      setPlanMaxAliases(selectedPlan.max_aliases);
      setPlanQuotaMb(selectedPlan.quota_mb);
      setPlanIsDefault(selectedPlan.is_default);
    } else {
      setPlanName('');
      setPlanMaxUsers(10);
      setPlanMaxAliases(20);
      setPlanQuotaMb(1024);
      setPlanIsDefault(false);
    }
  }, [selectedPlan]);

  // Auto-populate edit fields when selectedConsoleUser changes
  useEffect(() => {
    if (selectedConsoleUser) {
      setEditConsoleIsSuper(selectedConsoleUser.is_superuser);
      setEditConsoleRoles(selectedConsoleUser.roles.map(r => r.role));
      setEditConsoleDomains(selectedConsoleUser.assignments.map(a => a.domain_name));
      setEditConsolePassword('');
    }
  }, [selectedConsoleUser]);

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
        setActiveTab('domains');
      } else {
        handlePopState();
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
          setSelectedDomain(null);
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
              setSelectedCredential(foundCred);
            }
            
            if (zoneParam && cloudflareZones.length > 0) {
              const foundZone = cloudflareZones.find(z => z.zone_id === zoneParam && z.credential_id === foundCred.id);
              if (foundZone) {
                if (!selectedZone || selectedZone.zone_id !== zoneParam) {
                  setSelectedZone(foundZone);
                  fetchDnsRecords(foundCred.id, zoneParam);
                }
              }
            } else if (!zoneParam && selectedZone) {
              setSelectedZone(null);
            }
          }
        }
      } else {
        if (selectedCredential || selectedZone) {
          setSelectedCredential(null);
          setSelectedZone(null);
        }
      }
    }
  }, [activeTab, domains, credentials, cloudflareZones, window.location.search, token]);

  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_superuser) return true;
    return !!(user.permissions && user.permissions.includes(permission));
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
            setActiveTab(allowedRoutes[0].path);
          }
        } else {
          window.history.replaceState(null, '', '/unauthorized');
          setActiveTab('unauthorized');
        }
      }
    }
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
    return () => clearInterval(interval);
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
  }, [activeTab, serverControlTab, token]);

  // Fetch config content when selected config ID changes
  useEffect(() => {
    if (token && activeTab === 'health' && serverControlTab === 'configs' && selectedConfigId) {
      fetchConfigContent(selectedConfigId);
    }
  }, [selectedConfigId, serverControlTab, activeTab, token]);

  // Fetch log lines when active log service selection changes
  useEffect(() => {
    if (token && activeTab === 'health' && serverControlTab === 'services' && logsService) {
      fetchServiceLogs(logsService);
    }
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

  const fetchInitialData = (authToken, isSuper, userPermissions = []) => {
    fetchDomains(authToken);
    fetchPlans(authToken);
    fetchCredentials(authToken);
    fetchCloudflareZones(authToken);
    if (isSuper || userPermissions.includes('registrations:read')) {
      fetchRegistrations(authToken);
    }
    if (isSuper || userPermissions.includes('system:health')) {
      fetchSystemHealth(authToken);
    }
    if (isSuper || userPermissions.includes('system:service_status')) {
      fetchDetailedServices(authToken);
    }
    if (isSuper || userPermissions.includes('system:logs')) {
      fetchAuditLogs(authToken);
    }
    if (isSuper || userPermissions.includes('users:read')) {
      fetchConsoleUsers(authToken);
    }
  };

  const fetchDomains = async (t = token) => {
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

  const fetchPlans = async (t = token) => {
    try {
      const res = await fetch(`${API_BASE}/domains/plans`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
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

  const fetchRegistrations = async (t = token) => {
    try {
      const res = await fetch(`${API_BASE}/registrations`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckDomain = async (e) => {
    e.preventDefault();
    if (!searchDomainName) return;
    setSearchLoading(true);
    setSearchResult(null);
    setCfResult(null);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/registrations/check-domain`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain: searchDomainName })
      });
      const data = await res.json();
      if (res.ok) {
        setSearchResult(data);
        if (data.exists) {
          setErrorMsg(`Domain ${searchDomainName} already exists on public DNS or locally.`);
        }
      } else {
        setErrorMsg(data.detail || 'Failed to check domain availability.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to check domain availability.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddCloudflare = async (e) => {
    e.preventDefault();
    if (!searchDomainName || !cfCredentialId) return;
    setCfLoading(true);
    setCfResult(null);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/registrations/add-cloudflare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          domain: searchDomainName, 
          credential_id: parseInt(cfCredentialId) 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCfResult(data);
        if (data.default_owner) {
          setOwnerName(data.default_owner.owner_name || '');
          setOwnerOrg(data.default_owner.owner_org || 'Civil Engineering Projects');
          setOwnerAddress(data.default_owner.owner_address || '');
          setOwnerCity(data.default_owner.owner_city || 'Harare');
          setOwnerCountry(data.default_owner.owner_country || 'Zimbabwe');
          setOwnerPhone(data.default_owner.owner_phone || '');
          setOwnerFax(data.default_owner.owner_fax || 'None');
          setOwnerEmail(data.default_owner.owner_email || '');
        }
      } else {
        setErrorMsg(data.detail || 'Failed to retrieve Cloudflare zone configuration.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to retrieve Cloudflare zone configuration.');
    } finally {
      setCfLoading(false);
    }
  };

  const handleSubmitRegistration = async (e) => {
    e.preventDefault();
    if (!searchDomainName || !cfResult) return;
    setSubmitLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/registrations/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          domain_name: searchDomainName,
          action: regAction,
          cf_email: credentials.find(c => c.id === parseInt(cfCredentialId))?.email || null,
          owner_name: ownerName,
          owner_org: ownerOrg,
          owner_address: ownerAddress,
          owner_city: ownerCity,
          owner_country: ownerCountry,
          owner_phone: ownerPhone,
          owner_fax: ownerFax,
          owner_email: ownerEmail,
          zone_id: cfResult.zone_id,
          ns1_hostname: cfResult.ns1_hostname,
          ns1_ip: cfResult.ns1_ip,
          ns2_hostname: cfResult.ns2_hostname,
          ns2_ip: cfResult.ns2_ip,
          credential_id: parseInt(cfCredentialId)
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`ZISPA application email sent for ${searchDomainName}!`);
        setSearchDomainName('');
        setSearchResult(null);
        setCfResult(null);
        fetchRegistrations();
      } else {
        setErrorMsg(data.detail || 'Failed to submit registration.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit registration.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleResendRegistrationEmail = async (id) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}/email-template`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`ZISPA application email resent successfully!`);
        fetchRegistrations();
      } else {
        setErrorMsg(data.detail || 'Failed to resend registration email.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to resend registration email.');
    }
  };

  const handleDeleteRegistration = async (id) => {
    if (!window.confirm("Are you sure you want to delete this registration record?")) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg(`Registration record deleted.`);
        fetchRegistrations();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || 'Failed to delete registration.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete registration.');
    }
  };

  const handlePollRegistration = async (id, silent = false) => {
    if (!silent) {
      setErrorMsg('');
      setSuccessMsg('');
    }
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}/poll`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'active') {
          if (!silent) setSuccessMsg(`Domain ${data.domain_name} has resolved successfully and is now active!`);
        } else {
          if (!silent) setErrorMsg(`Domain ${data.domain_name} is still not resolving on public DNS (status: ${data.status}).`);
        }
        fetchRegistrations();
      } else {
        if (!silent) setErrorMsg(data.detail || 'Failed to check domain DNS resolution.');
      }
    } catch (err) {
      if (!silent) setErrorMsg(err.message || 'Failed to check domain DNS resolution.');
    }
  };

  const handlePollAllRegistrations = async () => {
    setErrorMsg('');
    setSuccessMsg('Started checking DNS resolution for all pending domains...');
    const pending = registrations.filter(r => r.status !== 'active');
    if (pending.length === 0) {
      setSuccessMsg('No pending domain registrations found.');
      return;
    }
    let activatedCount = 0;
    for (const r of pending) {
      try {
        const res = await fetch(`${API_BASE}/registrations/${r.id}/poll`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'active') {
            activatedCount++;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchRegistrations();
    setSuccessMsg(`Completed checking DNS resolution. ${activatedCount} domain(s) activated!`);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setBulkResult(null);

    const domains = bulkDomainsInput
      .split('\n')
      .map(d => d.trim().lower())
      .filter(d => d.length > 0);

    if (domains.length === 0) {
      setErrorMsg('Please enter at least one domain name.');
      return;
    }

    if (!cfCredentialId) {
      setErrorMsg('Please select a Cloudflare credential.');
      return;
    }

    setBulkLoading(true);

    try {
      const payload = {
        domains,
        credential_id: parseInt(cfCredentialId),
        action: regAction,
        owner_name: ownerName,
        owner_org: ownerOrg,
        owner_address: ownerAddress,
        owner_city: ownerCity,
        owner_country: ownerCountry,
        owner_phone: ownerPhone,
        owner_fax: ownerFax,
        owner_email: ownerEmail
      };

      const res = await fetch(`${API_BASE}/registrations/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setBulkResult(data);
        setSuccessMsg(`Bulk processing complete! Success: ${data.success_count}, Failed: ${data.failed_count}.`);
        setBulkDomainsInput('');
        fetchRegistrations();
      } else {
        setErrorMsg(data.detail || 'Failed to process bulk registration.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to process bulk registration.');
    } finally {
      setBulkLoading(false);
    }
  };

  const fetchDnsRecords = async (credId, zoneId, t = token) => {
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

  const buildAuditLogParams = (filters = auditFilters) => {
    const params = new URLSearchParams();
    params.set('limit', String(filters.limit || 100));
    ['q', 'admin_email', 'action', 'target', 'from', 'to'].forEach((key) => {
      if (filters[key]) params.set(key, filters[key]);
    });
    return params;
  };

  const fetchAuditLogs = async (t = token, filters = auditFilters) => {
    try {
      const res = await fetch(`${API_BASE}/system/logs?${buildAuditLogParams(filters).toString()}`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resolveAuditPurgeDate = () => {
    const d = new Date();
    if (auditPurgePreset === 'custom') return auditPurgeDate;
    if (auditPurgePreset === 'yesterday') d.setDate(d.getDate() - 1);
    if (auditPurgePreset === 'last_7_days') d.setDate(d.getDate() - 7);
    if (auditPurgePreset === 'last_30_days') d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  };

  const purgeAuditLogs = async () => {
    const before = resolveAuditPurgeDate();
    if (!before) {
      setErrorMsg('Choose a purge cutoff date.');
      return;
    }
    showConfirm({
      title: 'Purge audit logs?',
      message: `Delete audit log entries up to and including ${before}? This keeps a new purge audit record.`,
      confirmLabel: 'Purge Logs',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/system/logs?before=${encodeURIComponent(before)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            setSuccessMsg(`Purged ${data.deleted} audit log entries through ${data.before}.`);
            fetchAuditLogs();
          } else {
            setErrorMsg(data.detail || 'Failed to purge audit logs.');
          }
        } catch (err) {
          console.error(err);
          setErrorMsg('Failed to purge audit logs.');
        }
      }
    });
  };

  const fetchDetailedServices = async (t = token) => {
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

  const fetchServiceLogs = async (serviceName, limit = logsLimit) => {
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

  const fetchConfigFiles = async () => {
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

  const fetchConfigContent = async (configId) => {
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

  const fetchConsoleUsers = async (t = token) => {
    setConsoleUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/console-users`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConsoleUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch console users:", err);
    } finally {
      setConsoleUsersLoading(false);
    }
  };

  const handleCreateConsoleUser = async (userData) => {
    try {
      const res = await fetch(`${API_BASE}/console-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      });
      if (res.ok) {
        setSuccessMsg("Console user created successfully.");
        fetchConsoleUsers();
        setShowAddConsoleUserModal(false);
        fetchAuditLogs();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to create console user.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to create console user due to server connection error.");
    }
  };

  const handleUpdateConsoleUser = async (userId, updateData) => {
    try {
      const res = await fetch(`${API_BASE}/console-users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });
      if (res.ok) {
        setSuccessMsg("Console user updated successfully.");
        fetchConsoleUsers();
        setShowEditConsoleUserModal(false);
        fetchAuditLogs();
        
        const updatedUser = await res.json();
        if (user && updatedUser.id === user.id) {
          setUser(prev => ({
            ...prev,
            email: updatedUser.email,
            is_superuser: updatedUser.is_superuser
          }));
        }
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to update console user.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to update console user due to server connection error.");
    }
  };

  const handleDeleteConsoleUser = async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/console-users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg("Console user deleted successfully.");
        fetchConsoleUsers();
        fetchAuditLogs();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to delete console user.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to delete console user due to server connection error.");
    }
  };

  const handleCreatePlan = async (e) => {
    if (e) e.preventDefault();
    try {
      const url = `${API_BASE}/domains/plans?name=${encodeURIComponent(planName)}&max_users=${planMaxUsers}&max_aliases=${planMaxAliases}&quota_mb=${planQuotaMb}&is_default=${planIsDefault}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setSuccessMsg("Plan created successfully!");
        fetchPlans();
        setShowAddPlanModal(false);
        setPlanName('');
        setPlanMaxUsers(10);
        setPlanMaxAliases(20);
        setPlanQuotaMb(1024);
        setPlanIsDefault(false);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to create plan.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to create plan due to server connection error.");
    }
  };

  const handleUpdatePlan = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPlan) return;
    try {
      const url = `${API_BASE}/domains/plans/${selectedPlan.id}?name=${encodeURIComponent(planName)}&max_users=${planMaxUsers}&max_aliases=${planMaxAliases}&quota_mb=${planQuotaMb}&is_default=${planIsDefault}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setSuccessMsg("Plan updated successfully!");
        fetchPlans();
        setShowEditPlanModal(false);
        setSelectedPlan(null);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to update plan.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to update plan due to server connection error.");
    }
  };

  const handleDeletePlan = async (planId) => {
    try {
      const res = await fetch(`${API_BASE}/domains/plans/${planId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setSuccessMsg("Plan deleted successfully!");
        fetchPlans();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to delete plan.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to delete plan due to server connection error.");
    }
  };

  const handleSelectDomain = async (dom) => {
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

  const deleteDomainConfirmed = async (domainId, domainName) => {
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
  };

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
      onConfirm: () => deleteDomainConfirmed(domainId, domainName),
    });
  };

  const handleUpdateDomainActive = async (dom, active) => {
    try {
      const res = await fetch(`${API_BASE}/domains/${dom.id}?plan_id=${dom.plan_id}&is_active=${active}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg(`Domain ${dom.name} ${active ? 'activated' : 'suspended'}`);
        fetchDomains();
      }
    } catch (err) {
      console.error(err);
    }
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
      setZoneOwnership(data);
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
            <Mail className="w-4 h-4 text-brand-mint" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">ZimPrices</h1>
            <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Mail Console</span>
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
                <Mail className="w-5 h-5 text-brand-mint" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight leading-none">ZimPrices</h1>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Mail Console</span>
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
              onUpdateActive={(active) => handleUpdateDomainActive(selectedDomain, active)}
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

                if (selectedZone) {
                  return (
                    <div className="space-y-6">
                      {/* DNS Records Panel for Selected Zone */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-plum p-6 rounded-2xl border border-white/5">
                        <div className="space-y-2">
                          <button
                            onClick={() => {
                              setSelectedZone(null);
                              setSelectedCredential(null);
                              window.history.pushState(null, '', '/credentials');
                            }}
                            className="flex items-center gap-1.5 text-xs text-brand-mint hover:underline font-bold bg-transparent border-none cursor-pointer"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Back to Domains Directory
                          </button>
                          
                          <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-white tracking-tight">DNS Settings: {selectedZone.name}</h2>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              selectedZone.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {selectedZone.status}
                            </span>
                          </div>
                          <p className="text-slate-400 text-xs font-medium">
                            Cloudflare Account: <span className="font-mono text-slate-300">{selectedZone.cf_email}</span>
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3 self-end md:self-center">
                          {isMatched(selectedZone.name) ? (
                            <button
                              onClick={() => {
                                const dom = getMatchedDomain(selectedZone.name);
                                setSelectedDomain(dom);
                                setActiveTab('domains');
                                window.history.pushState(null, '', `/domains?domain=${dom.name}`);
                                handleSelectDomain(dom);
                              }}
                              className="bg-brand-mint hover:bg-brand-mint-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Manage Mailboxes
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setNewDomainName(selectedZone.name);
                                setSelectedCredId(selectedZone.credential_id);
                                setSelectedPlanId('');
                                setActiveTab('domains');
                                setShowAddDomainModal(true);
                              }}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Provision Mail Server
                            </button>
                          )}
                          
                          {hasPermission('credentials:create') && (
                            <button
                              onClick={() => {
                                setDnsRecordType('A');
                                setDnsRecordName('');
                                setDnsRecordContent('');
                                setDnsRecordPriority('');
                                setDnsRecordProxied(false);
                                setDnsRecordTtl('3600');
                                setShowAddDnsRecordModal(true);
                              }}
                              className="bg-brand-yellow hover:bg-brand-yellow-hover text-brand-plum font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                              Add Record
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Table of records */}
                      <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
                        <div className="px-4 py-3 border-b border-white/5 bg-white/2 flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-brand-yellow" />
                          <h3 className="text-sm font-bold text-white">Active DNS Records</h3>
                        </div>
                        
                        {loading ? (
                          <div className="p-12 text-center text-slate-400 bg-brand-plum/10">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
                            Loading DNS records from Cloudflare...
                          </div>
                        ) : zoneDnsRecords.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                              <thead>
                                <tr className="border-b border-white/5 bg-white/2">
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">Type</th>
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-1/4">Name</th>
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-2/5">Content</th>
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">TTL</th>
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">Proxy</th>
                                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {zoneDnsRecords.map(rec => {
                                  // Detect if record is mail-critical system record
                                  const isMXSystem = rec.type === 'MX' && rec.content.includes('mail.zimprices.co.zw');
                                  const isSPF = rec.type === 'TXT' && rec.content.includes('v=spf1');
                                  const isDKIM = rec.type === 'TXT' && rec.name.includes('_domainkey');
                                  const isDMARC = rec.type === 'TXT' && rec.name.includes('_dmarc');
                                  const isMailServerHost = (rec.type === 'A' || rec.type === 'AAAA' || rec.type === 'CNAME') && rec.name === `mail.${selectedZone.name}`;
                                  const isSystemRecord = isMXSystem || isSPF || isDKIM || isDMARC || isMailServerHost;
                                  
                                  return (
                                    <tr key={rec.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                      <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider font-mono ${
                                          rec.type === 'MX' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                          rec.type === 'TXT' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                          rec.type === 'CNAME' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                          'bg-brand-mint/10 text-brand-mint border border-brand-mint/20'
                                        }`}>
                                          {rec.type}
                                        </span>
                                      </td>
                                      <td className="p-4 text-sm font-bold text-white font-mono break-all">{rec.name}</td>
                                      <td className="p-4 text-sm text-slate-300 font-mono break-all">
                                        {rec.priority !== undefined && rec.priority !== null ? `[${rec.priority}] ` : ''}
                                        {rec.content}
                                      </td>
                                      <td className="p-4 text-xs text-slate-400 font-mono">
                                        {rec.ttl === 1 ? 'Auto' : `${rec.ttl}s`}
                                      </td>
                                      <td className="p-4">
                                        {rec.proxied ? (
                                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500" title="Proxied through Cloudflare">
                                            <Cloud className="w-3.5 h-3.5 fill-amber-500/20" />
                                            Proxied
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500" title="DNS Only">
                                            <CloudOff className="w-3.5 h-3.5" />
                                            DNS Only
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-4 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                          {isSystemRecord && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/20 text-[9px] font-bold uppercase tracking-wider" title="Critical mail system record. Modify with caution.">
                                              <Lock className="w-2.5 h-2.5" />
                                              Protected
                                            </span>
                                          )}
                                          {hasPermission('credentials:create') && (
                                            <>
                                              <button
                                                onClick={() => {
                                                  setEditingDnsRecord(rec);
                                                  setDnsRecordType(rec.type);
                                                  setDnsRecordName(rec.name);
                                                  setDnsRecordContent(rec.content);
                                                  setDnsRecordPriority(rec.priority !== undefined && rec.priority !== null ? String(rec.priority) : '');
                                                  setDnsRecordProxied(rec.proxied || false);
                                                  setDnsRecordTtl(String(rec.ttl));
                                                  
                                                  if (isSystemRecord) {
                                                    showConfirm({
                                                      title: 'Edit Protected DNS Record?',
                                                      message: `Warning: ${rec.type} record for '${rec.name}' is a system-critical mail record. Modifying it may disrupt email flow. Are you sure you want to edit it?`,
                                                      confirmLabel: 'Proceed to Edit',
                                                      tone: 'warning',
                                                      onConfirm: () => setShowEditDnsRecordModal(true)
                                                    });
                                                  } else {
                                                    setShowEditDnsRecordModal(true);
                                                  }
                                                }}
                                                className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none"
                                                title="Edit Record"
                                              >
                                                <Edit className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                onClick={() => {
                                                  const performDelete = () => handleDeleteDnsRecord(rec.id);
                                                  
                                                  showConfirm({
                                                    title: isSystemRecord ? 'DELETE SYSTEM-CRITICAL DNS RECORD?' : 'Delete DNS record?',
                                                    message: isSystemRecord 
                                                      ? `CRITICAL WARNING: You are about to delete a system-managed mail record (${rec.type} ${rec.name}). THIS WILL DISRUPT EMAIL SERVICES for this domain. Are you absolutely certain you want to proceed?`
                                                      : `Are you sure you want to delete this ${rec.type} record for '${rec.name}'?`,
                                                    confirmLabel: 'Delete Record',
                                                    tone: 'danger',
                                                    onConfirm: performDelete
                                                  });
                                                }}
                                                className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none"
                                                title="Delete Record"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-8 text-center text-slate-400 bg-brand-plum/10">
                            No DNS records found for this zone.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-end">
                      <div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Cloudflare Credentials</h2>
                        <p className="text-slate-400 text-sm mt-1">Manage global api credentials used to securely generate tokens for DNS updates.</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={handleScanZoneOwnership}
                          disabled={loading}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                          Scan Zones
                        </button>
                        <button 
                          onClick={() => { setNewCredEmail('gbdzoma@gmail.com'); setShowAddCredModal(true); }}
                          className="bg-brand-yellow hover:bg-brand-yellow-hover text-brand-plum font-bold text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-all cursor-pointer border-none"
                        >
                          <Plus className="w-4 h-4 stroke-[3px]" />
                          Add Credential
                        </button>
                      </div>
                    </div>

                    <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/2">
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Label</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CF Email Account</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Created</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {credentials.length > 0 ? (
                            credentials.map(c => (
                              <tr key={c.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                <td className="p-4 text-sm font-bold text-white">{c.label}</td>
                                <td className="p-4 text-sm text-slate-300 font-mono">{c.email}</td>
                                <td className="p-4 text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => {
                                        setEditingCredential(c);
                                        setEditCredLabel(c.label);
                                        setEditCredEmail(c.email);
                                        setEditCredKey('');
                                        setShowEditCredModal(true);
                                      }}
                                      className="text-brand-mint hover:text-white p-2 rounded-lg hover:bg-brand-mint/10 transition-colors bg-transparent border-none cursor-pointer"
                                      title="Edit Credential / Rotate Key"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteCredential(c.id)}
                                      className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition-colors bg-transparent border-none cursor-pointer"
                                      title="Delete Credential"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="p-8 text-center text-slate-400">No credentials added.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Cloudflare Domains Directory */}
                    <div className="space-y-6 pt-6 border-t border-white/5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-bold text-white tracking-tight">Cloudflare Domains Directory</h3>
                          <p className="text-slate-400 text-xs mt-0.5">Explore zones from all Cloudflare accounts, check local mail configurations, and manage DNS settings.</p>
                        </div>
                        
                        {/* Filtering Controls */}
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Search Input */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input 
                              type="text"
                              placeholder="Search domains..."
                              value={cfZoneSearchQuery}
                              onChange={(e) => setCfZoneSearchQuery(e.target.value)}
                              className="pl-8 pr-4 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint w-44"
                            />
                          </div>
                          
                          {/* Console Match Status Filter */}
                          <select
                            value={cfZoneStatusFilter}
                            onChange={(e) => setCfZoneStatusFilter(e.target.value)}
                            className="px-3 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                          >
                            <option value="all">All Console Status</option>
                            <option value="matched">Matched (Mail Enabled)</option>
                            <option value="unmatched">Unmatched (Not Configured)</option>
                          </select>
                          
                          {/* Credential Account Filter */}
                          <select
                            value={cfAccountFilter}
                            onChange={(e) => setCfAccountFilter(e.target.value)}
                            className="px-3 py-1.5 bg-brand-plum-dark border border-white/10 rounded-full text-xs text-white focus:outline-none focus:border-brand-mint cursor-pointer"
                          >
                            <option value="all">All Accounts</option>
                            {credentials.map(c => (
                              <option key={c.id} value={c.id}>{c.label} ({c.email})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {Object.keys(groupedZones).length > 0 ? (
                        Object.keys(groupedZones).map(accountKey => {
                          const zonesInGroup = groupedZones[accountKey];
                          return (
                            <div key={accountKey} className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
                              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-brand-mint" />
                                  <h4 className="text-sm font-bold text-white">{accountKey}</h4>
                                  <span className="text-[10px] bg-brand-plum-dark text-slate-400 font-bold px-2 py-0.5 rounded border border-white/5">
                                    {zonesInGroup.length} zone{zonesInGroup.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {zonesInGroup.map(zone => {
                                  const matched = isMatched(zone.name);
                                  const localDomain = getMatchedDomain(zone.name);
                                  return (
                                    <div key={zone.zone_id} className="bg-brand-plum-dark/60 border border-white/5 hover:border-brand-mint/20 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:-translate-y-0.5 transition-all shadow-md">
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-sm font-bold text-white tracking-tight truncate max-w-[150px]" title={zone.name}>{zone.name}</span>
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                            zone.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                          }`}>
                                            {zone.status}
                                          </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-slate-400 font-semibold">Console Match:</span>
                                          {matched ? (
                                            <span className="text-[10px] font-bold text-brand-mint">Mail Server Configured</span>
                                          ) : (
                                            <span className="text-[10px] font-bold text-slate-400">Not Configured</span>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                        <button
                                          onClick={() => {
                                            const matchingCred = credentials.find(c => c.id === zone.credential_id);
                                            setSelectedCredential(matchingCred);
                                            setSelectedZone(zone);
                                            window.history.pushState(null, '', `/credentials?cred_id=${zone.credential_id}&zone_id=${zone.zone_id}`);
                                            fetchDnsRecords(zone.credential_id, zone.zone_id);
                                          }}
                                          className="flex-1 py-1.5 bg-brand-purple hover:bg-brand-purple/80 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border-none"
                                        >
                                          <Sliders className="w-3 h-3" />
                                          DNS Records
                                        </button>
                                        
                                        {matched ? (
                                          <button
                                            onClick={() => {
                                              setSelectedDomain(localDomain);
                                              setActiveTab('domains');
                                              window.history.pushState(null, '', `/domains?domain=${localDomain.name}`);
                                              handleSelectDomain(localDomain);
                                            }}
                                            className="py-1.5 px-3 bg-brand-mint hover:bg-brand-mint-hover text-brand-plum text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border-none"
                                            title="Manage Mailboxes / Add Emails"
                                          >
                                            <Mail className="w-3 h-3" />
                                            Emails
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setNewDomainName(zone.name);
                                              setSelectedCredId(zone.credential_id);
                                              setSelectedPlanId('');
                                              setActiveTab('domains');
                                              setShowAddDomainModal(true);
                                            }}
                                            className="py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                                            title="Provision Mail Server"
                                          >
                                            <Plus className="w-3 h-3" />
                                            Provision
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="glassmorphism-card rounded-2xl p-8 text-center text-slate-400 border border-white/5">
                          No Cloudflare zones found matching the current filters.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'health' && hasPermission('system:health') && systemHealth && (
                <div className="space-y-6">
                  {/* Title & Sub-tabs */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-4">
                    <div>
                      <h2 className="text-3xl font-extrabold text-white tracking-tight">Server Management</h2>
                      <p className="text-slate-400 text-sm mt-1">Superadmin infrastructure management, services dashboard, and configuration editor.</p>
                    </div>
                    
                    <div className="flex space-x-2 bg-black/20 p-1 rounded-xl border border-white/5">
                      <button
                        onClick={() => setServerControlTab('performance')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          serverControlTab === 'performance'
                            ? 'bg-brand-pink text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Performance
                      </button>
                      {hasPermission('system:service_status') && (
                        <button
                          onClick={() => {
                            setServerControlTab('services');
                            fetchDetailedServices();
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            serverControlTab === 'services'
                              ? 'bg-brand-pink text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Server className="w-3.5 h-3.5" />
                          Services
                        </button>
                      )}
                      {hasPermission('system:config_read') && (
                        <button
                          onClick={() => {
                            setServerControlTab('configs');
                            fetchConfigFiles();
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            serverControlTab === 'configs'
                              ? 'bg-brand-pink text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          Configs
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-tab 1: Performance */}
                  {serverControlTab === 'performance' && (
                    <div className="space-y-6 animate-fadeIn">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glassmorphism-card p-6 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400 font-semibold">CPU Allocation</span>
                            <span className="text-brand-purple font-bold">{systemHealth.metrics.cpu_usage}%</span>
                          </div>
                          <div className="w-full h-4 bg-brand-plum rounded-full overflow-hidden indicator-track">
                            <div className="h-full bg-brand-purple rounded-full indicator-bar" style={{ width: `${systemHealth.metrics.cpu_usage}%` }}></div>
                          </div>
                        </div>

                        <div className="glassmorphism-card p-6 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400 font-semibold">RAM Usage</span>
                            <span className="text-brand-yellow font-bold">{systemHealth.metrics.ram_usage}%</span>
                          </div>
                          <div className="w-full h-4 bg-brand-plum rounded-full overflow-hidden indicator-track">
                            <div className="h-full bg-brand-yellow rounded-full indicator-bar" style={{ width: `${systemHealth.metrics.ram_usage}%` }}></div>
                          </div>
                        </div>

                        <div className="glassmorphism-card p-6 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400 font-semibold">Disk Usage</span>
                            <span className="text-brand-pink font-bold">{systemHealth.metrics.disk_usage}%</span>
                          </div>
                          <div className="w-full h-4 bg-brand-plum rounded-full overflow-hidden indicator-track">
                            <div className="h-full bg-brand-pink rounded-full indicator-bar" style={{ width: `${systemHealth.metrics.disk_usage}%` }}></div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="glassmorphism-card p-6 rounded-2xl">
                          <h3 className="text-lg font-bold text-white mb-4">Core Mail Services</h3>
                          <div className="divide-y divide-white/5">
                            {hasPermission('system:service_status') && detailedServices.length > 0 ? (
                              detailedServices.map(s => (
                                <div key={s.name} className="flex justify-between items-center py-3">
                                  <span className="text-sm font-semibold text-slate-300">{s.name}</span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    s.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {s.status}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="py-3 text-sm text-slate-500">Service details require service status permission.</div>
                            )}
                          </div>
                        </div>

                        <div className="glassmorphism-card p-6 rounded-2xl flex flex-col justify-between">
                          <div>
                            <h3 className="text-lg font-bold text-white mb-4">System Information</h3>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between"><span className="text-slate-400">Server Host:</span><span className="text-white font-mono">mail.zimprices.co.zw</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Server IP:</span><span className="text-white font-mono">51.77.222.232</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Uptime:</span><span className="text-white">{systemHealth.metrics.uptime}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Last Metrics Check:</span><span className="text-white">{systemHealth.metrics.updated_at ? new Date(systemHealth.metrics.updated_at).toLocaleTimeString() : 'N/A'}</span></div>
                            </div>
                          </div>
                          <button 
                            onClick={() => fetchSystemHealth()}
                            className="w-full mt-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Force Refresh Metrics
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 2: Detailed Service Control */}
                  {serverControlTab === 'services' && (
                    <div className="animate-fadeIn">
                      {!logsService ? (
                        <div className="glassmorphism-card p-6 rounded-2xl border border-white/5">
                          <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">System Service Management</h3>
                            <button 
                              onClick={() => fetchDetailedServices()}
                              className="flex items-center gap-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${servicesLoading ? 'animate-spin' : ''}`} />
                              Refresh
                            </button>
                          </div>
                          
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-white/5 text-slate-400 text-xs uppercase font-bold tracking-wider">
                                  <th className="pb-3">Service Name</th>
                                  <th className="pb-3">Status</th>
                                  <th className="pb-3">System Properties</th>
                                  <th className="pb-3 text-right">Service Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailedServices.map(s => {
                                  const isLoading = serviceActionLoading[s.service_name];
                                  return (
                                    <tr key={s.service_name} className="border-b border-white/5 last:border-0 hover:bg-white/1">
                                      <td className="py-4">
                                        <div className="font-bold text-white text-sm">{s.name}</div>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{s.service_name}.service</div>
                                      </td>
                                      <td className="py-4">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                          s.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}>
                                          {s.status}
                                        </span>
                                      </td>
                                      <td className="py-4 text-xs space-y-1">
                                        <div><span className="text-slate-500">PID:</span> <span className="text-slate-300 font-mono font-medium">{s.pid || '-'}</span></div>
                                        <div><span className="text-slate-500">RAM:</span> <span className="text-slate-300 font-mono font-medium">{s.memory || '-'}</span></div>
                                        <div><span className="text-slate-500">Uptime:</span> <span className="text-slate-300 font-medium">{s.uptime || '-'}</span></div>
                                      </td>
                                      <td className="py-4 text-right">
                                        <div className="flex justify-end gap-2 items-center">
                                          {hasPermission('system:journal_query') && (
                                            <button
                                              onClick={() => setLogsService(s.service_name)}
                                              className="p-2 text-xs font-bold rounded-lg cursor-pointer transition-all bg-brand-pink/80 hover:bg-brand-pink text-white border border-brand-pink/20"
                                              title="View logs"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                          {s.active ? (
                                            <>
                                              {hasPermission('system:service_stop') && (
                                                <button
                                                  disabled={isLoading}
                                                  onClick={() => handleServiceControl(s.service_name, 'stop')}
                                                  className="p-2 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg disabled:opacity-50 cursor-pointer transition-all active:scale-[0.98]"
                                                  title={isLoading === 'stop' ? 'Stopping...' : 'Stop'}
                                                >
                                                  <Power className={`w-3.5 h-3.5 ${isLoading === 'stop' ? 'animate-pulse' : ''}`} />
                                                </button>
                                              )}
                                              {hasPermission('system:service_restart') && (
                                                <button
                                                  disabled={isLoading}
                                                  onClick={() => handleServiceControl(s.service_name, 'restart')}
                                                  className="p-2 text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-lg disabled:opacity-50 cursor-pointer transition-all active:scale-[0.98]"
                                                  title={isLoading === 'restart' ? 'Restarting...' : 'Restart'}
                                                >
                                                  <RotateCcw className={`w-3.5 h-3.5 ${isLoading === 'restart' ? 'animate-spin' : ''}`} />
                                                </button>
                                              )}
                                            </>
                                          ) : (
                                            hasPermission('system:service_start') && (
                                              <button
                                                disabled={isLoading}
                                                onClick={() => handleServiceControl(s.service_name, 'start')}
                                                className="p-2 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg disabled:opacity-50 cursor-pointer transition-all active:scale-[0.98]"
                                                title={isLoading === 'start' ? 'Starting...' : 'Start'}
                                              >
                                                <Play className={`w-3.5 h-3.5 ${isLoading === 'start' ? 'animate-pulse' : ''}`} />
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="block md:hidden space-y-4">
                            {detailedServices.map(s => {
                              const isLoading = serviceActionLoading[s.service_name];
                              return (
                                <div key={s.service_name} className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div className="font-bold text-white text-sm">{s.name}</div>
                                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.service_name}.service</div>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                      s.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}>
                                      {s.status}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/5 text-[11px]">
                                    <div><span className="text-slate-500 block">PID</span><span className="text-slate-300 font-mono font-medium">{s.pid || '-'}</span></div>
                                    <div><span className="text-slate-500 block">RAM</span><span className="text-slate-300 font-mono font-medium">{s.memory || '-'}</span></div>
                                    <div><span className="text-slate-500 block">Uptime</span><span className="text-slate-300 font-medium truncate block" title={s.uptime}>{s.uptime || '-'}</span></div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    {hasPermission('system:journal_query') && (
                                      <button onClick={() => setLogsService(s.service_name)} className="flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all bg-brand-pink/80 hover:bg-brand-pink text-white border border-brand-pink/20">View Logs</button>
                                    )}
                                    {s.active ? (
                                      <>
                                        {hasPermission('system:service_stop') && <button disabled={isLoading} onClick={() => handleServiceControl(s.service_name, 'stop')} className="flex-1 py-2 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl disabled:opacity-50 cursor-pointer transition-all">{isLoading === 'stop' ? 'Stopping...' : 'Stop'}</button>}
                                        {hasPermission('system:service_restart') && <button disabled={isLoading} onClick={() => handleServiceControl(s.service_name, 'restart')} className="flex-1 py-2 text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-xl disabled:opacity-50 cursor-pointer transition-all">{isLoading === 'restart' ? 'Restarting...' : 'Restart'}</button>}
                                      </>
                                    ) : (
                                      hasPermission('system:service_start') && <button disabled={isLoading} onClick={() => handleServiceControl(s.service_name, 'start')} className="flex-grow py-2 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl disabled:opacity-50 cursor-pointer transition-all">{isLoading === 'start' ? 'Starting...' : 'Start'}</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div ref={logsContainerRef} className={`grid grid-cols-1 ${serviceRailExpanded ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-[72px_minmax(0,1fr)]'} gap-3 min-h-[calc(100vh-230px)]`}>
                          <aside className="glassmorphism-card rounded-2xl border border-white/5 p-2 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-250px)] overflow-y-auto">
                            <div className={`flex items-center ${serviceRailExpanded ? 'justify-between' : 'justify-center'} mb-2`}>
                              {serviceRailExpanded && <h3 className="text-sm font-bold text-white px-1">Services</h3>}
                              <div className="flex items-center gap-1">
                                <button onClick={() => setServiceRailExpanded(v => !v)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer" title={serviceRailExpanded ? 'Collapse services' : 'Expand services'}>
                                  {serviceRailExpanded ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
                                </button>
                                {serviceRailExpanded && (
                                  <button onClick={() => fetchDetailedServices()} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer" title="Refresh services">
                                    <RefreshCw className={`w-3.5 h-3.5 ${servicesLoading ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {detailedServices.map(s => {
                                const initials = s.service_name.slice(0, 2).toUpperCase();
                                return (
                                  <button
                                    key={s.service_name}
                                    onClick={() => setLogsService(s.service_name)}
                                    title={`${s.name} (${s.service_name}.service)`}
                                    className={`w-full rounded-xl border transition-all cursor-pointer ${serviceRailExpanded ? 'px-3 py-2.5 text-left' : 'h-11 px-0 flex items-center justify-center'} ${logsService === s.service_name ? 'bg-brand-pink/20 border-brand-pink/40 text-white' : 'bg-white/3 border-white/5 text-slate-300 hover:bg-white/7'}`}
                                  >
                                    {serviceRailExpanded ? (
                                      <>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-bold truncate">{s.name}</span>
                                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.active ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{s.service_name}.service</div>
                                      </>
                                    ) : (
                                      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[10px] font-black">
                                        {initials}
                                        <span className={`absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full ${s.active ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => setLogsService('')}
                              className={`mt-3 w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer ${serviceRailExpanded ? 'px-3 py-2' : 'h-10 px-0'}`}
                              title="Service controls"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              {serviceRailExpanded && 'Service Controls'}
                            </button>
                          </aside>

                          <section className="glassmorphism-card rounded-2xl border border-white/5 p-4 lg:p-5 flex flex-col min-h-[calc(100vh-230px)]">
                            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 mb-4">
                              <div>
                                <h4 className="font-bold text-white text-lg">Service Log Viewer</h4>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">{logsService}.service</p>
                              </div>
                              <button onClick={() => setLogsService('')} className="self-start xl:self-auto text-slate-400 hover:text-white cursor-pointer transition-all p-2 rounded-lg hover:bg-white/5" title="Close log viewer">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 bg-white/2 p-2.5 rounded-xl border border-white/5 mb-4">
                              <select value={logsSince} onChange={(e) => setLogsSince(e.target.value)} className="w-[118px] bg-brand-plum border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none" title="Journal time range">
                                <option value="15m">Last 15m</option>
                                <option value="1h">Last 1h</option>
                                <option value="6h">Last 6h</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                              </select>
                              <select value={logsPriority} onChange={(e) => setLogsPriority(e.target.value)} className="w-[118px] bg-brand-plum border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none" title="Severity">
                                <option value="all">All levels</option>
                                <option value="error">Errors</option>
                                <option value="warning">Warnings</option>
                                <option value="info">Info</option>
                                <option value="debug">Debug</option>
                              </select>
                              <select value={logsLimit} onChange={(e) => setLogsLimit(Number(e.target.value))} className="w-[118px] bg-brand-plum border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none" title="Line limit">
                                <option value="50">50 lines</option>
                                <option value="100">100 lines</option>
                                <option value="200">200 lines</option>
                                <option value="500">500 lines</option>
                              </select>
                              <select value={logsInterval} onChange={(e) => setLogsInterval(Number(e.target.value))} className="w-[110px] bg-brand-plum border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none" title="Refresh interval">
                                <option value="2000">2s</option>
                                <option value="5000">5s</option>
                                <option value="10000">10s</option>
                                <option value="30000">30s</option>
                              </select>
                              <input value={logsQuery} onChange={(e) => setLogsQuery(e.target.value)} placeholder="Search journal" className="min-w-[180px] flex-1 bg-brand-plum border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                              <div className="flex gap-2 w-[128px] shrink-0">
                                <button onClick={() => setAutoRefreshLogs(v => !v)} className={`h-8 w-8 flex items-center justify-center text-[10px] font-bold rounded cursor-pointer transition-all ${autoRefreshLogs ? 'bg-brand-pink text-white' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`} title={autoRefreshLogs ? 'Pause follow' : 'Follow logs'}>{autoRefreshLogs ? 'II' : 'F'}</button>
                                <button onClick={() => fetchServiceLogs(logsService)} className="h-8 flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-300 px-2 rounded cursor-pointer transition-all" title="Run query"><RefreshCw className={`w-3 h-3 ${serviceLogsLoading ? 'animate-spin' : ''}`} />Run</button>
                              </div>
                            </div>

                            <div className="flex-1 bg-black/70 rounded-xl p-4 overflow-y-auto font-mono text-[11px] text-emerald-400 border border-white/5 space-y-1.5 selection:bg-emerald-500 selection:text-black min-h-[520px] lg:min-h-0">
                              {serviceLogsLoading && serviceLogs.length === 0 ? (
                                <div className="text-slate-500 italic text-center py-8">Streaming service logs...</div>
                              ) : serviceLogs.length > 0 ? (
                                serviceLogs.map((log, idx) => (
                                  <div key={idx} className="whitespace-pre-wrap break-words leading-relaxed font-normal">{log}</div>
                                ))
                              ) : (
                                <div className="text-slate-500 italic text-center py-8">No logs found.</div>
                              )}
                            </div>
                          </section>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-tab 3: Config Editor */}
                  {serverControlTab === 'configs' && (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-fadeIn">
                      {/* Sidebar */}
                      <div className="xl:col-span-1 space-y-4">
                        <div className="glassmorphism-card p-4 rounded-2xl border border-white/5">
                          <h4 className="font-bold text-white text-sm mb-3">Configuration Files</h4>
                          <div className="space-y-1">
                            {configFiles.filter(cf => cf.kind !== 'nginx_site').map(cf => (
                              <button
                                key={cf.id}
                                onClick={() => setSelectedConfigId(cf.id)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border ${
                                  selectedConfigId === cf.id 
                                    ? 'bg-brand-pink/20 text-brand-pink border-brand-pink/30' 
                                    : 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border-transparent'
                                }`}
                              >
                                <span>{cf.label}</span>
                                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                              </button>
                            ))}
                            
                            {configFiles.some(cf => cf.kind === 'nginx_site') && (() => {
                              const isSubdomainSelected = selectedConfigId && selectedConfigId.startsWith('nginx_site_');
                              return (
                                <button
                                  onClick={() => {
                                    const firstSubdomain = configFiles.find(cf => cf.kind === 'nginx_site');
                                    if (firstSubdomain) {
                                      setSelectedConfigId(firstSubdomain.id);
                                    }
                                  }}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border ${
                                    isSubdomainSelected
                                      ? 'bg-brand-pink/20 text-brand-pink border-brand-pink/30' 
                                      : 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border-transparent'
                                  }`}
                                >
                                  <span>Nginx Subdomain Sites</span>
                                  <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* Editor section */}
                      <div className="xl:col-span-3 space-y-4">
                        <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
                          <div className="border-b border-white/5 px-6 py-4 bg-white/2 flex flex-wrap justify-between items-center gap-4">
                            <div>
                              {(() => {
                                const selectedConfig = configFiles.find(cf => cf.id === selectedConfigId);
                                const isSubdomain = selectedConfig?.kind === 'nginx_site';
                                if (isSubdomain) {
                                  return (
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-pink">Nginx Subdomain Sites</span>
                                      <select
                                        value={selectedConfigId}
                                        onChange={(e) => setSelectedConfigId(e.target.value)}
                                        className="mt-1.5 bg-brand-plum border border-white/10 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand-pink/50 cursor-pointer min-w-[240px] shadow-lg"
                                      >
                                        {configFiles
                                          .filter(cf => cf.kind === 'nginx_site')
                                          .map(cf => (
                                            <option key={cf.id} value={cf.id} className="bg-brand-plum text-white font-bold">
                                              {cf.filename}
                                            </option>
                                          ))}
                                      </select>
                                      <span className="text-[10px] text-slate-500 font-mono mt-1">
                                        {configDisplayPath(selectedConfigId, configFiles)}
                                      </span>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div>
                                      <h4 className="font-bold text-white text-sm">
                                        {selectedConfig?.label || 'Loading Config...'}
                                      </h4>
                                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                                        {configDisplayPath(selectedConfigId, configFiles)}
                                      </p>
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                            
                            <div className="flex items-center gap-3">
                              {(() => {
                                const selectedConfig = configFiles.find(cf => cf.id === selectedConfigId);
                                return selectedConfig?.kind === 'nginx_site' ? (
                                  <div className="flex items-center gap-3">
                                    {/* Status Badge */}
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                                      <span className={`w-1.5 h-1.5 rounded-full ${selectedConfig.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                        {selectedConfig.enabled ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </div>
                                    
                                    {/* Action Button */}
                                    {hasPermission('system:config_write') && (
                                      <button
                                        disabled={isSavingConfig}
                                        onClick={handleToggleNginxSite}
                                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer disabled:opacity-50 ${
                                          selectedConfig.enabled 
                                            ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30' 
                                            : 'bg-brand-mint/10 text-brand-mint border-brand-mint/20 hover:bg-brand-mint/20 hover:border-brand-mint/30'
                                        }`}
                                      >
                                        {selectedConfig.enabled ? 'Disable Site' : 'Enable Site'}
                                      </button>
                                    )}
                                  </div>
                                ) : null;
                              })()}
                              {configIsDirty && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 border border-amber-400/20 rounded-full">
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                                  Unsaved changes
                                </span>
                              )}
                              
                              <button
                                disabled={configLoading}
                                onClick={() => fetchConfigContent(selectedConfigId)}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                title="Reload configuration from disk"
                              >
                                <RefreshCw className={`w-4 h-4 ${configLoading ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>
                          
                          {selectedConfigId === 'nginx_global' && (
                            <div className="px-6 py-4 border-t border-white/5 bg-[#fffaf0]/70">
                              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                  <div className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Worker Processes</div>
                                  <div className="flex flex-wrap gap-2">
                                    {['auto', 'custom'].map(mode => {
                                      const current = getNginxDirective(configContent, 'worker_processes', 'auto');
                                      const checked = mode === 'auto' ? current === 'auto' : current !== 'auto';
                                      return (
                                        <label key={mode} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                                          <input
                                            type="radio"
                                            checked={checked}
                                            onChange={() => {
                                              setConfigContent(prev => setNginxDirective(prev, 'worker_processes', mode === 'auto' ? 'auto' : '2'));
                                              setConfigIsDirty(true);
                                            }}
                                          />
                                          {mode === 'auto' ? 'Auto' : 'Custom'}
                                        </label>
                                      );
                                    })}
                                  </div>
                                  {getNginxDirective(configContent, 'worker_processes', 'auto') !== 'auto' && (
                                    <input
                                      type="number"
                                      min="1"
                                      max="64"
                                      value={getNginxDirective(configContent, 'worker_processes', '2')}
                                      onChange={(e) => {
                                        setConfigContent(prev => setNginxDirective(prev, 'worker_processes', e.target.value || '1'));
                                        setConfigIsDirty(true);
                                      }}
                                      className="w-20 px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-900"
                                    />
                                  )}
                                </div>

                                {[['sendfile', 'Sendfile'], ['gzip', 'Gzip']].map(([directive, label]) => (
                                  <div key={directive} className="space-y-2">
                                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wide">{label}</div>
                                    <div className="flex gap-2">
                                      {['on', 'off'].map(value => (
                                        <label key={value} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                                          <input
                                            type="radio"
                                            checked={getNginxDirective(configContent, directive, directive === 'sendfile' ? 'on' : 'off') === value}
                                            onChange={() => {
                                              setConfigContent(prev => setNginxDirective(prev, directive, value));
                                              setConfigIsDirty(true);
                                            }}
                                          />
                                          {value.toUpperCase()}
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}

                                <div className="grid grid-cols-2 gap-3">
                                  {[
                                    ['keepalive_timeout', 'Keepalive', '65'],
                                    ['client_max_body_size', 'Body Size', '25m']
                                  ].map(([directive, label, fallback]) => (
                                    <label key={directive} className="space-y-1">
                                      <span className="block text-[10px] font-black uppercase text-slate-500 tracking-wide">{label}</span>
                                      <input
                                        type="text"
                                        value={getNginxDirective(configContent, directive, fallback)}
                                        onChange={(e) => {
                                          setConfigContent(prev => setNginxDirective(prev, directive, e.target.value || fallback));
                                          setConfigIsDirty(true);
                                        }}
                                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-900"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="p-4 bg-brand-plum/40 min-h-[350px] relative">
                            {configLoading ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-brand-plum/80 z-10">
                                <div className="flex flex-col items-center gap-2">
                                  <RefreshCw className="w-8 h-8 text-brand-pink animate-spin" />
                                  <span className="text-xs text-slate-400 font-bold">Loading configuration content...</span>
                                </div>
                              </div>
                            ) : (
                              <div className="code-editor-container overflow-auto max-h-[450px] rounded-xl border-2 border-[#151214] bg-[#371f35] font-mono shadow-inner">
                                <CodeEditor
                                  value={configContent}
                                  onValueChange={code => {
                                    setConfigContent(code);
                                    setConfigIsDirty(true);
                                  }}
                                  highlight={code => highlightConfig(code)}
                                  padding={16}
                                  style={{
                                    fontFamily: '"Fira Code", Courier, monospace',
                                    fontSize: 13,
                                    lineHeight: '1.6',
                                    backgroundColor: '#371f35',
                                    color: '#fffaf0',
                                    caretColor: '#df8ed6',
                                    minHeight: 430,
                                    outline: 'none',
                                  }}
                                  className="w-full focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="border-t border-white/5 px-6 py-4 bg-white/2 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="text-xs text-slate-500 font-medium text-center sm:text-left">
                              Configuration changes trigger validation tests. Invalid structures cause automatic rollbacks.
                            </div>
                            <div className="flex gap-3">
                              {hasPermission('system:config_write') && (
                                <>
                                  <button
                                    disabled={isValidatingConfig || configLoading || isSavingConfig}
                                    onClick={handleValidateConfig}
                                    className="bg-brand-yellow text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-all border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    {isValidatingConfig ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 animate-spin text-slate-950" />
                                        Testing Syntax...
                                      </>
                                    ) : (
                                      'Dry-Run Validation'
                                    )}
                                  </button>
                                  <button
                                    disabled={isSavingConfig || configLoading || !configIsDirty}
                                    onClick={handleSaveConfig}
                                    className="bg-brand-pink text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-all border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    {isSavingConfig ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 animate-spin text-slate-950" />
                                        Deploying...
                                      </>
                                    ) : (
                                      'Save & Deploy'
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Validation message box */}
                        {configValidation && (
                          <div className={`p-5 rounded-2xl border flex gap-3.5 items-start transition-all animate-fadeIn ${
                            configValidation.valid 
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}>
                            {configValidation.valid ? (
                              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
                            )}
                            <div className="flex-1 space-y-1">
                              <h5 className="font-bold text-sm">
                                {configValidation.valid ? 'Syntax Validation Successful' : 'Syntax Validation Failed'}
                              </h5>
                              <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                                {configValidation.message}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'logs' && hasPermission('system:logs') && (
                <div className="space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-extrabold text-white tracking-tight">Administrative Logs</h2>
                      <p className="text-slate-400 text-sm mt-1">Audit trail of critical modifications completed via the mail console.</p>
                    </div>
                    {hasPermission('system:logs_purge') && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={auditPurgePreset}
                          onChange={(e) => setAuditPurgePreset(e.target.value)}
                          className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        >
                          <option value="yesterday">Purge until yesterday</option>
                          <option value="last_7_days">Purge older than 7 days</option>
                          <option value="last_30_days">Purge older than 30 days</option>
                          <option value="custom">Purge until date</option>
                        </select>
                        {auditPurgePreset === 'custom' && (
                          <input
                            type="date"
                            value={auditPurgeDate}
                            onChange={(e) => setAuditPurgeDate(e.target.value)}
                            className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        )}
                        <button
                          onClick={purgeAuditLogs}
                          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Purge
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="glassmorphism-card p-4 rounded-2xl border border-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
                      <input value={auditFilters.q} onChange={(e) => setAuditFilters(v => ({ ...v, q: e.target.value }))} placeholder="Search details" className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                      <input value={auditFilters.admin_email} onChange={(e) => setAuditFilters(v => ({ ...v, admin_email: e.target.value }))} placeholder="Admin email" className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                      <input value={auditFilters.action} onChange={(e) => setAuditFilters(v => ({ ...v, action: e.target.value }))} placeholder="Action" className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                      <input value={auditFilters.target} onChange={(e) => setAuditFilters(v => ({ ...v, target: e.target.value }))} placeholder="Target" className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                      <input type="date" value={auditFilters.from} onChange={(e) => setAuditFilters(v => ({ ...v, from: e.target.value }))} className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none" />
                      <input type="date" value={auditFilters.to} onChange={(e) => setAuditFilters(v => ({ ...v, to: e.target.value }))} className="bg-brand-plum border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none" />
                      <button onClick={() => fetchAuditLogs()} className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer">
                        <Search className="w-3.5 h-3.5" />
                        Query
                      </button>
                    </div>
                  </div>

                  <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur z-10">
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Timestamp</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Administrator</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Target</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.length > 0 ? (
                            auditLogs.map(l => (
                              <tr key={l.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                                <td className="p-4 text-xs text-slate-400 font-mono">{new Date(l.timestamp).toLocaleString()}</td>
                                <td className="p-4 text-slate-300 font-semibold">{l.admin_email}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    l.action.startsWith('DELETE') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-brand-pink/10 text-brand-pink border border-brand-pink/20'
                                  }`}>
                                    {l.action}
                                  </span>
                                </td>
                                <td className="p-4 text-slate-200 font-mono font-medium">{l.target}</td>
                                <td className="p-4 text-xs text-slate-400 max-w-xs truncate" title={l.details}>{l.details}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="5" className="p-8 text-center text-slate-400">No logs found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'users' && hasPermission('users:read') && (
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
                                    <div className="text-[10px] text-slate-400 mt-0.5">Joined: {new Date(u.date_joined).toLocaleDateString()}</div>
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
                                        onClick={() => {
                                          setSelectedConsoleUser(u);
                                          setShowEditConsoleUserModal(true);
                                        }}
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
              )}

              {activeTab === 'plans' && hasPermission('plans:read') && (
                <div className="space-y-6">
                  {/* Plans Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tight">Mail Hosting Plans</h2>
                      <p className="text-sm text-slate-400 mt-1">Configure user limits, alias limits, and mailbox quotas for hosting domains.</p>
                    </div>
                    {hasPermission('plans:create') && (
                      <button 
                        onClick={() => { setSelectedPlan(null); setShowAddPlanModal(true); }}
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
                                      onClick={() => {
                                        setSelectedPlan(p);
                                        setShowEditPlanModal(true);
                                      }}
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
              )}

              {activeTab === 'registrations' && hasPermission('registrations:read') && (
                <div className="space-y-8 animate-fade-in">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <Shield className="w-7 h-7 text-rose-400" />
                        Domain Registration Console
                      </h2>
                      <p className="text-sm text-slate-400 mt-1">
                        Register, transfer, or modify Zimbabwean .CO.ZW sub-domains using automated ZISPA templates.
                      </p>
                    </div>
                  </div>

                  {/* Form & Checker Container */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left & Middle Column: Interactive Form Card */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-6">
                        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
                          <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">1</span>
                          Search Domain & Link DNS
                        </h3>

                        {/* Mode Toggle */}
                        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 text-xs w-fit">
                          <button
                            type="button"
                            onClick={() => {
                              setIsBulkReg(false);
                              setRegAction('N');
                              setSearchResult(null);
                              setCfResult(null);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                              !isBulkReg
                                ? 'bg-rose-400 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Single Domain Check
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsBulkReg(true);
                              setRegAction('bulk_edit');
                              setSearchResult(null);
                              setCfResult(null);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                              isBulkReg
                                ? 'bg-rose-400 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Bulk Edit
                          </button>
                        </div>

                        {!isBulkReg ? (
                          <>
                            {/* Step 1: Availability Check */}
                            <form onSubmit={handleCheckDomain} className="space-y-4">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Domain Name (e.g. example.co.zw)
                              </label>
                              <div className="flex gap-3">
                                <input 
                                  type="text" 
                                  required
                                  placeholder="e.g. yourbusiness.co.zw" 
                                  value={searchDomainName}
                                  onChange={(e) => {
                                    setSearchDomainName(e.target.value);
                                    setSearchResult(null);
                                    setCfResult(null);
                                  }}
                                  className="flex-1 px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 font-mono text-sm"
                                />
                                <button
                                  type="submit"
                                  disabled={searchLoading}
                                  className="px-6 py-3 bg-brand-yellow text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center gap-2 cursor-pointer"
                                >
                                  {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Check'}
                                </button>
                              </div>
                            </form>

                            {/* Check Result */}
                            {searchResult && (
                              <div className={`p-4 rounded-xl border ${
                                !searchResult.is_valid || searchResult.exists 
                                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              } text-sm flex items-start gap-3`}>
                                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold">
                                    {!searchResult.is_valid
                                      ? `Invalid Domain Name: ${searchResult.error_message}`
                                      : searchResult.exists 
                                      ? `Domain "${searchResult.domain}" is registered or exists.` 
                                      : `Domain "${searchResult.domain}" is available for registration!`
                                    }
                                  </p>
                                  {searchResult.is_valid && !searchResult.exists && (
                                    <p className="text-slate-300 text-xs mt-1">
                                      Proceed to Cloudflare configuration below to retrieve Nameservers and resolve IPs.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Step 2: Cloudflare Credential selection */}
                            {searchResult && searchResult.is_valid && !searchResult.exists && (
                              <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
                                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">2</span>
                                  DNS & Cloudflare Setup
                                </h3>

                                <form onSubmit={handleAddCloudflare} className="space-y-4">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                      Select Cloudflare Credentials
                                    </label>
                                    <select
                                      required
                                      value={cfCredentialId}
                                      onChange={(e) => setCfCredentialId(e.target.value)}
                                      className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                    >
                                      <option value="">-- Choose Credential --</option>
                                      {credentials.map(c => (
                                        <option key={c.id} value={c.id}>{c.label} ({c.email})</option>
                                      ))}
                                    </select>
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={cfLoading || !cfCredentialId}
                                    className="px-6 py-3 bg-brand-mint text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[3px_3px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {cfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Retrieve DNS Details'}
                                  </button>
                                </form>
                              </div>
                            )}

                            {/* Step 3: ZISPA Form Details */}
                            {cfResult && (
                              <div className="space-y-6 pt-4 border-t border-white/5">
                                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 pb-3 border-b border-white/5">
                                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">3</span>
                                  ZISPA Registration Info
                                </h3>

                                <form onSubmit={handleSubmitRegistration} className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Action</label>
                                      <select
                                        value={regAction}
                                        onChange={(e) => setRegAction(e.target.value)}
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      >
                                        <option value="N">New Registration</option>
                                        <option value="M">Modification</option>
                                        <option value="T">Transfer</option>
                                        <option value="D">Delete</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Name</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={ownerName}
                                        onChange={(e) => setOwnerName(e.target.value)}
                                        placeholder="e.g. John Doe"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Organisation</label>
                                      <input 
                                        type="text" 
                                        value={ownerOrg}
                                        onChange={(e) => setOwnerOrg(e.target.value)}
                                        placeholder="e.g. Civil Engineering Projects"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Email</label>
                                      <input 
                                        type="email" 
                                        required 
                                        value={ownerEmail}
                                        onChange={(e) => setOwnerEmail(e.target.value)}
                                        placeholder="e.g. owner@example.com"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Phone</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={ownerPhone}
                                        onChange={(e) => setOwnerPhone(e.target.value)}
                                        placeholder="e.g. +263777000000"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Fax</label>
                                      <input 
                                        type="text" 
                                        value={ownerFax}
                                        onChange={(e) => setOwnerFax(e.target.value)}
                                        placeholder="None"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Address</label>
                                    <textarea 
                                      required 
                                      rows="2"
                                      value={ownerAddress}
                                      onChange={(e) => setOwnerAddress(e.target.value)}
                                      placeholder="e.g. 123 Samora Machel Avenue"
                                      className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={ownerCity}
                                        onChange={(e) => setOwnerCity(e.target.value)}
                                        placeholder="Harare"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Country</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={ownerCountry}
                                        onChange={(e) => setOwnerCountry(e.target.value)}
                                        placeholder="Zimbabwe"
                                        className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                      />
                                    </div>
                                  </div>

                                  {/* Nameserver readout info */}
                                  <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2 text-xs">
                                    <div className="font-bold text-slate-300 font-sans">Resolved Nameservers:</div>
                                    <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono">
                                      <div>NS1: {cfResult.ns1_hostname || 'None'}</div>
                                      <div>IP: {cfResult.ns1_ip || 'Unresolved'}</div>
                                      <div>NS2: {cfResult.ns2_hostname || 'None'}</div>
                                      <div>IP: {cfResult.ns2_ip || 'Unresolved'}</div>
                                    </div>
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={submitLoading}
                                    className="w-full py-3 bg-brand-pink text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    {submitLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Submit ZISPA Email Application'}
                                  </button>
                                </form>
                              </div>
                            )}
                          </>
                        ) : (
                          <form onSubmit={handleBulkSubmit} className="space-y-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Domains list (one per line, max 50)
                              </label>
                              <textarea
                                rows="5"
                                required
                                placeholder="e.g.&#10;domain1.co.zw&#10;domain2.co.zw"
                                value={bulkDomainsInput}
                                onChange={(e) => setBulkDomainsInput(e.target.value)}
                                className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 font-mono text-sm"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                  Select Cloudflare Credentials
                                </label>
                                <select
                                  required
                                  value={cfCredentialId}
                                  onChange={(e) => setCfCredentialId(e.target.value)}
                                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                >
                                  <option value="">-- Choose Credential --</option>
                                  {credentials.map(c => (
                                    <option key={c.id} value={c.id}>{c.label} ({c.email})</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                  Action Type
                                </label>
                                <select
                                  value={regAction}
                                  onChange={(e) => setRegAction(e.target.value)}
                                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                >
                                  <option value="bulk_edit">Bulk Edit (Nameservers)</option>
                                  <option value="T">Transfer (T)</option>
                                  <option value="M">Modify (M)</option>
                                  <option value="N">New Registration (N)</option>
                                </select>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-white/5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Owner Information Details</h4>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Name</label>
                                  <input 
                                    type="text" 
                                    required 
                                    value={ownerName}
                                    onChange={(e) => setOwnerName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Organization</label>
                                  <input 
                                    type="text" 
                                    value={ownerOrg}
                                    onChange={(e) => setOwnerOrg(e.target.value)}
                                    placeholder="e.g. Acme Corp"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Email</label>
                                  <input 
                                    type="email" 
                                    required 
                                    value={ownerEmail}
                                    onChange={(e) => setOwnerEmail(e.target.value)}
                                    placeholder="e.g. owner@example.co.zw"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Phone</label>
                                  <input 
                                    type="text" 
                                    required 
                                    value={ownerPhone}
                                    onChange={(e) => setOwnerPhone(e.target.value)}
                                    placeholder="e.g. +263777000000"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Address</label>
                                <textarea 
                                  required 
                                  rows="2"
                                  value={ownerAddress}
                                  onChange={(e) => setOwnerAddress(e.target.value)}
                                  placeholder="e.g. 123 Samora Machel Avenue"
                                  className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                                  <input 
                                    type="text" 
                                    required 
                                    value={ownerCity}
                                    onChange={(e) => setOwnerCity(e.target.value)}
                                    placeholder="Harare"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Country</label>
                                  <input 
                                    type="text" 
                                    required 
                                    value={ownerCountry}
                                    onChange={(e) => setOwnerCountry(e.target.value)}
                                    placeholder="Zimbabwe"
                                    className="w-full px-4 py-3 bg-brand-plum-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-rose-400 text-sm"
                                  />
                                </div>
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={bulkLoading}
                              className="w-full py-3 bg-brand-pink text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[4px_4px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {bulkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Process Bulk Application'}
                            </button>

                            {/* Bulk Results Readout */}
                            {bulkResult && (
                              <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-sm space-y-2 mt-4 text-slate-300">
                                <div className="font-bold text-white">Bulk Process Results:</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>Success Count: <span className="text-emerald-400 font-bold">{bulkResult.success_count}</span></div>
                                  <div>Failed Count: <span className="text-red-400 font-bold">{bulkResult.failed_count}</span></div>
                                  <div>Groups Created: <span className="text-blue-400 font-bold">{bulkResult.groups_created}</span></div>
                                </div>
                                {bulkResult.failed_domains && bulkResult.failed_domains.length > 0 && (
                                  <div className="pt-2 border-t border-white/5">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Failed/Skipped Domains:</div>
                                    <ul className="list-disc list-inside text-xs text-red-300 font-mono space-y-0.5 max-h-32 overflow-y-auto">
                                      {bulkResult.failed_domains.map((fd, idx) => (
                                        <li key={idx}>{fd}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Information & Help Panel */}
                    <div className="space-y-6">
                      <div className="glassmorphism-card rounded-2xl p-6 border border-white/5 space-y-4">
                        <h4 className="font-bold text-white text-md flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-brand-yellow" />
                          ZISPA Guidelines
                        </h4>
                        <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
                          <p>
                            Zimbabwean <strong>.co.zw</strong> domain registrations are managed via plain ASCII templates submitted to the registrar via email.
                          </p>
                          <p className="border-l-2 border-brand-yellow pl-2 py-0.5 text-slate-400">
                            Our system automates this by linking the domain to Cloudflare to allocate nameservers, checking resolution, generating the ASCII file, and dispatching it from <strong>dns@zimpricecheck.com</strong>.
                          </p>
                          <p>
                            For testing and verification purposes, all registration applications are currently forwarded to <strong>garikaib@gmail.com</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Past Registrations List */}
                  <div className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <h3 className="text-xl font-extrabold text-white tracking-tight">Recent Registration Submissions</h3>
                      <div className="flex items-center gap-3">
                        {/* Filter tabs */}
                        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 text-xs">
                          {['all', 'pending', 'active'].map(f => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setRegFilter(f)}
                              className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                                regFilter === f
                                  ? 'bg-rose-400 text-slate-950 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                        {/* Poll All Button */}
                        <button
                          type="button"
                          onClick={handlePollAllRegistrations}
                          className="px-4 py-2 bg-brand-yellow text-slate-950 rounded-xl font-black border-2 border-slate-950 shadow-[2px_2px_0_#151214] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:opacity-95 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
                          title="Query DNS for all pending registrations"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Verify All Pending
                        </button>
                      </div>
                    </div>

                    <div className="glassmorphism-card rounded-2xl overflow-hidden border border-white/5">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur z-10">
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Domain</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Submitted</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registrations.filter(r => {
                              if (regFilter === 'active') return r.status === 'active';
                              if (regFilter === 'pending') return r.status !== 'active';
                              return true;
                            }).map(r => (
                              <tr key={r.id} className="border-b border-white/5 text-sm hover:bg-white/2">
                                <td className="p-4">
                                  <div className="font-semibold text-slate-200 font-mono">{r.domain_name}</div>
                                  {r.error_message && (
                                    <div className="text-[10px] text-red-400 mt-1 max-w-xs truncate" title={r.error_message}>
                                      Err: {r.error_message}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-slate-300">
                                  {r.action === 'N' && 'New'}
                                  {r.action === 'M' && 'Modify'}
                                  {r.action === 'T' && 'Transfer'}
                                  {r.action === 'D' && 'Delete'}
                                </td>
                                <td className="p-4 text-slate-300 font-sans">
                                  <div>{r.owner_name}</div>
                                  <div className="text-xs text-slate-500">{r.owner_org}</div>
                                </td>
                                <td className="p-4 font-sans">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    r.status === 'active' 
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : r.status === 'submitted' 
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                      : r.status === 'failed'
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="p-4 text-slate-400 text-xs font-mono">
                                  {new Date(r.submitted_at).toLocaleString()}
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {r.status !== 'active' && (
                                      <button
                                        type="button"
                                        onClick={() => handlePollRegistration(r.id)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer text-xs flex items-center gap-1 font-bold animate-pulse"
                                        title="Verify if domain is active on DNS"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Verify DNS
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleResendRegistrationEmail(r.id)}
                                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1 font-bold"
                                      title="Resend ZISPA template email"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      Resend
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRegistration(r.id)}
                                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                                      title="Delete Registration Record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {registrations.filter(r => {
                              if (regFilter === 'active') return r.status === 'active';
                              if (regFilter === 'pending') return r.status !== 'active';
                              return true;
                            }).length === 0 && (
                              <tr>
                                <td colSpan="6" className="p-8 text-center text-slate-400 font-sans">
                                  No domain registrations matching this filter.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
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
                let indicator = null;
                let textColor = 'text-slate-400';
                
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
                  onClick={() => { setShowEditPlanModal(false); setSelectedPlan(null); }}
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
            
            <form onSubmit={(e) => {
              e.preventDefault();
              handleCreateConsoleUser({
                username: addConsoleUsername,
                password: addConsolePassword,
                is_superuser: addConsoleIsSuper,
                roles: addConsoleRoles,
                domains: addConsoleDomains
              });
            }} className="space-y-4">
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
                onClick={() => setShowEditConsoleUserModal(false)}
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
                  onClick={() => setShowEditConsoleUserModal(false)}
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
    } catch (err) {
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
  onEditAlias, plans, hasPermission, onDeleteDomain, onUpdateActive, refresh 
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
                  <span className="text-slate-500 shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
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
