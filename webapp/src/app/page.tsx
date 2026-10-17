export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-24">
      <div className="space-y-5">
        <p className="text-sm font-medium tracking-widest text-zinc-500 uppercase">
          TraceDump AI
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Investigator application scaffold
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          The application foundation is ready. Surveillance integrations,
          detection, incident workflows, and evidence review will be migrated in
          later phases.
        </p>
      </div>
    </main>
  );
}
