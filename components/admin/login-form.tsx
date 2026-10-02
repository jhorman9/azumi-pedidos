"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppReady, useAzumi } from "@/components/azumi-provider";
import { Brand, Button, Field, Notice } from "@/components/ui";

function LoginForm() {
  const { snapshot, busy, run, login } = useAzumi(), router = useRouter();
  const [email, setEmail] = useState(snapshot?.development ? "admin@azumi.demo" : ""), [password, setPassword] = useState("");
  return <main className="admin-login card"><Brand admin /><h1>Bienvenido de nuevo.</h1><p className="muted">Gestiona pedidos y conecta con tus clientes.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { await login(email, password); router.replace("/admin"); router.refresh(); }); }}><Field label="Correo" type="email" autoComplete="username" required maxLength={150} value={email} onChange={e => setEmail(e.target.value)} /><Field label="Contraseña" type="password" autoComplete="current-password" required maxLength={200} value={password} onChange={e => setPassword(e.target.value)} /><Button type="submit" disabled={busy}>{busy ? "Verificando…" : "Entrar al dashboard"}</Button></form>{snapshot?.development && <Notice>Acceso local: admin@azumi.demo / azumi123.</Notice>}<Link href="/" className="back">← Volver al restaurante</Link></main>;
}
export function LoginScreen() { return <AppReady><LoginForm /></AppReady>; }
