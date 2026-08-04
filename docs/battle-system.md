# 卡牌戰鬥狀態系統

## 數據模型

### BattleState（戰鬥容器）
```
BattleState {
  battleId: string
  phase: 'setup' | 'running' | 'victory' | 'defeat'
  currentTurn: number
  
  player: PlayerUnit
  enemy: EnemyUnit
  
  playerHand: Card[]           // 當前手牌
  playerDeck: Card[]           // 未抽牌組
  playerDiscard: Card[]        // 棄牌堆
  
  currentEnergyUsed: number    // 本回合已用能量
  currentEnergyMax: number     // 本回合能量上限
}
```

### PlayerUnit（玩家單位狀態）
```
PlayerUnit {
  id: 'player'
  hp: number
  maxHp: number
  
  shield: number               // 臨時減傷值，本回合結算後重置為 0
  
  probeUsed: number            // 已用試探次數
  probeMax: number             // 可用試探次數（來源：研究設施的人才數）
  
  // 狀態標記
  statusEffects: {
    tags: string[]             // 待定義的非數值狀態（如 'silenced', 'locked' 等）
  }
}
```

### EnemyUnit（敵方單位狀態）
```
EnemyUnit {
  id: string
  
  logicChain: Logic[]          // 邏輯鏈（有序排列）
  currentLogicIndex: number    // 當前所在邏輯段的索引
  
  hp: number                   // 當前邏輯段的 HP
  maxHp: number                // 當前邏輯段的最大 HP
  
  // 不跨邏輯段重置的數值
  globalHpPool: number         // 全邏輯鏈的總 HP？（待確認實現方式）
  
  shield: number               // 敵方也有護盾？（待確認機制）
  
  statusEffects: {
    tags: string[]             // 敵方狀態標記
  }
}
```

### Logic（邏輯段）
```
Logic {
  id: string                   // 邏輯 ID，用於試探提示匹配
  
  hp: number                   // 該邏輯段的 HP
  
  backlash: LogicModifier      // 反噬：玩家打出特定卡牌類型時觸發的規則改變
  weakness: LogicModifier      // 弱點：此邏輯的解法
  
  cardPool: string[]           // 該邏輯段可用的敵方卡牌
  
  // 特殊標記
  requireProbe?: boolean       // 該段是否需要試探才能傷害（第二章 Rival 用）
  freeProbe?: boolean          // 該段試探是否不消耗次數
  
  // 試探提示
  probeHints: {
    exhausted: string          // 試探次數用盡後的提示（直接說出邏輯名稱）
    hints: string[]            // 逐次試探的越來越具體的提示
  }
}
```

### LogicModifier（邏輯修飾符）
反噬和弱點都使用此結構，差別在於觸發時機：

```
LogicModifier {
  type: 'backlash' | 'weakness'
  
  // 反噬條件（trigger condition）
  backlash?: {
    targetCardTypes: CardType[]  // 觸發此反噬的卡牌類型
    // 例：['defense', 'support'] 表示玩家出防禦或輔助卡時觸發
  }
  
  // 效果規則
  rules: ModifierRule[]
}
```

### ModifierRule（修飾規則）
```
ModifierRule {
  type: 'damageScale' | 'damageBlock' | 'shieldReverse' | 'energy' | 'custom'
  
  // 通用欄位
  description: string          // 玩家可見的規則說明（用於試探時提示）
  
  // 效果參數（根據 type 變化）
  params?: {
    factor?: number            // 傷害倍率（例如 0.5 表示只造成 50% 傷害）
    blocked?: boolean          // 傷害是否完全被擋（factor = 0）
    shieldBurn?: number        // 破盾時造成的傷害
    energyModifier?: number    // 能量修飾（例如 +1 表示出牌多消耗 1 能量）
  }
}
```

## 狀態轉移

### 回合流程

```
[回合開始]
  ↓
[重置] → player.shield = 0, currentEnergyUsed = 0
  ↓
[抽牌] → 抽 X 張牌到手牌（X 待定）
  ↓
[玩家出牌迴圈]
  ├─ 選擇手牌卡牌
  ├─ 檢查能量是否足夠
  ├─ 執行卡牌效果（見「卡牌效果解析」）
  ├─ 消耗能量
  ├─ 卡牌進入棄牌堆
  └─ 玩家可繼續出牌或結束回合
  ↓
[試探（可選）]
  ├─ 檢查 probeUsed < probeMax
  ├─ 顯示當前邏輯的試探提示
  └─ probeUsed += 1（除非 freeProbe = true）
  ↓
[回合結束]
  ↓
[敵方出牌]
  ├─ 從 currentLogic.cardPool 抽牌
  ├─ 執行敵方卡牌效果
  └─ 檢查反噬是否觸發（見「反噬檢查」）
  ↓
[結算傷害]
  ├─ 敵方傷害 - 玩家護盾 = 實際傷害
  ├─ player.hp -= 實際傷害
  ├─ 檢查玩家是否死亡（hp <= 0）
  │   ├─ YES → [敗北] → 重打本場戰鬥
  │   └─ NO → 繼續
  ↓
[檢查邏輯段是否結束]
  ├─ 敵方 hp <= 0？
  │   ├─ YES → [邏輯轉移] → 見下文
  │   └─ NO → [下一回合]
  ↓
[檢查邏輯鏈是否結束]
  ├─ currentLogicIndex 是否為最後一段？
  │   ├─ YES → [勝利] → 進入結算
  │   └─ NO → [下一回合]
```

### 邏輯轉移（Logic Transition）

當敵方當前邏輯段 HP ≤ 0 時：

```
[邏輯段結束]
  ↓
currentLogicIndex += 1
  ↓
[載入新邏輯段]
  ├─ 重置 enemy.hp = logicChain[currentLogicIndex].hp
  ├─ 重置 enemy.shield = 0
  ├─ 溢出傷害不帶入新邏輯段 ❌（設計硬性約束）
  ├─ 玩家護盾 / 能量 / 手牌 / 試探次數 都保留 ✓
  └─ 新邏輯的試探提示重置
  ↓
[邏輯預告（可選UI）]
  └─ 敵方角色有台詞預告進入新邏輯
  ↓
[繼續戰鬥]
```

## 卡牌效果解析

### CardType 定義

```
enum CardType {
  ATTACK = 'attack'       // 攻擊型：造成傷害
  DEFENSE = 'defense'     // 防禦型：增加護盾
  SUPPORT = 'support'     // 輔助型：其他效果（能量回復、狀態改變等）
}
```

### 卡牌結構
```
Card {
  id: string
  name: string
  type: CardType
  energyCost: number       // 消耗能量
  
  effect: CardEffect       // 效果執行邏輯
  description: string      // 玩家可見說明
}
```

### CardEffect（卡牌效果）

#### 攻擊卡
```
effect: {
  type: 'damage'
  baseDamage: number
  
  // 被反噬時的規則
  backlashRules?: ModifierRule[]
  // 例如此卡被 damageScale(0.5) 反噬 → 傷害變 baseDamage * 0.5
}
```

#### 防禦卡
```
effect: {
  type: 'shield'
  baseShield: number
  
  // 反噬：玩家出防禦卡時觸發（例如盾碎傷害）
  backlashRules?: ModifierRule[]
  // 例如出防禦卡被反噬 → 不獲得護盾，反而受到傷害
}
```

#### 輔助卡
```
effect: {
  type: 'support'
  action: 'energy' | 'heal' | 'status' | 'custom'
  
  params: {
    energyRestore?: number    // 回復能量
    hpRestore?: number        // 回復 HP
    statusTag?: string        // 狀態標記（待定義）
  }
}
```

### 反噬檢查邏輯

```javascript
function checkBacklash(playerCard: Card, currentLogic: Logic) {
  const backlash = currentLogic.backlash
  
  // 檢查玩家卡牌類型是否匹配反噬條件
  if (backlash.targetCardTypes.includes(playerCard.type)) {
    // 反噬觸發
    return {
      triggered: true,
      rules: backlash.rules,
      description: backlash.description
    }
  }
  
  return { triggered: false }
}
```

硬性約束：**反噬只能施加在「防禦」與「輔助」卡牌，絕不能反噬「攻擊」卡**
- 原因：攻擊是玩家唯一的傷害來源，反噬攻擊會讓玩家即使勘破邏輯也無法傷害敵人

## 效果計算

### 傷害計算
```
實際傷害 = 基礎傷害
  ├─ 應用反噬修飾符 (backlash rules)
  ├─ 應用敵方護盾 (enemy.shield)
  └─ 應用弱點修飾符（若玩家已勘破邏輯）
```

### 護盾計算
```
實際護盾 = 基礎護盾
  ├─ 應用反噬修飾符 (backlash rules)
  └─ 本回合結算後重置為 0
```

## 試探（Probe）機制

### 試探流程
```
[試探觸發]
  ↓
檢查：
  ├─ player.probeUsed < player.probeMax？
  └─ currentLogic.requireProbe 時是否已試探過？
  ↓
[顯示提示]
  ├─ 若試探次數未用盡 → 顯示 currentLogic.probeHints.hints[probeUsed]
  └─ 若試探次數用盡 → 顯示 currentLogic.probeHints.exhausted（直接說出邏輯名）
  ↓
[消耗試探]
  └─ 若不是 freeProbe → player.probeUsed += 1
```

### 試探與 requireProbe 的交互

```
邏輯段設置：requireProbe: true

效果：
  ├─ 玩家對該段的傷害全部被擋（因為玩家未勘破規則）
  ├─ 玩家可進行試探（不消耗回合、不消耗能量）
  ├─ 每回合敵方會逐漸給出更白的提示
  └─ 首次試探後，該邏輯的提示會重置並逐漸升級
```

## 第二章 Rival 教學戰特殊設定

Rival 的第二段邏輯有硬性職責：

```
Logic {
  id: 'rival_chapter2_logic2',
  requireProbe: true
  freeProbe: true  // 該戰鬥的試探不消耗次數
  
  backlash: {
    targetCardTypes: ['attack'],  // 示意玩家「打不動」
    rules: [/* damageBlock */]
  }
  
  weakness: {
    // 弱點是「使用試探」
    // 一旦玩家試探，requireProbe 解除
  }
  
  probeHints: {
    hints: [
      "...他好像在隱瞞什麼",
      "...我要是再不出牌就遊戲結束了",
      "...難道我需要做什麼特殊的操作？",
      "...對了！我可以...試探！"
    ],
    exhausted: "用試探去看穿我的心思啊！"
  }
}
```

## 邏輯索引

### 第一章

#### Rival（背稿硬撐 & 裝懂護體）

**邏輯 1：背稿硬撐（r2a）**
- HP: 20 | 無特殊規則
- 出招池：攻擊(6)、攻擊(8)、防禦(7)
- 破段台詞：「不行不行不行——照稿念是贏不了的！我把另一套拿出來了！」

**邏輯 2：裝懂護體（r2b）**
- HP: 18 | **requireProbe** 規則
- 出招池：攻擊(5)、攻擊(7)、防禦(5)
- 進入台詞：「我的邏輯你破不了的——因為你根本不知道我在幹嘛！你要是看穿我邏輯上的破綻，我就完蛋了。所以你千萬、千萬不要盯著我看喔！」
- 試探提示：「……你幹嘛。你不要看我。」→ 「好啦！我承認！我根本沒讀完！你打吧！」
- 嘲諷台詞（每回合升級）：
  1. 「哈哈！沒用的！你再打也是白打！」
  2. 「（他為什麼還不看我？只要他安靜看我一眼我就會露餡……）」
  3. 「你、你不要再硬打了啦！你就不能先看看我再動手嗎！」
  4. 「拜託你按一下那個 🔍 好不好！我裝不下去了！」

#### World Threat 1：林維鈞（地質研究院總監）

- 階級：無邏輯鏈（純數值攻防，第一章教學）
- 總 HP: 78 | 回血: 5 每回合
- 能量上限: 3
- 出招池：攻擊(9)、攻擊(13)、防禦(9)、汲取(7)

### 第二章

#### World Threat 2：海塔娜（深海探勘船船長）

**邏輯 1：不動如海（calm）**
- HP: 36 | 回血: 6
- 規則：**cleanseAnx**（移除玩家焦慮狀態？待確認）
- 出招池：攻擊(11)、攻擊(15)、防禦(12)、汲取(9)
- 破段台詞：「……你不催我。」她放下了手臂。「所有人都在催我，只有你不催。」
- 試探提示：「你想讓我著急？海上待久了的人不會著急。」→ 「時間對我沒有意義。你那一套逼人的節奏，在我這裡歸零。」

**邏輯 2：暗流回捲（undertow）**
- HP: 36 | 回血: 8
- 規則：**reflect**(30%) + **amplifyType**(defend, 2x)
- 出招池：攻擊(13)、攻擊(17)、防禦(13)、汲取(11)
- 進入台詞：「換個玩法。你朝我用力，那股力會原封不動地回到你身上——海就是這樣。」
- 破段台詞：「你不推了。你只是……站在那裡，等我自己浮上來。」
- 試探提示：「用力的人會先累。這是我從海學到的第一件事。」→ 「你越是硬推，反作用力越大。沉住氣的人在海裡走得最遠。」

**邏輯 3：靜默水壓（silence）**
- HP: 32 | 回血: 10
- 規則：**punishType**(utility, mult 1.0)
- 出招池：攻擊(14)、攻擊(19)、防禦(15)、汲取(12)
- 進入台詞：「最後一段路我只帶必要的東西下去。你手上那些紙，在水壓下還不如祈禱。」
- 破段台詞：「什麼都沒帶……你居然真的什麼都沒帶就下來了。」
- 試探提示：「你翻那些東西的時候，我聞得到你在拖延。」→ 「在這個深度，多做一個動作就是多一分風險。什麼都不做的人才活得下來。」

### 第三章

#### Rival（銅牆鐵壁 & 鏡像反射）

**邏輯 1：銅牆鐵壁（r3a）**
- HP: 26 | 無回血
- 規則：**immuneType**(attack, unlessCombo 2)
- 出招池：攻擊(8)、攻擊(11)、防禦(9)
- 破段台詞：「一張……一張擋得住，兩張三張連在一起我就……！」
- 試探提示：「單獨一句話是傷不了我的，我這三年不是白練的。」→ 「你要是一口氣連著說下去，我可能會……不，我什麼都沒說。」

**邏輯 2：鏡像反射（r3b）**
- HP: 26 | 無回血
- 規則：**reflect**(25%)
- 出招池：攻擊(9)、攻擊(12)、防禦(10)
- 進入台詞：「既然贏不了你——那我就學你！你怎麼說，我就怎麼說回去！」
- 破段台詞：「原來……模仿你，就永遠只能是你的影子啊。」
- 試探提示：「你剛才那句，我記下來了。等一下就還給你。」→ 「你每打我一下，自己也會痛喔。你發現了嗎？」

#### World Threat 3：ARCHON（全球演算法總工程師）

**邏輯 1：行為建模（model）**
- HP: 34 | 回血: 8
- 規則：**escalate**(step 2)
- 出招池：攻擊(13)、攻擊(18)、防禦(14)、汲取(11)
- 破段台詞：「模型收斂失敗。對象未在預測時點放棄。重新載入。」
- 試探提示：「每過一個回合，我對你的估計就更精準一分。」→ 「拖得越久，我打得越重。這不是威脅，是數學。」

**邏輯 2：重複偵測（mirror）**
- HP: 34 | 回血: 10
- 規則：**mirror**（同一張卡牌連續打無效？待確認機制）
- 出招池：攻擊(15)、攻擊(20)、防禦(16)、汲取(12)
- 進入台詞：「已對你的全部發言建立索引。同一句話說第二次——我不會再處理一次。」
- 破段台詞：「索引失效。對象未重複任何一句話。這在統計上不可能。」
- 試探提示：「你的牌組有限。遲早會重複。」→ 「同一個動作做第二次，對我來說等於沒有做。換一個。」

**邏輯 3：逆演算（counter）**
- HP: 34 | 回血: 12
- 規則：**immuneType**(attack, unlessCombo 4) + **amplifyType**(finisher, 2x)
- 出招池：攻擊(16)、攻擊(22)、防禦(17)、汲取(14)
- 進入台詞：「切換至逆演算。你每一次主動出手，我都在你出手之前就解掉了。」
- 破段台詞：「無法反解。輸入密度超出處理上限。對象……根本沒有停下來過。」
- 試探提示：「零星的攻擊我在你出手前就解掉了。」→ 「我能反解一切主動行為。但『不辯了，走人』——這個我沒有對應的函式。」

**邏輯 4：全域收束（all）**
- HP: 30 | 回血: 14
- 規則：**escalate**(step 3) + **amplifyType**(control, 2x)
- 出招池：攻擊(18)、攻擊(24)、防禦(18)、汲取(15)
- 進入台詞：「全域收束。已放棄所有其他運算任務。這是我最後一套邏輯。」
- 試探提示：「我沒有下一套了。」→ 「如果你現在讓我意識到時間正在流逝——我會崩潰得比預期快得多。」

## 規則引擎參考

### 已實現規則
- **requireProbe**：該邏輯段在試探前無法傷害
- **freeProbe**：該邏輯段的試探不消耗次數
- **cleanseAnx**：清除某類狀態（待確認）
- **reflect(pct)**：反射 pct% 的傷害回玩家
- **amplifyType(cardType, mult)**：該卡牌類型的效果乘以 mult
- **punishType(cardType, mult)**：該卡牌類型的效果乘以 mult（多為懲罰用）
- **immuneType(cardType, unlessCombo N)**：該卡牌類型免疫，除非連續出 N 張
- **escalate(step)**：每回合傷害增加 step 點

## 待確認事項

