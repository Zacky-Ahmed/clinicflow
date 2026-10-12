export default function Home() {
  return <main>
    <p className="eyebrow">CLINICFLOW · DEVELOPMENT</p>
    <h1>A calmer clinic day<br />starts here.</h1>
    <p>The appointment backend supports MongoDB persistence and smart scheduling. The receptionist interface is the next phase.</p>
    <aside>Fictional information only. Check service readiness to verify the active database connection.</aside>
    <nav><a href="/api/clinic">Clinic configuration →</a><a href="/api/health">Service health →</a></nav>
  </main>;
}
