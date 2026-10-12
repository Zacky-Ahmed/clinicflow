export default function Home() {
  return <main>
    <p className="eyebrow">CLINICFLOW · DEVELOPMENT</p>
    <h1>A calmer clinic day<br />starts here.</h1>
    <p>The appointment backend is ready for development. The receptionist interface and MongoDB persistence are the next phases.</p>
    <aside>Fictional information only. Development data is temporary and resets when the server restarts.</aside>
    <nav><a href="/api/clinic">Clinic configuration →</a><a href="/api/health">Service health →</a></nav>
  </main>;
}
