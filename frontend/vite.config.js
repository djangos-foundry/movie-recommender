import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // FullCalendar's packages register view classes by reference at import time;
    // if Vite pre-bundles them into separate chunks each ends up with its own
    // copy of @fullcalendar/core, and the registry check on the duplicated
    // classes throws "Class constructor ... cannot be invoked without 'new'".
    // Excluding them keeps FullCalendar's own ESM as the single source. See
    // https://fullcalendar.io/docs/vite
    exclude: [
      '@fullcalendar/core',
      '@fullcalendar/react',
      '@fullcalendar/daygrid',
      '@fullcalendar/timegrid',
      '@fullcalendar/interaction',
    ],
  },
})
