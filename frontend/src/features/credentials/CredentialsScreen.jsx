import { CredentialsPanel } from './CredentialsPanel';

export default function CredentialsScreen({
  domains,
  cloudflareZones,
  cfZoneSearchQuery,
  setCfZoneSearchQuery,
  cfZoneStatusFilter,
  setCfZoneStatusFilter,
  cfAccountFilter,
  setCfAccountFilter,
  credentials,
  loading,
  handleScanZoneOwnership,
  setNewCredEmail,
  setShowAddCredModal,
  setEditingCredential,
  setEditCredLabel,
  setEditCredEmail,
  setEditCredKey,
  setShowEditCredModal,
  handleDeleteCredential,
  setSelectedCredential,
  setSelectedZone,
  fetchDnsRecords,
  setSelectedDomain,
  setActiveTab,
  handleSelectDomain,
  setNewDomainName,
  setSelectedCredId,
  setSelectedPlanId,
  setShowAddDomainModal,
  selectedZone,
  dnsRecordType,
  setDnsRecordType,
  dnsRecordName,
  setDnsRecordName,
  dnsRecordContent,
  setDnsRecordContent,
  dnsRecordPriority,
  setDnsRecordPriority,
  dnsRecordProxied,
  setDnsRecordProxied,
  dnsRecordTtl,
  setDnsRecordTtl,
  showAddDnsRecordModal,
  setShowAddDnsRecordModal,
  zoneDnsRecords,
  handleDeleteDnsRecord,
  handleEditDnsRecord,
  showConfirm,
  hasPermission,
  setEditingDnsRecord,
  setShowEditDnsRecordModal
}) {
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
}
