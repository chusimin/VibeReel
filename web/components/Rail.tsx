"use client";

import { railFor, railIndex } from "@/app/_ui";
import type { Stage, VideoType } from "@/lib/types";

// 公共骨架 rail（移植原型 vRail）。当前关高亮、已过打勾。
export default function Rail({
  stage,
  videoType,
}: {
  stage: Stage;
  videoType: VideoType;
}) {
  const steps = railFor(videoType);
  const cur = railIndex(stage, videoType);
  return (
    <div className="rail">
      {steps.map((s, idx) => {
        const cls = idx < cur ? "done" : idx === cur ? "cur" : "";
        return (
          <span key={s.k} style={{ display: "contents" }}>
            <div className={`step ${cls}`}>
              <span className="num">{idx < cur ? "✓" : idx + 1}</span>
              {s.l}
            </div>
            {idx < steps.length - 1 ? (
              <span className={`bar ${idx < cur ? "done" : ""}`}></span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
