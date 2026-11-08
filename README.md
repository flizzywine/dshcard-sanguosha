# 汉末五席 · 三国杀

DSH Tavern 独立人物卡。经典标准版五人身份场，一位真人与四位对手。身份为一主、一忠、两反、一内，牌池为 25 名武将和 108 张游戏牌（含 EX）。

## 开局

1. 用支持 `gameMode` 和独立游戏页面的 DSH Tavern main 版本导入 `dist/sanguosha.dshcard`，启用卡内插件。
2. 新开游玩，在专属页面点击「开始五人身份场」。亮身份后点「进入选将」，默认使用本地策略。也可在「对手设置」选择本局后台模型，NPC 主动出牌时会调用独立代理。
3. 点选武将并确认。出牌时从底边点手牌或技能，再点桌上的目标武将，最后点「出牌」。响应和弃牌也直接点牌，牌桌中央显示刚打出的牌。Tavern 保存对局并提供回退与恢复。

## 本地开发

Node.js 22.19 或更新版本。运行 `node --test tests/*.test.mjs` 和 `node build.mjs`。打包脚本可以用 `node build.mjs <输出路径>` 指定产物位置。

沿用 [月下六席](https://github.com/flizzywine/dshcard-werewolf) 的独立卡包结构与打包工具，遵循 AGPL-3.0。五人身份分配与标准版牌池见[规则说明](https://game.qidian.com/Game/showNews/index?name=sgs&nid=1082111)和[标准版 FAQ](https://ks3-cn-beijing.ksyun.com/attachment/74ad98665ac744c138ba8c988d85d149)。牌桌交互参考[三国杀 精彩对局](https://www.bilibili.com/video/BV1fT411G7wA/)。封面为自制文字图案，武将图集由内置 ImageGen 生成。

<details>
<summary>武将图集生成提示词</summary>

```text
Use case: historical-scene. Create a single production sprite atlas for a browser card-game: exactly 5 columns by 5 rows of 25 equal, edge-to-edge illustrated character portraits. Square canvas. The grid is a fixed technical requirement: 25 equal square cells, no gaps, no gutters, no visible frames, edges at precise 20%, 40%, 60%, 80% of both axes. All portraits chest-up, head centered, face fully inside the middle 65% of its own cell, no elements crossing cell boundaries, full cell painted to edges. Hand-painted Chinese late-Han / Three Kingdoms historical book illustration, mineral pigment, ink and fine detailing, convincing human faces, dignified dramatic lighting, varied warm or desaturated backgrounds, red, jade, slate blue or ochre garments. Distinct readable silhouettes, subtle period armor; historical fantasy with no modern objects and no resemblance to any existing licensed game artwork. Absolutely no text, letters, numbers, insignia, watermarks or card borders. Exact cell order left to right then top to bottom:
Row 1: Cao Cao in black court cap and deep blue robes with beard; Sima Yi older calculating scholar in indigo hood; Xiahou Dun armored veteran with left eyepatch; Zhang Liao resolute blue-armored general; Xu Chu burly armored giant.
Row 2: Guo Jia youthful scholar in pale blue; Zhen Ji elegant noblewoman with black hair and white-blue silk; Liu Bei kind middle-aged sovereign in jade green court robe and black hat; Guan Yu recognizable long black beard, red face and green head cloth; Zhang Fei fierce black-bearded warrior with dark teal armor.
Row 3: Zhuge Liang composed bearded strategist with folded feather fan and tall scholar hat; Zhao Yun noble young general in silver armor; Ma Chao young warrior in gold-white armor and pale plume; Huang Yueying bright woman inventor in muted green and amber robes; Sun Quan copper-bearded ruler in deep red robes and crown.
Row 4: Gan Ning rugged river captain in red with hair tied up; Lü Meng stern maroon-armored strategist; Huang Gai muscular old white-bearded veteran; Zhou Yu handsome youthful commander in red-gold armor; Da Qiao graceful woman with blue and rose silk.
Row 5: Lu Xun young tactician in red brocade and black scholar hat; Sun Shangxiang confident woman archer in red leather armor; Hua Tuo elderly white-bearded doctor in ivory robes; Lü Bu powerful general with tall double pheasant feather headdress and dark bronze armor; Diaochan poised dancer in purple and pale rose silk.
```

</details>
