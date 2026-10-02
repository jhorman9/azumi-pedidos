import Link from "next/link";

export default function NotFound() {
  return <main className="loading-screen"><span className="eyebrow">404</span><h1>Este camino no está en el menú.</h1><Link className="button secondary" href="/">Volver a Azumi</Link></main>;
}
