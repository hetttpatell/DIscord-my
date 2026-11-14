import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/Tooltip';
import LobbyPage from './routes/LobbyPage';
import RoomPage from './routes/RoomPage';

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
          <Routes>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: '#1C1C24',
              color: '#F4F1EA',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
