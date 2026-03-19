export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a2332] p-4">
      <div className="text-center">
        <div className="mb-4 text-5xl">📡</div>
        <h1 className="mb-2 text-xl font-semibold text-white">You are offline</h1>
        <p className="text-sm text-gray-400">
          Glab requires an internet connection. Please check your network and try again.
        </p>
      </div>
    </div>
  );
}
