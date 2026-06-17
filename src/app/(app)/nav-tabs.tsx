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
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
      {NAV.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="nav-pill" data-active={active}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
