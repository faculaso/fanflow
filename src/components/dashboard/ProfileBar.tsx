import { motion } from 'framer-motion';
import { Feather, Gamepad2, Gauge, Scale } from 'lucide-react';
import type { ProfileId, ProfileOption } from './types';

const PROFILES: (ProfileOption & { icon: React.ComponentType<{ className?: string }> })[] = [
  { id: 'silent', label: 'Silencioso', icon: Feather },
  { id: 'balanced', label: 'Balanceado', icon: Scale },
  { id: 'performance', label: 'Alto rendimiento', icon: Gauge },
  { id: 'gaming', label: 'Juegos', icon: Gamepad2 },
];

interface ProfileBarProps {
  active: ProfileId;
  onChange: (profile: ProfileId) => void;
}

/** Floating pill at the bottom, like the reference's room tabs. */
export default function ProfileBar({ active, onChange }: ProfileBarProps) {
  return (
    <div className="sticky bottom-5 z-20 flex justify-center">
      <div className="glass flex items-center gap-1 rounded-full p-1.5">
        <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Perfil</span>
        {PROFILES.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(id)}
              className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="profile-active"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  className="chip-shadow absolute inset-0 rounded-full bg-chip-active"
                />
              )}
              <Icon className={`relative h-4 w-4 ${isActive ? 'text-accent' : ''}`} />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
