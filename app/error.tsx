"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="loading-screen"><h1>No pudimos cargar esta página</h1><p>Intenta nuevamente para continuar.</p><button className="button" onClick={reset}>Reintentar</button></section>;
}
