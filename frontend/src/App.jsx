import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout.jsx'
import Spinner from './components/ui/Spinner.jsx'

const BooksPage         = lazy(() => import('./pages/BooksPage.jsx'))
const AuthorsPage       = lazy(() => import('./pages/AuthorsPage.jsx'))
const AuthorProfilePage = lazy(() => import('./pages/AuthorProfilePage.jsx'))
const SeriesPage        = lazy(() => import('./pages/SeriesPage.jsx'))
const DiscoverPage      = lazy(() => import('./pages/DiscoverPage.jsx'))
const DashboardPage     = lazy(() => import('./pages/DashboardPage.jsx'))
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage.jsx'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Spinner size={32} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/books" replace />} />
          <Route path="books" element={<Suspense fallback={<PageFallback />}><BooksPage /></Suspense>} />
          <Route path="authors" element={<Suspense fallback={<PageFallback />}><AuthorsPage /></Suspense>} />
          <Route path="authors/:id" element={<Suspense fallback={<PageFallback />}><AuthorProfilePage /></Suspense>} />
          <Route path="series" element={<Suspense fallback={<PageFallback />}><SeriesPage /></Suspense>} />
          <Route path="discover" element={<Suspense fallback={<PageFallback />}><DiscoverPage /></Suspense>} />
          <Route path="dashboard" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
