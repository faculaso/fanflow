import { motion } from 'framer-motion';
import { Fan, Keyboard, LayoutGrid, MemoryStick, Settings, SlidersHorizontal, Thermometer } from 'lucide-react';
import type { DashboardView } from './types';

interface NavItem {
  id: DashboardView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Panel', icon: LayoutGrid },
  { id: 'curves', label: 'Curvas de ventilación', icon: SlidersHorizontal },
  { id: 'sensors', label: 'Sensores', icon: Thermometer },
  { id: 'memory', label: 'Memoria', icon: MemoryStick },
  { id: 'keyboard', label: 'Pantalla del teclado', icon: Keyboard },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

interface SidebarProps {
  active: DashboardView;
  onNavigate: (view: DashboardView) => void;
}

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="sticky top-14 flex h-[calc(100vh-5rem)] max-h-[640px] w-[72px] shrink-0 flex-col items-center gap-6 self-start">
      <span className="accent-gradient chip-shadow flex h-12 w-12 items-center justify-center rounded-full text-white">
        <Fan className="h-6 w-6 animate-[spin_6s_linear_infinite]" />
      </span>

      <nav className="glass flex flex-col items-center gap-2 rounded-full p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
              className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  className="chip-shadow absolute inset-0 rounded-full bg-chip-active"
                />
              )}
              <Icon className="relative h-5 w-5" />
            </button>
          );
        })}
      </nav>

      <span className="mt-auto text-[10px] font-semibold tracking-wide text-faint">v{__APP_VERSION__}</span>
    </aside>
  );
}
