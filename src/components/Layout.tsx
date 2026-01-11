
import { ReactNode } from 'react';
import Header from './Header';
import pkg from '../../package.json';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-16 pb-6">
        <div className="container max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>
      <footer className="text-center text-xs text-muted-foreground py-4 space-y-1">
        <p>SmartRide &copy; {new Date().getFullYear()} | Privacy Focused Ride Tracking | v{pkg.version}</p>
        <p className="opacity-50 font-mono text-[9px]">Build: {new Date('2026-01-11T20:10:00+02:00').toISOString()}</p>
      </footer>
    </div>
  );
};

export default Layout;
