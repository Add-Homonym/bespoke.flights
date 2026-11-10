import { AutopilotConsole } from '@/components/operator/autopilot-console';

export default function OperatorAutopilotPage() {
  return (
    <div id="autopilot-page" className="space-y-6">
      <div>
        <p className="text-overline text-ink-muted">Operator</p>
        <h1 className="mt-1 text-display text-ink">Autopilot</h1>
        <p className="mt-2 max-w-2xl text-body text-ink-muted">
          Drafts a quote for every request matched to you from these parameters and each aircraft&apos;s rate and cruise speed.
          A staffer reviews each draft and submits it.
        </p>
      </div>
      <AutopilotConsole />
    </div>
  );
}
