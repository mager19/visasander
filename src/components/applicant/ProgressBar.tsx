export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div>
      <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del formulario">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="eyebrow" style={{ margin: '6px 0 0' }}>{percent}% completado</p>
    </div>
  );
}
