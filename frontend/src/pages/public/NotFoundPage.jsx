import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">
        Không tìm thấy trang
      </h1>
      <p className="mt-3 text-slate-600">
        Đường dẫn này chưa được cấu hình trong ứng dụng.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
      >
        Về trang chủ
      </Link>
    </section>
  )
}
