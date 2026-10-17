"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bell,
  Camera,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronsLeft,
  ClipboardCheck,
  LayoutDashboard,
  MapPinned,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: ShieldCheck },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/map", label: "Map & Heatmap", icon: MapPinned },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebar = (
    <>
      <div
        className={cn(
          "flex h-18 items-center border-b border-white/10 px-4",
          collapsed && "lg:justify-center lg:px-2",
        )}
      >
        <Image
          src={collapsed ? "/brand/logo-icon.svg" : "/brand/logo-white.svg"}
          alt="TraceDump AI"
          width={collapsed ? 30 : 170}
          height={collapsed ? 36 : 42}
          priority
        />
        <button
          type="button"
          className="ml-auto hidden rounded-md p-1.5 text-slate-300 hover:bg-white/10 lg:block"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronsLeft
            className={cn(
              "size-4 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          className="ml-auto rounded-md p-2 text-white lg:hidden"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        >
          <X className="size-5" />
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/8 hover:text-white",
                active && "bg-teal-500 text-white shadow-sm hover:bg-teal-500",
                collapsed && "lg:justify-center lg:px-2",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <p className={cn("font-semibold text-white", collapsed && "lg:hidden")}>
          Integration status
        </p>
        <p className={cn("mt-1", collapsed && "lg:hidden")}>
          Data source not connected
        </p>
        <span
          className={cn(
            "mt-2 inline-flex size-2 rounded-full bg-amber-400",
            !collapsed && "hidden",
          )}
        />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <aside
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col transition-[width] duration-200 lg:flex",
          collapsed ? "w-18" : "w-58",
        )}
      >
        {sidebar}
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/50"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="bg-sidebar relative flex h-full w-70 flex-col shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}
      <div
        className={cn(
          "transition-[padding] duration-200",
          collapsed ? "lg:pl-18" : "lg:pl-58",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="mr-3 rounded-lg border p-2 text-slate-600 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="relative hidden w-full max-w-xl sm:block">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Global search preview"
              readOnly
              placeholder="Search preview — data source not connected"
              className="h-9 w-full rounded-lg border bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Notifications unavailable"
              title="Notifications are not connected"
            >
              <Bell className="size-5" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
              aria-label="Open account menu"
            >
              <span className="grid size-8 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                OP
              </span>
              <span className="hidden text-left text-xs md:block">
                <strong className="block text-slate-700">Operator</strong>
                <span className="text-slate-400">Preview mode</span>
              </span>
              <ChevronDown className="hidden size-3.5 text-slate-400 md:block" />
            </button>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
