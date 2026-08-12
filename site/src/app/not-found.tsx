import Navbar from '@/components/navbar';
import { ButtonLink } from '@/components/button';

export default function NotFound() {
  return (
    <>
    <Navbar />
    <main className="min-h-screen flex items-center justify-center px-6 pt-20">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-accent text-accent-ink flex items-center justify-center font-bold text-2xl mx-auto mb-8">MP</div>
        <h1 className="text-5xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted mb-8">Page not found</p>
        <p className="text-sm text-faint mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <ButtonLink href="/" variant="primary">
            Back to Home
          </ButtonLink>
          <ButtonLink href="https://github.com/mickelsamuel/migrationpilot" variant="secondary">
            View on GitHub
          </ButtonLink>
        </div>
      </div>
    </main>
    </>
  );
}
