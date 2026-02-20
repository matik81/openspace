export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
        <h1 className="mt-4 text-4xl font-bold text-slate-900">Monorepo initialized</h1>
        <p className="mt-4 text-lg text-slate-600">
          Next.js App Router + NestJS + Prisma workspace scaffold is ready.
        </p>
      </section>
    </main>
  );
}

