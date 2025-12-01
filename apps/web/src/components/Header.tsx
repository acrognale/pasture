import { Link } from '@tanstack/react-router';

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-slate-950 text-white">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        Pasture
      </Link>
      <nav className="text-sm text-slate-300">
        <Link
          to="/"
          className="hover:text-white transition-colors"
        >
          Home
        </Link>
      </nav>
    </header>
  );
}
