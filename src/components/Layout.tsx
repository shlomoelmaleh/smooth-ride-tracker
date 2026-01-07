
import { ReactNode } from 'react';
import Header from './Header';

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
      <footer className="text-center text-xs text-muted-foreground py-4">
        <p>SmartRide &copy; {new Date().getFullYear()} | Privacy Focused Ride Tracking | v0.2.3</p>
      </footer>
    </div>
  );
};

export default Layout;
