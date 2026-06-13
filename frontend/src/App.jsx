import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout.jsx'
import BooksPage from './pages/BooksPage.jsx'
import AuthorsPage from './pages/AuthorsPage.jsx'
import AuthorProfilePage from './pages/AuthorProfilePage.jsx'
import SeriesPage from './pages/SeriesPage.jsx'
import DiscoverPage from './pages/DiscoverPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/books" replace />} />
          <Route path="books" element={<BooksPage />} />
          <Route path="authors" element={<AuthorsPage />} />
          <Route path="authors/:id" element={<AuthorProfilePage />} />
          <Route path="series" element={<SeriesPage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
