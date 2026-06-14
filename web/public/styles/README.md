# 风格主图

把每个风格的主图（展示这个风格长什么样的一张代表图）放在这里，命名为 `<风格id>.png`，
新建项目「选风格」步骤的卡片会自动显示它；没有图时显示该风格色板渐变的「主图待上传」占位。

风格 id 见 `web/lib/styles.ts`，共 11 个：

```
editorial-saas.png        克制编辑感 SaaS
apple-keynote-light.png   明亮 Keynote
apple-keynote.png         深色 Keynote
alibaba-premium.png       阿里高级感
kinetic-type.png          动感大字幕
deep-space-diagram.png    深空图解
minimal-ink.png           净白极简
cool-mono.png             冷感工程
bento.png                 Bento 便当格
editorial-serif.png       书卷精装
duoji-pixel.png           多吉像素
```

建议尺寸 16:9（如 640×360 或更高），png/jpg 均可（卡片用 `/styles/<id>.png` 引用，
若用 jpg 请改 `web/app/new/page.tsx` 里 `StyleThumb` 的扩展名，或直接存成 png）。
