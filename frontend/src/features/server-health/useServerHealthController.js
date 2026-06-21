// src/features/server-health/useServerHealthController.js
import { useEffect, useRef } from 'react';
import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import useSystemHealthStore from '../../store/useSystemHealthStore';

const API_BASE = '/api';

export function useServerHealthController() {
  const token = useAuthStore(state => state.token);
  const { setSuccessMsg, setErrorMsg, setConfirmModal } = useUiStore();
  const store = useSystemHealthStore();

  const {
    systemHealth, setSystemHealth,
    detailedServices, setDetailedServices,
    servicesLoading, setServicesLoading,
    serviceActionLoading, setServiceActionLoading,
    configFiles, setConfigFiles,
    selectedConfigId, setSelectedConfigId,
    configContent, setConfigContent,
    configIsDirty, setConfigIsDirty,
    configLoading, setConfigLoading,
    isValidatingConfig, setIsValidatingConfig,
    configValidation, setConfigValidation,
    serverControlTab, setServerControlTab,
    logsService, setLogsService,
    serviceRailExpanded, setServiceRailExpanded,
    logsSince, setLogsSince,
    logsPriority, setLogsPriority,
    logsLimit, setLogsLimit,
    logsInterval, setLogsInterval,
    logsQuery, setLogsQuery,
    autoRefreshLogs, setAutoRefreshLogs,
    serviceLogs, setServiceLogs,
    serviceLogsLoading, setServiceLogsLoading,
  } = store;

  // Ref to track active timer/interval
  const pollingRef = useRef(null);

  const fetchSystemHealth = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/system/health`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (err) {
      console.error("Failed to fetch system health:", err);
    }
  };

  const fetchDetailedServices = async (authToken = token) => {
    if (!authToken) return;
    setServicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system/services/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
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
    
    setServiceActionLoading({ ...serviceActionLoading, [serviceName]: action });
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
      setServiceActionLoading({ ...serviceActionLoading, [serviceName]: null });
    }
  };

  const fetchServiceLogs = async (serviceName, limit = logsLimit) => {
    if (!serviceName) return;
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
    
    setConfirmModal({
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
            setConfigFiles(configFiles.map(cf => cf.id === selectedConfigId ? { ...cf, enabled: data.enabled } : cf));
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

  const setIsSavingConfig = (val) => {
    // Helper function mapping
  };

  // Eager loading and configuration updates when tabs/selections change
  useEffect(() => {
    if (token) {
      fetchSystemHealth();
      fetchDetailedServices();
      fetchConfigFiles();
    }
  }, [token]);

  // Load config content when selection changes
  useEffect(() => {
    if (selectedConfigId) {
      fetchConfigContent(selectedConfigId);
    }
  }, [selectedConfigId]);

  // Handle service logs polling/auto-refresh
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (logsService) {
      fetchServiceLogs(logsService);
      
      const intervalMs = parseInt(logsInterval);
      if (autoRefreshLogs && !isNaN(intervalMs) && intervalMs > 0) {
        pollingRef.current = setInterval(() => {
          fetchServiceLogs(logsService);
        }, intervalMs);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [logsService, logsSince, logsPriority, logsLimit, logsInterval, autoRefreshLogs]);

  return {
    systemHealth,
    serverControlTab,
    setServerControlTab,
    fetchDetailedServices,
    fetchConfigFiles,
    detailedServices,
    fetchSystemHealth,
    servicesLoading,
    serviceActionLoading,
    handleServiceControl,
    setLogsService,
    logsService,
    serviceRailExpanded,
    setServiceRailExpanded,
    logsSince,
    setLogsSince,
    logsPriority,
    setLogsPriority,
    logsLimit,
    setLogsLimit,
    logsInterval,
    setLogsInterval,
    logsQuery,
    setLogsQuery,
    autoRefreshLogs,
    setAutoRefreshLogs,
    fetchServiceLogs,
    serviceLogsLoading,
    serviceLogs,
    configFiles,
    selectedConfigId,
    setSelectedConfigId,
    handleToggleNginxSite,
    configIsDirty,
    configLoading,
    fetchConfigContent,
    configContent,
    setConfigContent,
    setConfigIsDirty,
    isValidatingConfig,
    handleValidateConfig,
    handleSaveConfig,
    configValidation,
  };
}
