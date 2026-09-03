import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import bookData from '../data/book.json'
import { seedDatabase, type BookData } from './db/seed'
import { syncProgressState } from './lib/gamification'
import { db, DEFAULT_PROGRESS, DEFAULT_SETTINGS } from './db/schema'
import { useSyncGuard } from './hooks/useSyncGuard'
import './index.css'
import { registerServiceWorker } from './pwa'

function AppWithSyncGuard() {
  useSyncGuard()
  return <App />
}

async function ensureDbInitialized(): Promise<void> {
  const settings = await db.settings.get('main')
  if (!settings) {
    await db.settings.put({ ...DEFAULT_SETTINGS })
  } else {
    await db.settings.put({ ...DEFAULT_SETTINGS, ...settings, id: 'main' })
  }
  const progress = await db.progress.get('main')
  if (!progress) {
    await db.progress.put({ ...DEFAULT_PROGRESS })
  }
}

async function bootstrap() {
  registerServiceWorker()
  await ensureDbInitialized()
  await seedDatabase(bookData as BookData)
  await syncProgressState()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AppWithSyncGuard />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
