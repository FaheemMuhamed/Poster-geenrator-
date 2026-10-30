// Morva wordmark: the signal-orange seal (a disc that slowly morphs into a square) + italic name.
export default function Logo({ className = '', showName = true }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="morva-seal size-4 shrink-0 bg-signal" aria-hidden="true" />
      {showName && <span className="font-display text-[21px] leading-none italic tracking-[-0.03em]">Morva</span>}
    </span>
  );
}
