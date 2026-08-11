import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manage Your Subscription — MigrationPilot',
  description:
    'Open the Stripe billing portal to update your payment method, download invoices, or change your MigrationPilot plan.',
  alternates: {
    canonical: '/billing',
  },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
