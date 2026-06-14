// 统一状态徽标：圆点 + 文案（永不靠颜色单独承载语义）。design/DESIGN.md §6.
// cls ∈ pending | progress | review | ok | err
export default function Status({
  cls,
  label,
  ring,
  pct,
}: {
  cls: string;
  label: string;
  ring?: boolean; // 渲染中转圈
  pct?: number; // 渲染百分比
}) {
  return (
    <span className={`status ${cls}`}>
      {ring ? <span className="ring" /> : <span className="d" />}
      {label}
      {typeof pct === "number" ? <span className="mono" style={{ marginLeft: 4 }}>{pct}%</span> : null}
    </span>
  );
}
