import { ExternalLink } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { NTSB_SEARCH_URL, type RegistryRecord } from '@/lib/faa/registry';

const date = (iso?: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : undefined;

const title = (s?: string) => s?.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Days from today to an ISO date (negative when past). */
function daysUntil(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.now()) / 86_400_000);
}

function Row({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '') return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-overline text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{value}</dd>
    </div>
  );
}

/** What the FAA registry says about one tail number, with links to the source and to NTSB records. */
export function RegistrySummary({ record, checkedAt }: { record: RegistryRecord; checkedAt?: string | null }) {
  const expires = record.registrationExpires;
  const left = expires ? daysUntil(expires) : undefined;

  return (
    <div id={`faa-record-${record.nNumber}`} className="space-y-4">
      {record.status === 'not_assigned' && <Notice tone="warning">{record.nNumber} is not assigned on the FAA registry.</Notice>}
      {record.status === 'reserved' && (
        <Notice tone="warning">{record.nNumber} is reserved{record.reservedBy ? ` by ${title(record.reservedBy)}` : ''}, not registered to an aircraft.</Notice>
      )}
      {record.status === 'unknown' && <Notice tone="warning">The FAA registry page could not be read. Open it to check.</Notice>}
      {record.status === 'assigned' && record.registrationStatus && !/^valid$/i.test(record.registrationStatus) && (
        <Notice tone="danger">Registration status: {record.registrationStatus}.</Notice>
      )}
      {record.status === 'assigned' && left !== undefined && left < 0 && (
        <Notice tone="danger">Registration expired {date(expires)}.</Notice>
      )}
      {record.status === 'assigned' && left !== undefined && left >= 0 && left <= 90 && (
        <Notice tone="warning">Registration expires {date(expires)} ({left} days).</Notice>
      )}

      {record.status === 'assigned' && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Row label="Registration" value={record.registrationStatus} />
          <Row label="Expires" value={date(expires)} />
          <Row label="Certificate issued" value={date(record.certificateIssued)} />
          <Row label="Manufacturer" value={title(record.manufacturer)} />
          <Row label="Model" value={record.model} />
          <Row label="Serial" value={record.serialNumber} />
          <Row label="Year built" value={record.year} />
          <Row label="Airworthiness" value={[record.airworthinessClass, record.airworthinessCategory].filter(Boolean).join(' · ') || undefined} />
          <Row label="A/W date" value={date(record.airworthinessDate)} />
          <Row label="Engines" value={[title(record.engineManufacturer), record.engineModel].filter(Boolean).join(' ') || undefined} />
          <Row label="Registered owner" value={title(record.ownerName)} />
          <Row label="Owner location" value={[title(record.ownerCity), title(record.ownerState)].filter(Boolean).join(', ') || undefined} />
          <Row label="Mode S (hex)" value={record.modeSHex} />
          <Row label="Fractional" value={record.fractionalOwner === undefined ? undefined : record.fractionalOwner ? 'Yes' : 'No'} />
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-label">
        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-royal hover:underline underline-offset-4">
          FAA registry record <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
        </a>
        <a href={NTSB_SEARCH_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-royal hover:underline underline-offset-4">
          NTSB accident records <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
        </a>
        {checkedAt && <span className="text-ink-muted">Checked {new Date(checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
      </div>
    </div>
  );
}
