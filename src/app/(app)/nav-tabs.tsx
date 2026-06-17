'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  ['/planning', 'Planning'],
  ['/recettes', 'Recettes'],
  ['/nutrition', 'Nutrition'],
  ['/stock', 'Stock'],
  ['/courses', 'Courses'],
  ['/foyer', 'Foyer'],
  ['/assistant', 'Assistant'],
] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:justify-center lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
      {NAV.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="nav-pill lg:px-4 lg:py-2 lg:text-sm" data-active={active}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
