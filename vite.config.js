import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.BACKEND_URL || env.VITE_BACKEND_URL || process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || '';

  return {
    plugins: [
      react(),
      tailwindcss()
    ],
    define: {
      'import.meta.env.BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl)
    },
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
})

