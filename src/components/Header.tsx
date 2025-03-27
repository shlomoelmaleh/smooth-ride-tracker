
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const Header: React.FC = () => {
  const location = useLocation();
  
  return (
    <header className="w-full fixed top-0 z-50 glass-panel px-4 py-3 animate-fade-in">
      <div className="container flex justify-between items-center mx-auto max-w-screen-xl">
        <Link to="/" className="flex items-center">
          <h1 className="text-xl font-medium">
            <span className="text-primary font-semibold">Smart</span>Ride
          </h1>
        </Link>
        
        <nav className="hidden sm:flex space-x-1">
          <NavLink to="/" currentPath={location.pathname}>
            Home
          </NavLink>
          <NavLink to="/stats" currentPath={location.pathname}>
            Stats
          </NavLink>
          <NavLink to="/history" currentPath={location.pathname}>
            History
          </NavLink>
        </nav>
        
        <nav className="flex sm:hidden">
          <div className="flex space-x-4">
            <MobileNavLink to="/" currentPath={location.pathname} label="Home" />
            <MobileNavLink to="/stats" currentPath={location.pathname} label="Stats" />
            <MobileNavLink to="/history" currentPath={location.pathname} label="History" />
          </div>
        </nav>
      </div>
    </header>
  );
};

interface NavLinkProps {
  to: string;
  currentPath: string;
  children: React.ReactNode;
}

const NavLink: React.FC<NavLinkProps> = ({ to, currentPath, children }) => {
  const isActive = currentPath === to;
  
  return (
    <Link
      to={to}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
        isActive 
          ? "bg-primary text-white shadow-soft"
          : "hover:bg-secondary text-foreground/80 hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
};

interface MobileNavLinkProps {
  to: string;
  currentPath: string;
  label: string;
}

const MobileNavLink: React.FC<MobileNavLinkProps> = ({ to, currentPath, label }) => {
  const isActive = currentPath === to;
  
  return (
    <Link
      to={to}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
        isActive 
          ? "bg-primary text-white shadow-soft"
          : "hover:bg-secondary text-foreground/80 hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
};

export default Header;
