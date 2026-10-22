export type SaveState = { kind: 'saved' } | { kind: 'error'; message: string };

/** Per-field auto-save result, placed next to the field that saved. */
export function FieldStatus({ state, className = '' }: { state?: SaveState; className?: string }) {
  if (!state) return null;
  return state.kind === 'saved'
    ? <p role="status" className={`text-label text-confirmed ${className}`}>Saved</p>
    : <p role="alert" className={`text-label text-danger ${className}`}>{state.message}</p>;
}
