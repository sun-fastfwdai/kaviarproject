export function PageSkeleton() {
  return (
    <>
      <header className="bar"><div className="skel" style={{ width: 180, height: 12 }} /></header>
      <div className="col g16" style={{ padding: "22px 24px" }}>
        <div className="skel" style={{ width: 220, height: 28 }} />
        <div className="skel" style={{ width: 360, height: 12 }} />
        <div className="skel" style={{ height: 86, borderRadius: 12 }} />
        <div className="skel" style={{ height: 220, borderRadius: 12 }} />
        <div className="row g16"><div className="skel fill" style={{ height: 180, borderRadius: 12 }} /><div className="skel fill" style={{ height: 180, borderRadius: 12 }} /></div>
      </div>
    </>
  );
}
