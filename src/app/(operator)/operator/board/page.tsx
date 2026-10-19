import { redirect } from 'next/navigation';

/** The company board is part of the dashboard. */
export default function OperatorBoardPage() {
  redirect('/operator/dashboard#dashboard-board');
}
