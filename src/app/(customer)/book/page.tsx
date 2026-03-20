import { MultiLegForm } from '@/components/booking/multi-leg-form';

export default function BookPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-3xl text-brand-cream mb-2">Book a Flight</h1>
        <p className="text-brand-muted">Build your multi-leg itinerary. Operators will compete to quote your trip.</p>
      </div>
      <MultiLegForm />
    </div>
  );
}
