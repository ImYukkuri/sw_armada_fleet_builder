增量开发需求：Commander / Title / Modification
在当前已经完成的 Fleet Builder 基础上继续开发。

不要重新设计现有数据结构，不要重构已经完成的 Card Database、Selector 或 Fleet Overview。

本次只针对以下需求做增量修改：

1. Commander
2. Title
3. Unique
4. Modification

优先复用现有组件、CSS、数据结构和选择器。

如果当前 JSON 已经存在对应字段，则在现有字段基础上扩展，不要重复创建同义字段。
1. Commander

全舰队最多只能有一个 Commander。

Commander 是 Fleet 层级的数据，而不是某艘船普通 Upgrade Slot 中的数据。

当前没有 Commander 时：

舰船仍然可以显示 Commander 选择入口。
点击后进入现有 Upgrade Selector，但只显示合法 Commander。
选择 Commander 后，Commander 保存到 Fleet 状态。
选择完成后，其他所有舰船的 Commander 选择入口都隐藏。
删除 Commander 后，所有舰船重新显示 Commander 入口。

Fleet 状态应保持类似：

fleet.commander = null

或者使用当前项目已有的等价结构，不要为了这一条需求重构 Fleet State。

Commander 展示

选择 Commander 后，在 Fleet Overview 顶部、总点数附近的上方中间区域显示 Commander。

视觉重点使用 Commander 卡图的上半部分主体区域，而不是把整张卡缩小成普通卡牌缩略图。

大致：

             398 / 400 pts

             [Commander]
             [人物主体图]
             [人物主体图]

            大莫夫·塔金

点击 Commander 图片可以复用现有卡牌预览逻辑，查看完整卡图。

不要为 Commander 创建新的图片预览系统。

2. Title

每艘舰船的 Title 永远放在该舰船升级区域的最后。

顺序：

舰船本体
↓
普通升级槽
↓
Modification
↓
Title

例如：

Arquitens Command Cruiser

[Officer]
[Support Team]
[Defensive Retrofit]
[Turbolasers]

Modification
[＋选择改装]

Title
[＋选择称号]

Title 不属于普通 Upgrade Slot。

每艘舰船最多装备一个 Title。

3. Title 的 Unique

检查当前 Title JSON。

如果现在没有办法判断某个 Title 是否 Unique：

参考之前已经完成的 research 文档/资料。
不要凭名字猜测。
为所有 Title 补充明确的：
"unique": true

或：

"unique": false

不要保留 null / 缺失状态。

Title Selector 中：

unique = true

的 Title，如果已经出现在当前 Fleet 的其他舰船上，则不能再次选择。

注意：

Unique 判断必须是 Fleet-level，而不是当前舰船级。

例如：

Ship A
└─ Title X

Ship B
└─ Title X

如果 Title X 是 Unique，则 Ship B 不能选择。

同时，这个规则最好不要只写成 Title 专用逻辑。Armada 的 Unique 实际是跨卡牌类型的 Fleet 限制，同名 Unique 卡不能在同一 Fleet 重复出现。

因此如果当前项目已经有通用 Unique 判断函数，Title 应该接入这个函数，而不是再造一个 Title-only 版本。

4. Modification

检查当前升级卡 JSON 和中文效果。

如果某张升级卡属于 Modification：

"modification": true

否则：

"modification": false

不要在运行时通过：

effect.includes("改装")

判断。

这是数据字段，不是 UI 文本解析规则。

5. 中文效果文本处理

对于已经确认属于 Modification 的升级卡：

如果中文效果开头/标签位置存在：

改装

则把这个作为卡牌类别的文字从效果描述中移除。

例如：

改装：当你攻击时……

改成：

当你攻击时……

但是不要简单：

effect.replaceAll("改装", "")

因为正文里可能出现具有正常语义的“改装”。

只处理作为卡牌类型/标签的那一个“改装”。

6. Selector 中显示 Modification

当前升级选择页面已经存在：

sel-meta

将：

modification === true

的卡在 sel-meta 中显示：

改装

例如：

中文名
English Name

[改装]  8 pts

中文效果……

这样“改装”从正文移动到了卡牌 metadata 区域。

7. Modification Slot

每艘舰船最多只能装备一个 Modification。

因此舰船状态增加/使用现有对应字段：

ship.modification = null

装备后：

ship.modification = cardId

如果当前舰船已经有 Modification：

Modification
└─ 已装备卡

则不再显示：

＋选择改装

并且再次打开 Modification Selector 时，不允许选择其他 Modification。

删除后恢复选择。

8. Modification 与普通 Upgrade Selector 分离

这是本次实现中需要特别注意的一点：

普通 Upgrade Selector
→ 不显示 modification === true 的卡

Modification Selector
→ 只显示 modification === true 的卡

不要因为某张 Modification 同时属于 Officer / Weapons Team / Ordnance 等类型，就让它进入普通 Upgrade Slot。

Modification 是一个独立装备限制。

规则本身也是“每艘船不能装备超过一个带 Modification trait 的升级”，而不是一个普通 Upgrade Slot。

9. 修改舰船 UI

每艘舰船最终按照：

舰船本体
│
├─ 普通 Upgrade Slots
│
├─ Modification
│
└─ Title

显示。

其中：

普通 Upgrade 使用现有 Upgrade Slot UI。
Modification 使用独立的一行。
Title 使用独立的一行。
Modification 和 Title 都要保持明显的从属关系，不要与舰船本体处于同一级视觉权重。

尽量复用现有 sel-meta、卡牌条目、选择器和预览组件。

10. 本次不要扩展

不要在本次任务里继续开发：

完整 Fleet 合法性检查
Squadron 上限
Unique Squadron
Commander 与其他角色的跨类型 Unique 冲突
Tournament Rules
导入导出
保存
LocalStorage
新的数据管理页面

只完成本需求涉及的规则和 UI。

如果实现过程中发现现有数据结构确实无法支持上述功能，优先做最小字段扩展，并先保持现有结构兼容，不要整体重构。

验收

完成后测试：

Commander
✓ Fleet 没有 Commander → 所有舰船显示入口
✓ 选择 Commander → Fleet 顶部显示 Commander
✓ 选择 Commander → 其他舰船 Commander 入口消失
✓ 删除 Commander → 入口恢复
✓ 点击 Commander → 查看完整大图
Title
✓ Title 永远显示在舰船装备区域最后
✓ 每艘船最多一个 Title
✓ Unique Title 在其他舰船上不可再次选择
✓ 删除 Unique Title 后恢复选择
Modification
✓ Modification 卡 JSON 有 modification 字段
✓ Modification 标签显示在 sel-meta
✓ 正文不再重复显示“改装”标签
✓ 每艘船最多一个 Modification
✓ 已装备 Modification 后其他 Modification 不可选择
✓ 普通 Upgrade Selector 不显示 Modification
✓ 删除后恢复选择

### 我帮你查出来的几个隐患

有三个我认为**现在最好顺手防住，但不需要现在开发完整功能**的点。

**第一，Unique 最好不要只给 Title 做。**

你这次是因为 Title 才发现 Unique，但 Armada 的 Unique 实际上是**全舰队范围的卡牌名称限制**，甚至可以跨卡牌类型。例如一个角色的 Commander、Officer、Squadron 等如果共享 Unique 名称，也不能同时出现在同一舰队。:contentReference[oaicite:3]{index=3}

所以现在最合适的做法不是马上实现完整 Unique 系统，而是至少让数据字段统一成：

```json
"unique": true

以后规则引擎做：

fleet → 检查所有已装备/已选择卡牌 → unique name

而不是：

checkUniqueTitle()
checkUniqueUpgrade()
checkUniqueCommander()

这样未来不会长出一棵规则函数圣诞树。

第二，Modification 的“隐藏”最好是 Selector 层面的隐藏，不是删除数据。

用户已经装备：

Modification A

其他 Modification 不应该从数据库消失，只应该在当前这艘船的选择上下文中不可选。这样以后换掉 A，B、C 会自动回来。

第三，Commander 的显示位置和数据归属要分开。

你要求它显示在总分旁边，这很好，视觉上也非常符合“这支舰队的核心人物”的感觉。但它的数据最好仍然是：

fleet.commander

而不是塞进第一艘船。

因为规则上 Commander 是舰队级限制，而且装备 Commander 的舰船才成为旗舰。

还有一个暂时不用实现、但数据模型千万别堵死的点：现在不要把“Commander 已经选了，所以所有船的 Commander slot 删除”理解成真的从舰船对象里删除某个 slot。最好只是 UI 隐藏。 否则用户换/删 Commander 时，你还得重新生成那些槽位。状态里不应该存这种“因为 UI 状态而消失的东西”。

也就是说：

Fleet 有 Commander
        ↓
UI 不显示各船 Commander 入口

而不是：

Fleet 有 Commander
        ↓
修改所有 Ship JSON
        ↓
删除 Commander slot

后者会把数据状态和显示状态搅在一起，后面很容易出锅。