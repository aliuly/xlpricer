/* Shared page chrome for the generate views (BasicView & HomeTab). */

export function AppHeader() {
  return (
    <header className="bg-gradient-to-br from-magenta to-magenta-dark text-white py-10 px-6 text-center shrink-0">
      <h1 className="text-3xl font-bold mb-2 tracking-wide">
        📊 XLpricer V2
      </h1>
      <p className="text-pink-200 text-base">
        T-Cloud Public pricing spreadsheet generator
      </p>
    </header>
  )
}

export function BusyOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-magenta border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Working on it, please be patient...
        </p>
      </div>
    </div>
  )
}
