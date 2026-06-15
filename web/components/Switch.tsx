// 开关。design/DESIGN.md §7。可交互或只读（readonly 时不响应点击，仅展示状态）。
export default function Switch({
  on,
  onChange,
  readonly,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  readonly?: boolean;
}) {
  return (
    <span
      className={`switch ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      style={readonly ? { opacity: 0.7, cursor: "default" } : undefined}
      onClick={readonly ? undefined : () => onChange?.(!on)}
    >
      <i />
    </span>
  );
}
