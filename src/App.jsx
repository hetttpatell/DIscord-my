import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/Tooltip';
import LobbyPage from './routes/LobbyPage';
import RoomPage from './routes/RoomPage';
import { MicDebugPanel } from './components/MicDebugPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<LobbyPage />} />
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
            <MicDebugPanel />
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster
          position="top-center"
          theme="dark"
          closeButton
          richColors
          swipeDirections={['top', 'right', 'left', 'bottom']}
          duration={3500}
          gap={10}
          visibleToasts={3}
          toastOptions={{
            duration: 3500,
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
