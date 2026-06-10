import { useEffect, useRef } from 'react';
import { 
  Activity, Server, Settings, RefreshCw, Eye, Power, RotateCcw, Play, 
  PanelLeftClose, PanelLeftOpen, ArrowLeft, X, ChevronRight, CheckCircle2, AlertTriangle 
} from 'lucide-react';
import EditorModule from 'react-simple-code-editor';
import {
  highlightConfig,
  getNginxDirective,
  setNginxDirective,
  configDisplayPath,
  formatTimeOnly,
} from '../../shared/lib/helpers';

const CodeEditor = EditorModule?.default?.default || EditorModule?.default || EditorModule;

export function ServerHealthPanel({
  hasPermission,
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
  isSavingConfig,
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
}) {
  const logsContainerRef = useRef(null);

  useEffect(() => {
    if (logsService && logsContainerRef.current && window.innerWidth < 768) {
      logsContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsService]);

  return (
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
                  <div className="flex justify-between"><span className="text-slate-400">Last Metrics Check:</span><span className="text-white">{formatTimeOnly(systemHealth.metrics.updated_at)}</span></div>
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
                    <ChevronRight className="w-3.5 h-3.5" opacity={0.5} />
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
                      <ChevronRight className="w-3.5 h-3.5" opacity={0.5} />
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
  );
}
