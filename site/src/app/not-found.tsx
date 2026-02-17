export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-2xl mx-auto mb-8">MP</div>
        <h1 className="text-5xl font-bold mb-4">404</h1>
        <p className="text-xl text-slate-400 mb-8">Page not found</p>
        <p className="text-sm text-slate-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors text-sm"
          >
            Back to Home
          </a>
          <a
            href="https://github.com/mickelsamuel/migrationpilot"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors text-sm"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
