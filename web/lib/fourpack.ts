import type { GateId, VideoType } from "@/lib/types";
import { recommendedFor, styleById } from "@/lib/styles";

export interface FourPack {
  structureId: string;
  playbookRef: string;
  styleCandidates: { id: string; name: string }[];
  gates: GateId[];
  qaRules: string[];
  vo: boolean;
}

// 推荐风格候选（仅作"标推荐"用；用户仍可选 11 个里的任意一个，store 不再校验）。
function recommendedCandidates(videoType: VideoType): { id: string; name: string }[] {
  return recommendedFor(videoType).map((id) => ({
    id,
    name: styleById(id)?.name ?? id,
  }));
}

// 四件套：按 videoType 解析「结构 / playbook / 风格候选 / 闸门 / 质检规则 / 是否配音」。
// POC：structureId / playbookRef 给合理占位字符串即可。
export function resolveFourpack(videoType: VideoType): FourPack {
  switch (videoType) {
    case "showreel":
      return {
        structureId: "structure.showreel.hook-proof-cta",
        playbookRef: "playbook/showreel.v1",
        styleCandidates: recommendedCandidates("showreel"),
        gates: ["concept", "storyboard", "chunk", "final"],
        qaRules: [
          "首镜 3 秒内给出钩子",
          "每镜单一信息点，画面不堆叠",
          "节奏紧凑，避免冗长过渡",
          "结尾有明确 CTA",
        ],
        vo: false,
      };
    case "popsci":
      return {
        structureId: "structure.popsci.question-explain-payoff",
        playbookRef: "playbook/popsci.v1",
        styleCandidates: recommendedCandidates("popsci"),
        gates: ["concept", "script", "storyboard", "chunk", "final"],
        qaRules: [
          "用一个真实问题开场",
          "概念先打比方再上术语",
          "讲稿口语化，单句不超过 25 字",
          "结尾收束到一个记忆点",
        ],
        vo: true,
      };
    case "teaching":
      return {
        structureId: "structure.teaching.goal-steps-recap",
        playbookRef: "playbook/teaching.v1",
        styleCandidates: recommendedCandidates("teaching"),
        gates: ["concept", "script", "storyboard", "chunk", "final"],
        qaRules: [
          "开场明确本节学习目标",
          "步骤可操作、可复现",
          "讲稿配合屏幕动作分步推进",
          "结尾复盘要点并给练习",
        ],
        vo: true,
      };
    default: {
      // 穷尽 union，TS 兜底
      const _exhaustive: never = videoType;
      throw new Error(`未知 videoType: ${String(_exhaustive)}`);
    }
  }
}
