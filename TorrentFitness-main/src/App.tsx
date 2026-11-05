import React, { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PdfDownloadProvider } from './context/PdfDownloadContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { GymLogo } from './components/common/GymLogo';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Dynamic lazy imports to prevent blocking main thread on initial login
const ClientApp = lazy(() =>
  import('./components/client/ClientApp').then((m) => ({ default: m.ClientApp }))
);
const TrainerApp = lazy(() =>
  import('./components/trainer/TrainerApp').then((m) => ({ default: m.TrainerApp }))
);
const AdminApp = lazy(() =>
  import('./components/admin/AdminApp').then((m) => ({ default: m.AdminApp }))
);

const PortalLoader: React.FC<{ label?: string }> = ({
  label = 'Loading Torrent Fitness Portal...'
}) => (
  <div className="min-h-screen bg-[#EEF2F6] flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
    <div className="ambient-orb w-80 h-80 bg-indigo-400/20 -top-10 -right-10" />
    <div className="ambient-orb w-80 h-80 bg-sky-400/15 -bottom-10 -left-10" />
    <div className="relative z-10 flex flex-col items-center">
      <div className="mb-4 animate-pulse">
        <GymLogo size="xl" showGlow />
      </div>
      <h1 className="text-xl font-black text-slate-900 tracking-tight">TORRENT FITNESS</h1>
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500 mt-1">
        BE MORE DO MORE
      </p>
      <p className="text-xs text-indigo-600 mt-2 font-mono tracking-wider font-bold">{label}</p>
    </div>
  </div>
);

const MainRouter: React.FC = () => {
  const { currentUser, isBooting } = useAuth();

  if (isBooting) {
    return <PortalLoader label="Securing Cloud Connection..." />;
  }

  // Not logged in: Show Auth Screen directly without loading heavy portal bundles
  if (!currentUser) {
    return <AuthScreen />;
  }

  // Role-based dynamic rendering with Suspense
  // Client: Mobile-first desktop frame
  if (currentUser.role === 'client') {
    return (
      <div className="client-portal-desktop-canvas">
        <div className="client-portal-frame">
          <Suspense fallback={<PortalLoader label="Opening Member Experience..." />}>
            <ClientApp />
          </Suspense>
        </div>
      </div>
    );
  }

  // Trainer & Admin Portals: Full-width, unconstrained desktop responsive layout
  return (
    <Suspense fallback={<PortalLoader label="Loading Workspace..." />}>
      {currentUser.role === 'trainer' && <TrainerApp />}
      {currentUser.role === 'admin' && <AdminApp />}
    </Suspense>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PdfDownloadProvider>
          <MainRouter />
        </PdfDownloadProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
