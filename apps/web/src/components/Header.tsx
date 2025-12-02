import { Link } from '@tanstack/react-router';

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border shadow-sm">
      <Link to="/" className="text-lg font-semibold tracking-tight hover:text-sidebar-accent-foreground transition-colors">
        Pasture
      </Link>
      <nav className="text-sm text-sidebar-foreground/80">
        <Link
          to="/"
          className="rounded-md px-2 py-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          Home
        </Link>
      </nav>
    </header>
  );
}
