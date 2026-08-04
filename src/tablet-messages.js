/* ================= TABLET INBOX CONTENT =================
   Everything the tablet can deliver, as messages from in-fiction senders.

   This file is content, not logic. Adding a message here is the whole job of
   adding a new objective / how-to / story beat to the tablet — nothing in
   index.html needs to change.

   DELIVERY RULE: a message arrives only after the player has met the thing it
   explains. Chapter one is itself the tutorial, so the gathering how-to shows up
   after the first gathering run, the debate how-to after the first debate, and
   the 試探 briefing when the chapter-2 coach teaches logic chains. At the very
   start the inbox holds exactly one message: the opening address. Anything with
   `when: () => true` other than that would undo the pacing of the whole game.

   index.html runs inside an IIFE, so nothing in here can see game state
   directly. `when` and `live` are handed a context object instead:

     { chapter, day, TOTAL_DAYS, influence, THRESHOLD, THREAT_NAME,
       base, factions, rivalDefeated,
       encounters,   how many street encounters have resolved
       seen }        milestones: gather, base, battle, rest, probe
                     (set by markTablet() at each activity's completion)

   Fields
     id      unique; also the read/unread key
     from    sender name shown on the card
     faction key into META — supplies the colour and the avatar.
             Omit for the Association itself: it is the terminal, so it
             speaks in the terminal's own phosphor green.
     kind    'objective' | 'howto' | 'story'  (drives the little label)
     when    (ctx) => bool — delivered the first time this returns true
     live    (ctx) => [{ label, now, max }] — progress rows, recomputed
             every time the message is opened. Use this instead of writing
             numbers into `body`, or the tablet becomes a stale notice board.
*/

const TABLET_MESSAGES = [

  /* ---------- opening address ---------- */
  {
    id: 'intro',
    from: '全球超譯協會',
    kind: 'story',
    title: '天才！我們終於等到你了！',
    when: () => true,
    body:
      '眼前的世界早已分崩離析，一連串的末日危機正將人類推向深淵。但我們沒有絕望，因為我們等到了你——你擁有超越凡人想像、近乎神蹟的智慧。\n\n' +
      '人類的未來就寄託在你身上，拜託了，請用你的智慧，將人類從這場末日災難中拯救出來吧！\n\n' +
      '（本平板將持續為您推送各單位來訊。）'
  },

  /* ---------- per-chapter objectives ---------- */
  {
    id: 'goal-ch1',
    from: '全球超譯協會',
    kind: 'objective',
    title: '第一章 · 本階段觀測目標',
    // after the first encounter: the influence meter has to exist before a
    // target for it means anything
    when: ctx => ctx.chapter === 1 && ctx.encounters >= 1,
    body:
      '協會已在您周邊部署觀測網。您只需要照常生活——您的每一個眼神，我們都會替全世界解讀出意義。\n\n' +
      '請在觀測期結束前累積足夠的影響力。期滿當日，您將與握有關鍵資源的對象進行一場正式談判。',
    live: ctx => [
      { label: '影響力', now: ctx.influence, max: ctx.THRESHOLD },
      { label: '觀測日程', now: ctx.day, max: ctx.TOTAL_DAYS }
    ]
  },
  {
    id: 'goal-ch2',
    from: '全球超譯協會',
    kind: 'objective',
    title: '第二章 · 本階段觀測目標',
    when: ctx => ctx.chapter === 2,
    body:
      '第一場末日已經落幕，您的名字傳遍全球。隨之而來的是：對手升級了。\n\n' +
      '本章起，談判對象不再只是「比較硬」——他們會在您面前改寫辯論的規則。請務必先讀完研究所那封信。',
    live: ctx => [
      { label: '影響力', now: ctx.influence, max: ctx.THRESHOLD },
      { label: '觀測日程', now: ctx.day, max: ctx.TOTAL_DAYS },
      { label: '研究所等級', now: ctx.base ? ctx.base.lv.lab : 0, max: 3 }
    ]
  },
  {
    id: 'goal-ch3',
    from: '全球超譯協會',
    kind: 'objective',
    title: '第三章 · 本階段觀測目標',
    when: ctx => ctx.chapter === 3,
    body:
      '各地的 AI 開始不約而同地宣稱自己「終於懂了」大師。協會無法判斷這是好事還是壞事。\n\n' +
      '協會重申：常規邏輯對跨維度智慧生命並不通用。請照常行動。',
    live: ctx => [
      { label: '影響力', now: ctx.influence, max: ctx.THRESHOLD },
      { label: '觀測日程', now: ctx.day, max: ctx.TOTAL_DAYS },
      { label: '基地科技階級', now: ctx.base ? ctx.base.tier : 1, max: 4 }
    ]
  },

  /* ---------- how the systems actually work ---------- */
  {
    id: 'howto-street',
    from: '全球超譯協會',
    kind: 'howto',
    title: '作業說明 · 外出走動',
    when: ctx => ctx.encounters >= 1,
    body:
      '出門後您會遇上路人。他們會盯著您，等您做出一個動作。\n\n' +
      '您只有四個選擇：⬆️仰望　⬇️俯瞰　⬅️回顧　➡️展望\n\n' +
      '這四個動作本身沒有對錯。差別在於「誰在看」——每個派系用自己的方式解讀同一個眼神，猜中對方的偏好，信任會漲得特別快。\n\n' +
      '注意：連續往同一個方向看會累積疲勞，效果遞減。偶爾換個方向。'
  },
  {
    id: 'howto-factions',
    from: '覺醒者派 · 匿名',
    faction: 'awakened',
    kind: 'howto',
    title: '（外流）各派系的解讀偏好',
    // lands with the faction trust panel, which reveals on the second encounter
    when: ctx => ctx.encounters >= 2,
    body:
      '這份東西協會不會給你，但你有權知道：\n\n' +
      '🎓 教授派　偏好 ⬅️回顧 ／ ⬆️仰望\n' +
      '🙏 宗教派　偏好 ⬆️仰望\n' +
      '💰 商人派　偏好 ➡️展望 ／ ⬇️俯瞰\n' +
      '🤖 AI派　　跟隨目前最多人選的方向\n' +
      '🌐 網友派　無固定偏好，靠連續同向累積聲量\n' +
      '🎖️ 軍事派　偏好 ➡️出擊 ／ ⬇️駐守\n' +
      '🧿 覺醒者　偏好 ⬆️昇華 ／ ➡️上傳未來\n\n' +
      '左欄的派系面板上也有「揭露偏好」可以隨時查。'
  },
  {
    id: 'howto-gather',
    from: '補給組',
    faction: 'merchant',
    kind: 'howto',
    title: '作業須知 · 廢墟採集',
    when: ctx => ctx.seen.gather,
    body:
      '採集許可一次三趟，佔用一個時段。\n\n' +
      '您在探索中有可能獲取三種資源：\n' +
      '📦 物資　蓋東西、升級的基本消耗\n' +
      '⚙️ 零件　高階建築與強化論點用\n' +
      '💎 神髓　稀有；奇觀與最高階升級的門檻\n\n' +
      '每次資源到手都會跳出結算，你可以用這些資源強化基地或者在基地種植作物。'
  },
  {
    id: 'howto-base',
    from: '工程部',
    faction: 'military',
    kind: 'howto',
    title: '工程總表 · 使用方式',
    when: ctx => ctx.seen.base,
    body:
      '基地建設不佔時段，隨時可以進去\n\n' +
      '基地建設各有用途：大多數都能在你說服對手時起到幫助。點地基就能升級。\n\n' +
      '重要：您不是在戰鬥中變強的，是在這裡。談判打不過，有可能原因出在基地而不在牌桌上。\n\n' +
      '招募到的人才要「安置」進建築才會生效——只是招到不算數。'
  },
  {
    id: 'howto-battle',
    from: '研究所',
    faction: 'professor',
    kind: 'howto',
    title: '對質流程 · 基礎',
    when: ctx => ctx.seen.battle,
    body:
      '談判是回合制。每回合有固定行動點，打出論點卡消耗行動點。\n\n' +
      '對手頭上那排分段條，是他的「邏輯鏈」。段數一開始就看得到，內容看不到。擊潰他當前的論點，他就換下一套說法。\n\n' +
      '每一套邏輯都有可能改寫戰鬥規則，但也都有弱點——打錯類型的牌會反傷自己。看清楚再出手。\n\n' +
      '打輸不是世界末日：您仍會帶回一部分資源，並得到一次回基地強化的機會。'
  },
  {
    id: 'howto-probe',
    from: '研究所',
    faction: 'professor',
    kind: 'howto',
    title: '⚠️ 新增能力 · 試探',
    // the chapter-2 coach teaching logic chains, or meeting one in a fight
    when: ctx => ctx.seen.probe,
    body:
      '從本章起，對手會在談判中途整套改寫自己的邏輯。上一回合有效的牌，這一回合可能反噬您。\n\n' +
      '所以您需要 🔍 試探：花一次試探，讀出對手「目前」掛的是哪一套邏輯。\n\n' +
      '試探次數由 🔬 研究所提供——研究所沒有人進駐，您就一次都沒有。\n\n' +
      '有些對手的第一段邏輯是封印的，不試探就完全打不動。仔細的分配你擁有的試探次數，才能在對戰中取勝。',
    live: ctx => [
      { label: '研究所等級', now: ctx.base ? ctx.base.lv.lab : 0, max: 3 },
      { label: '已安置人才', now: ctx.base ? ctx.base.talents.filter(t => t.housed).length : 0, max: 3 }
    ]
  },
  {
    id: 'howto-rest',
    from: '全球超譯協會',
    kind: 'howto',
    title: '作業說明 · 收工',
    when: ctx => ctx.seen.rest,
    body:
      '回到膠囊床就結束今天，剩餘時段作廢。\n\n' +
      '結算時支持者送來的物資會一併入庫，隔天早上生效。\n\n' +
      '協會提醒：您的沉默同樣會被解讀。休息也是一種姿態。'
  }
];
