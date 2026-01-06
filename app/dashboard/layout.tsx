export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      {children}
    </main>
  );
}
