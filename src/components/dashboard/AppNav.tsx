import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3 } from 'lucide-react';

/**
 * Primary section navigation shared by the Dashboard and Analysis pages.
 * Renders a compact segmented control that matches the header's pill styling.
 */
export function AppNav() {
  const base =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-all';
  return (
    <nav className="flex items-center gap-1 bg-background/60 ring-1 ring-border rounded-xl p-1 shadow-sm">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-md shadow-primary/20'
              : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
          }`
        }
      >
        <LayoutDashboard className="h-4 w-4" />
        <span className="hidden sm:inline">Dashboard</span>
      </NavLink>
      <NavLink
        to="/analysis"
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-md shadow-primary/20'
              : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
          }`
        }
      >
        <BarChart3 className="h-4 w-4" />
        <span className="hidden sm:inline">Analysis</span>
      </NavLink>
    </nav>
  );
}
