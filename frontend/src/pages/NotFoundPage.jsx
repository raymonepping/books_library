import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <p className="font-serif text-blood text-6xl font-bold mb-4">404</p>
      <p className="font-serif text-ice/60 text-xl mb-2">Page not found</p>
      <p className="text-ice/30 text-sm mb-8">The page you are looking for does not exist.</p>
      <Link
        to="/books"
        className="text-amber hover:text-amber-dim text-sm underline underline-offset-4 transition-colors"
      >
        Back to library
      </Link>
    </div>
  )
}
