export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="shell">
      <div className="notice" role="status">
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
    </main>
  );
}
