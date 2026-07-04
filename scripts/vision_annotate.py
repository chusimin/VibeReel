#!/usr/bin/env python3
"""
批量给视频帧打视觉标签（调 OpenRouter 视觉模型）。
用法：
  OPENROUTER_API_KEY=xxx python3 vision_annotate.py <frames_dir> <out_json> [--model MODEL] [--mode MODE]

mode:
  sparse: 每帧独立打标（用于稀疏 1fps 帧）
  dense:  把连续 8 帧拼成一张网格，让模型判断"这一小段(1.6s)在做什么动作"
  pairs:  两两一组，判断转场类型
"""
import os, sys, json, base64, time, argparse, subprocess
from pathlib import Path
import urllib.request, urllib.error

def b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode()

def call_or(prompt, images, model="google/gemini-2.5-flash", key=None):
    key = key or os.environ["OPENROUTER_API_KEY"]
    content = [{"type": "text", "text": prompt}]
    for img in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64(img)}"}
        })
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1200,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://vibereel.local",
            "X-Title": "VibeReel Reference Analysis",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode()[:500]}"}
    if "choices" not in data:
        return {"error": data}
    return {
        "text": data["choices"][0]["message"]["content"],
        "usage": data.get("usage", {})
    }

def make_grid(frames, out_path, cols=4):
    """用 ImageMagick 把多帧拼成网格图。"""
    tmp_labeled = []
    for i, f in enumerate(frames):
        labeled = f"{out_path}.tmp{i}.jpg"
        # 加时间标注（每帧对应秒数根据文件名）
        subprocess.run([
            "magick", str(f),
            "-resize", "320x180",
            "-fill", "yellow",
            "-undercolor", "black",
            "-gravity", "NorthWest",
            "-pointsize", "22",
            "-font", "/System/Library/Fonts/Geneva.ttf",
            "-annotate", "+5+5", f" {i+1} ",
            labeled
        ], check=True)
        tmp_labeled.append(labeled)
    r = subprocess.run(["magick", "montage"] + tmp_labeled + [
        "-tile", f"{cols}x", "-geometry", "+2+2",
        "-background", "black", "-label", "", out_path
    ], capture_output=True)
    if not Path(out_path).exists():
        raise RuntimeError(f"montage failed: {r.stderr.decode()[:500]}")
    for t in tmp_labeled:
        os.unlink(t)

SPARSE_PROMPT = """你是 motion graphics 分析师。这是一条 showreel 参考视频里第 {sec} 秒的一帧。

请严格按 JSON 输出以下字段（不要 markdown、不要解释）：
{{
  "描述": "画面在展示什么（一句中文，20 字内）",
  "主要元素": ["名词1","名词2"],
  "构图": "居中/三分/满屏/负空间大 之一",
  "色彩": "主色调（比如 '暖橙+米白'）",
  "文字": "画面上有的文字（没有就 ''）",
  "视觉密度": "极简/中/密 之一",
  "关键点": "这一帧最抓眼的一处"
}}"""

DENSE_PROMPT = """你是 motion graphics 分析师。下面是 showreel 参考视频里**连续 {n} 帧**（间隔 0.2 秒），左上角编号是第几帧。这段 {duration:.1f} 秒的画面里正在发生什么？

严格按 JSON 输出（不要 markdown、不要解释）：
{{
  "起始秒": {start_sec},
  "时长秒": {duration},
  "动作": "这段时间里画面发生的主要动作（一句中文，30 字内，动词开头）",
  "动效动词": ["scale","slide","mask","typewriter"里的组合，或其他],
  "构图变化": "构图是否变化（不变/推近/拉远/移动/剧变）",
  "色彩变化": "色彩是否变化（不变/明变暗/暗变明/换色）",
  "文字动作": "文字是否在动（无文字/静止/入场/出场/变形）",
  "转场发生": true/false,
  "转场类型": "如果发生了转场，是什么类型（硬切/交叉/mask reveal/形变/擦除/无）",
  "情绪": "克制/激昂/神秘/温暖/紧张 之一",
  "关键洞察": "这段的独到之处（30 字内）"
}}"""

def run_sparse(frames_dir, out_json, model, fps=1.0):
    frames = sorted(Path(frames_dir).glob("s_*.jpg"))
    print(f"[sparse] {len(frames)} frames from {frames_dir}")
    results = []
    for i, f in enumerate(frames):
        sec = int(f.stem.split("_")[1])
        print(f"  frame {i+1}/{len(frames)} @ {sec}s ... ", end="", flush=True)
        t0 = time.time()
        r = call_or(SPARSE_PROMPT.format(sec=sec), [str(f)], model=model)
        dt = time.time() - t0
        if "error" in r:
            print(f"ERR {r['error'][:100]}")
            results.append({"sec": sec, "error": r["error"]})
            continue
        try:
            txt = r["text"].strip()
            if txt.startswith("```"):
                txt = txt.split("```")[1].lstrip("json").strip()
            parsed = json.loads(txt)
        except Exception as e:
            parsed = {"raw": r["text"], "parse_error": str(e)}
        parsed["sec"] = sec
        parsed["_ms"] = int(dt * 1000)
        parsed["_tokens"] = r.get("usage", {})
        results.append(parsed)
        print(f"ok ({dt:.1f}s, {r.get('usage',{}).get('total_tokens','?')} tok)")
    Path(out_json).write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"[sparse] saved → {out_json}")
    return results

def run_dense(frames_dir, out_json, model, chunk=8, fps=5.0):
    frames = sorted(Path(frames_dir).glob("f_*.jpg"))
    print(f"[dense] {len(frames)} frames, chunking every {chunk} frames ({chunk/fps:.1f}s each)")
    results = []
    tmp_dir = Path(frames_dir).parent / "_tmp_grids"
    tmp_dir.mkdir(exist_ok=True)
    for i in range(0, len(frames), chunk):
        batch = frames[i:i+chunk]
        if len(batch) < 2:
            continue
        start_sec = i / fps
        duration = len(batch) / fps
        grid_path = tmp_dir / f"grid_{i:03d}.jpg"
        make_grid([str(b) for b in batch], str(grid_path), cols=4)
        print(f"  chunk {i//chunk+1} ({start_sec:.1f}s–{start_sec+duration:.1f}s) ... ", end="", flush=True)
        t0 = time.time()
        r = call_or(
            DENSE_PROMPT.format(n=len(batch), duration=duration, start_sec=start_sec),
            [str(grid_path)],
            model=model
        )
        dt = time.time() - t0
        if "error" in r:
            print(f"ERR {r['error'][:150]}")
            results.append({"start_sec": start_sec, "error": r["error"]})
            continue
        try:
            txt = r["text"].strip()
            if txt.startswith("```"):
                txt = txt.split("```")[1].lstrip("json").strip()
            parsed = json.loads(txt)
        except Exception as e:
            parsed = {"raw": r["text"], "parse_error": str(e), "start_sec": start_sec}
        parsed["_ms"] = int(dt * 1000)
        parsed["_tokens"] = r.get("usage", {})
        results.append(parsed)
        print(f"ok ({dt:.1f}s, {r.get('usage',{}).get('total_tokens','?')} tok)")
    Path(out_json).write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"[dense] saved → {out_json}")
    return results

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("out_json")
    ap.add_argument("--model", default="google/gemini-2.5-flash")
    ap.add_argument("--mode", choices=["sparse","dense"], default="dense")
    ap.add_argument("--chunk", type=int, default=8)
    ap.add_argument("--fps", type=float, default=5.0)
    args = ap.parse_args()
    if args.mode == "sparse":
        run_sparse(args.frames_dir, args.out_json, args.model)
    else:
        run_dense(args.frames_dir, args.out_json, args.model, chunk=args.chunk, fps=args.fps)
