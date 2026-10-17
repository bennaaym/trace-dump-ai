import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-white shadow-sm">
          <MapPinOff className="size-6 text-teal-600" />
        </span>
        <h1 className="font-heading mt-5 text-3xl font-bold text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The requested TraceDump AI route does not exist.
        </p>
        <Link
          href="/overview"
          className="bg-primary mt-6 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        >
          Return to overview
        </Link>
      </div>
    </main>
  );
}
