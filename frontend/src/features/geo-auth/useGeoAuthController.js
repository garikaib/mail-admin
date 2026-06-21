// src/features/geo-auth/useGeoAuthController.js
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import useGeoAuthStore from '../../store/useGeoAuthStore';
import useDomainsStore from '../../store/useDomainsStore';

const API_BASE = '/api';

export function useGeoAuthController() {
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const { setSuccessMsg, setErrorMsg } = useUiStore();
  const geoStore = useGeoAuthStore();
  const domainsStore = useDomainsStore();

  const {
    geoSettings, setGeoSettings,
    geoExceptions, setGeoExceptions,
    geoBans, setGeoBans,
    geoRegions, setGeoRegions,
    sshAllowedCountries, setSshAllowedCountries,
    sshAllowedRegions, setSshAllowedRegions,
    sshAugmentDefault, setSshAugmentDefault,
    sshLogs, setSshLogs,
    geoAllowedCountries, setGeoAllowedCountries,
    geoAllowedRegions, setGeoAllowedRegions,
    geoAugmentDefault, setGeoAugmentDefault,
    editingRegion, setEditingRegion,
    editingRegionCountries, setEditingRegionCountries,
    showAddGeoExceptionModal, setShowAddGeoExceptionModal,
    geoExcUsername, setGeoExcUsername,
    geoExcService, setGeoExcService,
    geoExcCountries, setGeoExcCountries,
    geoExcExpires, setGeoExcExpires,
    selectedGeoDomainId, setSelectedGeoDomainId,
    geoSubTab, setGeoSubTab,
  } = geoStore;

  const { domains, setDomains } = domainsStore;
  const [loading, setLoading] = useState(false);

  const fetchDomains = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/domains`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGeoData = async (t = token) => {
    if (!t) return;
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
  };

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

  // Lazy load data on mount
  useEffect(() => {
    if (token) {
      fetchGeoData();
      fetchDomains();
    }
  }, [token]);

  // Synchronously update inputs when selected domain changes
  useEffect(() => {
    if (selectedGeoDomainId) {
      const setting = geoSettings.find(s => s.domain_id === parseInt(selectedGeoDomainId));
      if (setting) {
        setGeoAllowedCountries(setting.allowed_countries || '');
        setGeoAllowedRegions(setting.allowed_regions || 'SADC');
        setGeoAugmentDefault(setting.augment_default !== false);
      } else {
        setGeoAllowedCountries('');
        setGeoAllowedRegions('SADC');
        setGeoAugmentDefault(true);
      }
    }
  }, [selectedGeoDomainId, geoSettings]);

  return {
    geoSubTab,
    setGeoSubTab,
    selectedGeoDomainId,
    setSelectedGeoDomainId,
    geoSettings,
    geoAllowedCountries,
    setGeoAllowedCountries,
    geoAllowedRegions,
    setGeoAllowedRegions,
    geoRegions,
    geoAugmentDefault,
    setGeoAugmentDefault,
    domains,
    loading,
    sshAllowedRegions,
    setSshAllowedRegions,
    sshAllowedCountries,
    setSshAllowedCountries,
    sshAugmentDefault,
    setSshAugmentDefault,
    sshLogs,
    geoBans,
    geoExceptions,
    fetchGeoData,
    handleSaveGeoPolicy,
    handleSaveSshPolicy,
    handleClearGeoBan,
    handleResetRegions,
    setEditingRegion,
    editingRegion,
    editingRegionCountries,
    setEditingRegionCountries,
    handleUpdateRegion,
    showAddGeoExceptionModal,
    setShowAddGeoExceptionModal,
    geoExcUsername,
    setGeoExcUsername,
    geoExcService,
    setGeoExcService,
    geoExcCountries,
    setGeoExcCountries,
    geoExcExpires,
    setGeoExcExpires,
    handleSaveGeoException,
    handleDeleteGeoException,
  };
}
