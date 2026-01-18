import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Graph from './pages/Graph';
import Scrape from './pages/Scrape';
import Camps from './pages/Camps';
import CampDetail from './pages/CampDetail';
import Topic from './pages/Topic';
import Tweets from './pages/Tweets';
import ReportDetail from './pages/ReportDetail';

const queryClient = new QueryClient();

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={`h-8 px-2.5 text-sm rounded-md inline-flex items-center transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {children}
    </Link>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-1">
          <Link to="/" className="text-lg font-semibold text-foreground mr-4">
            OpenCCP
          </Link>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/tweets">Tweets</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/camps">Camps</NavLink>
          <NavLink to="/topic">Topic</NavLink>
          <NavLink to="/graph">Graph</NavLink>
          <NavLink to="/scrape">Scrape</NavLink>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-4">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tweets" element={<Tweets />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/:username" element={<AccountDetail />} />
            <Route path="/camps" element={<Camps />} />
            <Route path="/camps/:id" element={<CampDetail />} />
            <Route path="/topic" element={<Topic />} />
            <Route path="/reports/:id" element={<ReportDetail />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/scrape" element={<Scrape />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
