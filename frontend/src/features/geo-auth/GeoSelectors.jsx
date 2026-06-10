import { useState } from 'react';

export function CountrySelector({ value, onChange, geoRegions = [] }) {
  const [search, setSearch] = useState('');
  const currentCodes = value ? value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : [];

  const presetCountries = [
    { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
    { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
    { code: 'MZ', name: 'Mozambique', flag: '🇲🇿' },
    { code: 'MW', name: 'Malawi', flag: '🇲🇼' },
    { code: 'BW', name: 'Botswana', flag: '🇧🇼' },
    { code: 'NA', name: 'Namibia', flag: '🇳🇦' },
    { code: 'AO', name: 'Angola', flag: '🇦🇴' },
    { code: 'SZ', name: 'Eswatini', flag: '🇸🇿' },
    { code: 'LS', name: 'Lesotho', flag: '🇱🇸' },
    { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
    { code: 'MU', name: 'Mauritius', flag: '🇲🇺' },
    { code: 'SC', name: 'Seychelles', flag: '🇸🇨' },
    { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
    { code: 'CD', name: 'DR Congo', flag: '🇨🇩' },
    { code: 'KM', name: 'Comoros', flag: '🇰🇲' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
    { code: 'AT', name: 'Austria', flag: '🇦🇹' },
    { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
    { code: 'IL', name: 'Israel', flag: '🇮🇱' },
    { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
    { code: 'CN', name: 'China', flag: '🇨🇳' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'IN', name: 'India', flag: '🇮🇳' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' }
  ];

  const handleToggleCountry = (code) => {
    const updated = currentCodes.includes(code)
      ? currentCodes.filter(c => c !== code)
      : [...currentCodes, code];
    onChange(updated.join(', '));
  };

  const handleToggleRegion = (countriesStr) => {
    const regionCodes = countriesStr.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    const hasAll = regionCodes.every(c => currentCodes.includes(c));
    const updated = hasAll
      ? currentCodes.filter(c => !regionCodes.includes(c))
      : Array.from(new Set([...currentCodes, ...regionCodes]));
    onChange(updated.join(', '));
  };

  const filteredCountries = presetCountries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 border border-white/5 rounded-2xl p-4 bg-brand-plum-dark/40">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search countries by name or ISO code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 bg-brand-plum-dark border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-400"
        />
      </div>

      <div>
        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Region presets (click to toggle group)</span>
        <div className="flex flex-wrap gap-1.5">
          {geoRegions.map(reg => {
            const regCodes = reg.countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            const hasAll = regCodes.every(c => currentCodes.includes(c));
            return (
              <button
                key={reg.name}
                type="button"
                onClick={() => handleToggleRegion(reg.countries)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer border ${
                  hasAll 
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                }`}
              >
                {reg.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
        {filteredCountries.map(c => {
          const isSelected = currentCodes.includes(c.code);
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => handleToggleCountry(c.code)}
              className={`p-2 rounded-xl text-left text-xs transition-all flex items-center gap-2 cursor-pointer border ${
                isSelected 
                  ? 'bg-indigo-500/25 border-indigo-500/40 text-indigo-200' 
                  : 'bg-white/2 border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-300'
              }`}
            >
              <span className="text-sm">{c.flag}</span>
              <span className="truncate flex-1 font-semibold">{c.name}</span>
              <span className="text-[9px] font-mono opacity-55">{c.code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RegionSelector({ value, onChange, geoRegions = [] }) {
  const currentRegions = value ? value.split(',').map(r => r.trim().toUpperCase()).filter(Boolean) : [];

  const handleToggleRegion = (name) => {
    const upperName = name.toUpperCase();
    const updated = currentRegions.includes(upperName)
      ? currentRegions.filter(r => r !== upperName)
      : [...currentRegions, upperName];
    onChange(updated.join(', '));
  };

  return (
    <div className="space-y-2 border border-white/5 rounded-2xl p-4 bg-brand-plum-dark/40">
      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Allowed Regions</span>
      <div className="flex flex-wrap gap-2">
        {geoRegions.map(reg => {
          const isSelected = currentRegions.includes(reg.name.toUpperCase());
          return (
            <button
              key={reg.name}
              type="button"
              onClick={() => handleToggleRegion(reg.name)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer border ${
                isSelected
                  ? 'bg-indigo-500 text-white border-indigo-600 shadow-sm'
                  : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
              }`}
            >
              {reg.name}
            </button>
          );
        })}
        {geoRegions.length === 0 && (
          <span className="text-xs text-slate-500 italic">No regions loaded.</span>
        )}
      </div>
    </div>
  );
}
