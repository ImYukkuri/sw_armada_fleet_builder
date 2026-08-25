# Armada 士官 PDF 字体、图标与 HTML 使用说明

## 结论

这个 PDF 没有使用特殊符号字库做图标转义。

- 文档共有 56 页，由 PowerPoint 2010 导出。
- PDF 只有微软雅黑常规、微软雅黑粗体和黑体三个嵌入字体程序；PDF 内以 Type0/TrueType 资源形式出现，总计 6 个字体资源。
- 规则文字里的符号是独立的微型图片 XObject，不是字体字形。
- 共发现 26 个小图片对象、29 次绘制调用，语义去重后是 12 类图标。
- 图标没有 `/Alt` 或 `/ActualText`，所以普通文本提取无法知道图片代表什么。
- 图片被文本提取器跳过后，原位置通常剩下 4 个 ASCII 空格。这是现有 JSON 中大量 `    中队`、`    集火` 等字符串的来源。
- 第 40 页“韦奇·安蒂列斯”在“中队指令标记”前有四空格占位，但 PDF 本身漏掉了图片对象。这里的转义规则会把图标补回来。

因此，不建议继续寻找或导出所谓“特殊字体”。稳定方案是把空格占位固化成显式 token，再由 HTML 渲染器插入图标。

## 转义规则

只处理“4 个 ASCII 空格（可跨一个 PDF 排版换行）+ 已知标签”。不要全局替换所有连续空格。

| PDF 提取标记 | 固化 token | 含义 |
|---|---|---|
| `    中队` | `[[icon:command-squadron]]中队` | 中队指令 |
| `    集火` | `[[icon:command-concentrate-fire]]集火` | 集火指令 |
| `    维修` | `[[icon:command-repair]]维修` | 维修指令 |
| `    导航` | `[[icon:command-navigate]]导航` | 导航指令 |
| `    任意` | `[[icon:command-any]]任意` | 任意指令 |
| `    回避` | `[[icon:defense-evade]]回避` | 回避防御标记 |
| `    防控` | `[[icon:defense-contain]]防控` | 防控防御标记 |
| `    传导` | `[[icon:defense-redirect]]传导` | 传导防御标记 |
| `    指挥官` | `[[icon:upgrade-commander]]指挥官` | 指挥官升级 |
| `    士官` | `[[icon:upgrade-officer]]士官` | 士官升级 |
| `    防御改装` | `[[icon:upgrade-defensive-retrofit]]防御改装` | 防御改装升级 |
| `    暴击` | `[[icon:attack-critical]]暴击` | 暴击标志 |

完整来源页、PDF 对象号和文件路径见 `icon-map.json`。

## 文件说明

- `icons/original/`：从 PDF 选出的 12 个语义去重原始像素版本。
- `icons/web/`：去除浅色背景、统一为 64×64 透明 PNG 的网页版本。
- `icon-map.json`：转义 token、中文标签、来源页及对象号。
- `armada-icons.css`：行内图标和规则文字样式。
- `armada-icons.js`：空格占位固化、token 解析和安全 DOM 渲染。
- `demo.html`：可直接双击打开的完整示例。
- `extract_icons.py`：从原 PDF 重新生成两套图标的脚本。

## 在自己的 HTML 页面中使用

先复制 `icons/web/`、`armada-icons.css` 和 `armada-icons.js`，并保持相对目录结构：

```html
<link rel="stylesheet" href="armada-icons.css">

<div id="card-text" class="armada-rules-text"></div>

<script src="armada-icons.js"></script>
<script>
  const content = "    中队：被你激活的中队即使交战中也可以移动。";
  ArmadaIcons.render(document.querySelector("#card-text"), content);
</script>
```

`render()` 默认先把 PDF 的四空格占位转换成 token，然后用 `<img>` 节点渲染。它不把外部字符串直接赋给 `innerHTML`，因此适合处理 JSON 中的卡牌文本。

如果数据库已经完成固化，可以直接储存：

```json
{
  "content": "[[icon:command-squadron]]中队：被你激活的中队即使交战中也可以移动。"
}
```

然后关闭旧占位转换：

```js
ArmadaIcons.render(element, card.content, {solidifyPdfMarkers: false});
```

## 重新提取图标

需要 Python、`pypdf` 和 Pillow：

```bash
python3 extract_icons.py "/path/to/星球大战：无敌舰队 04士官升级中文卡牌v0.2.pdf"
```

PDF 中的原图只有约 11-21 像素。网页版本适合以约 `1em` 的正文尺寸显示，不适合作为大图或高倍缩放素材。
