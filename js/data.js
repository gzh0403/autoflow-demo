/**
 * AutoFlow 预置演示数据（全部虚拟）。重置时按「今天」重新生成相对日期。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AFData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PLACEHOLDERS = [
    { id: "arrive-1", stage: "arrive", src: "assets/photos/arrive-1.svg", label: "演示占位图 · 到店 A" },
    { id: "arrive-2", stage: "arrive", src: "assets/photos/arrive-2.svg", label: "演示占位图 · 到店 B" },
    { id: "before-1", stage: "before", src: "assets/photos/before-1.svg", label: "演示占位图 · 施工前 A" },
    { id: "before-2", stage: "before", src: "assets/photos/before-2.svg", label: "演示占位图 · 施工前 B" },
    { id: "during-1", stage: "during", src: "assets/photos/during-1.svg", label: "演示占位图 · 施工中 A" },
    { id: "after-1", stage: "after", src: "assets/photos/after-1.svg", label: "演示占位图 · 完工 A" },
    { id: "after-2", stage: "after", src: "assets/photos/after-2.svg", label: "演示占位图 · 完工 B" },
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function dateStr(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function addDays(s, n) {
    var p = String(s).split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }
  function isoAt(date, hm, nowRef) {
    var p = date.split("-");
    var t = hm.split(":");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), Number(t[0]), Number(t[1]), 0, 0);
    return d.toISOString();
  }

  function createSeed(now) {
    now = now || new Date();
    var today = dateStr(now);
    var dMinus60 = addDays(today, -60);
    var dMinus59 = addDays(today, -59);
    var dMinus30 = addDays(today, -30);
    var d1 = addDays(today, 1);
    var d2 = addDays(today, 2);
    var d3 = addDays(today, 3);

    var hours = { start: "09:00", end: "18:00" };

    var state = {
      version: 1,
      seededAt: now.toISOString(),
      demoLabel: "演示样品 · 虚拟数据 · 非真实经营数据",
      visualNote: "建议视觉，待创始人确认，未锁定",
      store: {
        name: "AutoFlow 演示门店",
        address: "演示市精工路 18 号（虚拟地址，非真实门店）",
        phone: "010-0000-0000（演示号码）",
        hours: hours,
        announcement: "本页为样品演示。预约不收费，到店核销时记录结算方式。全车贴膜类项目按跨日占用工位与技师。",
        intro: "AutoFlow 演示门店是一间虚拟的精洗与贴膜工作室，用于展示车辆档案、施工预约、跨日工位占用、进度同步、会员次卡与简易店内质保。不是真实经营门店。",
      },
      settings: {
        confirmMode: "manual",
        confirmModeNote: "确认方式为配置：默认店员手动确认，不另起一套状态机。",
        paymentMode: "pay_after",
        cancelLeadHours: 2,
      },
      services: [
        {
          id: "sv_wash",
          name: "标准洗车",
          category: "洗车",
          price: 39,
          durationMinutes: 30,
          durationDays: 0,
          bayType: "wash",
          photoRequired: false,
          warrantyDays: 0,
          cardEligible: true,
          enabled: true,
          description: "外观冲洗、轮毂清洁与基础擦干。约 30 分钟，适合短单演示。",
        },
        {
          id: "sv_detail",
          name: "精洗护理",
          category: "精洗",
          price: 199,
          durationMinutes: 120,
          durationDays: 0,
          bayType: "wash",
          photoRequired: true,
          warrantyDays: 0,
          cardEligible: true,
          enabled: true,
          description: "内外精洗、缝隙与轮毂深度清洁。约 2 小时，可使用精洗次卡核销。",
        },
        {
          id: "sv_coat",
          name: "漆面镀晶",
          category: "美容",
          price: 899,
          durationMinutes: 240,
          durationDays: 0,
          bayType: "wash",
          photoRequired: true,
          warrantyDays: 180,
          cardEligible: false,
          enabled: true,
          description: "漆面清洁后镀晶养护，约 4 小时。可登记简易店内质保。",
        },
        {
          id: "sv_sun",
          name: "汽车太阳膜",
          category: "贴膜",
          price: 1280,
          durationMinutes: 180,
          durationDays: 0,
          bayType: "wrap",
          photoRequired: true,
          warrantyDays: 1095,
          cardEligible: false,
          enabled: true,
          description: "全车玻璃太阳膜，约 3–4 小时。质保由门店自行登记，不对接膜厂官方接口。",
        },
        {
          id: "sv_ppf",
          name: "全车隐形车衣",
          category: "贴膜",
          price: 6800,
          durationMinutes: 0,
          durationDays: 2,
          bayType: "wrap",
          photoRequired: true,
          warrantyDays: 1825,
          cardEligible: false,
          enabled: true,
          description: "全车隐形车衣。按行业常见工时演示为跨日 2 天：占用两个营业日的工位与技师时段。",
        },
        {
          id: "sv_color",
          name: "全车改色膜",
          category: "贴膜",
          price: 8800,
          durationMinutes: 0,
          durationDays: 2,
          bayType: "wrap",
          photoRequired: true,
          warrantyDays: 1095,
          cardEligible: false,
          enabled: true,
          description: "全车改色膜，跨日 2 天占用工位与技师。用于演示跨日冲突与质保登记。",
        },
      ],
      bays: [
        { id: "bay_1", name: "1号精洗工位", type: "wash", enabled: true },
        { id: "bay_2", name: "2号精洗工位", type: "wash", enabled: true },
        { id: "bay_3", name: "3号贴膜工位", type: "wrap", enabled: true },
      ],
      technicians: [
        {
          id: "tech_kai",
          name: "阿凯",
          title: "精洗技师",
          specialties: ["标准洗车", "精洗护理", "漆面镀晶"],
          serviceIds: ["sv_wash", "sv_detail", "sv_coat"],
          bio: "虚拟技师。擅长精洗与漆面护理，演示用，非真人。",
          accent: "#3E5C7A",
          enabled: true,
        },
        {
          id: "tech_he",
          name: "小河",
          title: "贴膜技师",
          specialties: ["汽车太阳膜", "全车隐形车衣", "全车改色膜"],
          serviceIds: ["sv_sun", "sv_ppf", "sv_color"],
          bio: "虚拟技师。负责贴膜与改色类跨日项目，演示用，非真人。",
          accent: "#4A6A6A",
          enabled: true,
        },
        {
          id: "tech_wei",
          name: "老魏",
          title: "综合技师",
          specialties: ["标准洗车", "精洗护理", "汽车太阳膜"],
          serviceIds: ["sv_wash", "sv_detail", "sv_sun"],
          bio: "虚拟技师。可承接洗车、精洗与太阳膜，演示用，非真人。",
          accent: "#5A5366",
          enabled: true,
        },
      ],
      staff: [
        { id: "st_chen", name: "小陈", title: "前台店员", role: "staff", bio: "虚拟店员，负责确认预约、到店接待与核销。" },
        { id: "st_lin", name: "林", title: "店主", role: "boss", bio: "虚拟老板，可配置项目、工位、排班并查看经营看板。" },
      ],
      bossId: "st_lin",
      customers: [
        { id: "cu_aming", name: "阿明", phone: "13800001001", note: "演示顾客，名下两辆车。" },
        { id: "cu_zhou", name: "小周", phone: "13800001002", note: "演示顾客，有一笔跨日贴膜工单。" },
        { id: "cu_zhen", name: "阿珍", phone: "13800001003", note: "演示顾客，有一笔可核销的到店工单。" },
      ],
      vehicles: [
        { id: "vh_aming_1", customerId: "cu_aming", plate: "沪A·AF001", model: "速驰 3", color: "冷灰", vin: "DEMO0AF001VIN0001", mileage: 12600 },
        { id: "vh_aming_2", customerId: "cu_aming", plate: "沪A·AF008", model: "安途 2.0", color: "珍珠白", vin: "DEMO0AF008VIN0008", mileage: 45200 },
        { id: "vh_zhou_1", customerId: "cu_zhou", plate: "沪B·AF216", model: "凌风 SUV", color: "墨蓝", vin: "DEMO0AF216VIN0216", mileage: 8300 },
        { id: "vh_zhen_1", customerId: "cu_zhen", plate: "沪C·AF330", model: "晴川 1.5", color: "银白", vin: "", mileage: 30100 },
      ],
      schedules: [],
      bookings: [],
      cards: [],
      cardLedger: [],
      warranties: [],
      consumptions: [],
      notices: [],
      _seq: { bk: 200, vh: 200, cd: 200, ld: 200, wr: 200, cs: 200, nt: 200, ph: 200, bay: 200 },
    };

    var weekdays = [0, 1, 2, 3, 4, 5, 6];
    ["tech_kai", "tech_he", "tech_wei"].forEach(function (id) {
      weekdays.forEach(function (w) {
        state.schedules.push({
          technicianId: id,
          weekday: w,
          working: true,
          start: "09:00",
          end: "18:00",
        });
      });
    });

    /* 1) 阿明 · 已完成太阳膜（约 60 天前），含照片、质保、消费记录 */
    state.bookings.push({
      id: "bk_done_sun",
      customerId: "cu_aming",
      vehicleId: "vh_aming_1",
      serviceId: "sv_sun",
      technicianId: "tech_he",
      bayId: "bay_3",
      startDate: dMinus60,
      startTime: "09:30",
      endDate: dMinus60,
      endTime: "12:30",
      intervals: [{ date: dMinus60, start: "09:30", end: "12:30" }],
      spanDays: 1,
      status: "completed",
      photos: [
        { id: "ph_1", stage: "before", src: "assets/photos/before-1.svg", label: "演示占位图 · 施工前 A", at: isoAt(dMinus60, "09:40"), by: "店员小陈" },
        { id: "ph_2", stage: "after", src: "assets/photos/after-1.svg", label: "演示占位图 · 完工 A", at: isoAt(dMinus60, "12:20"), by: "店员小陈" },
      ],
      cardId: null,
      redeemed: true,
      payment: { method: "qr", methodLabel: "到店扫码当面收（仅记录，非接口）", amount: 1280, at: isoAt(dMinus60, "12:35"), note: "演示结算记录，非真实支付" },
      createdAt: isoAt(addDays(dMinus60, -2), "11:00"),
      updatedAt: isoAt(dMinus60, "12:35"),
      logs: [
        { at: isoAt(addDays(dMinus60, -2), "11:00"), action: "submit", from: null, to: "pending", by: "顾客阿明", note: "提交预约" },
        { at: isoAt(addDays(dMinus60, -2), "11:20"), action: "confirm", from: "pending", to: "confirmed", by: "店员小陈", note: "确认预约" },
        { at: isoAt(dMinus60, "09:28"), action: "arrive", from: "confirmed", to: "arrived", by: "店员小陈", note: "登记到店" },
        { at: isoAt(dMinus60, "09:35"), action: "start", from: "arrived", to: "in_progress", by: "店员小陈", note: "开始施工" },
        { at: isoAt(dMinus60, "12:20"), action: "finish", from: "in_progress", to: "ready", by: "店员小陈", note: "完工" },
        { at: isoAt(dMinus60, "12:35"), action: "checkout", from: "ready", to: "completed", by: "店员小陈", note: "交车并核销" },
      ],
    });
    state.warranties.push({
      id: "wr_sun_aming",
      bookingId: "bk_done_sun",
      customerId: "cu_aming",
      vehicleId: "vh_aming_1",
      serviceId: "sv_sun",
      startDate: dMinus60,
      endDate: addDays(dMinus60, 1095),
      note: "门店简易质保：汽车太阳膜，按施工日计算。不对接膜厂官方质保系统。",
      createdAt: isoAt(dMinus60, "12:36"),
      by: "店员小陈",
    });
    state.consumptions.push({
      id: "cs_sun_aming",
      bookingId: "bk_done_sun",
      customerId: "cu_aming",
      vehicleId: "vh_aming_1",
      serviceId: "sv_sun",
      amount: 1280,
      method: "qr",
      methodLabel: "到店扫码当面收（仅记录，非接口）",
      cardId: null,
      at: isoAt(dMinus60, "12:35"),
    });

    /* 2) 阿明 · 历史精洗（用次卡扣过） */
    state.bookings.push({
      id: "bk_done_detail",
      customerId: "cu_aming",
      vehicleId: "vh_aming_2",
      serviceId: "sv_detail",
      technicianId: "tech_kai",
      bayId: "bay_1",
      startDate: dMinus30,
      startTime: "14:00",
      endDate: dMinus30,
      endTime: "16:00",
      intervals: [{ date: dMinus30, start: "14:00", end: "16:00" }],
      spanDays: 1,
      status: "completed",
      photos: [],
      cardId: "cd_aming_detail",
      redeemed: true,
      payment: { method: "card", methodLabel: "次卡核销", amount: 0, at: isoAt(dMinus30, "16:05"), note: "演示结算记录，非真实支付" },
      createdAt: isoAt(dMinus30, "10:00"),
      updatedAt: isoAt(dMinus30, "16:05"),
      logs: [
        { at: isoAt(dMinus30, "10:00"), action: "submit", from: null, to: "pending", by: "顾客阿明", note: "提交预约" },
        { at: isoAt(dMinus30, "10:08"), action: "confirm", from: "pending", to: "confirmed", by: "店员小陈", note: "确认预约" },
        { at: isoAt(dMinus30, "13:55"), action: "arrive", from: "confirmed", to: "arrived", by: "店员小陈", note: "登记到店" },
        { at: isoAt(dMinus30, "14:00"), action: "start", from: "arrived", to: "in_progress", by: "店员小陈", note: "开始施工" },
        { at: isoAt(dMinus30, "16:00"), action: "finish", from: "in_progress", to: "ready", by: "店员小陈", note: "短单合并：完工" },
        { at: isoAt(dMinus30, "16:05"), action: "checkout", from: "ready", to: "completed", by: "店员小陈", note: "次卡核销" },
      ],
    });
    state.consumptions.push({
      id: "cs_detail_aming",
      bookingId: "bk_done_detail",
      customerId: "cu_aming",
      vehicleId: "vh_aming_2",
      serviceId: "sv_detail",
      amount: 0,
      method: "card",
      methodLabel: "次卡核销",
      cardId: "cd_aming_detail",
      at: isoAt(dMinus30, "16:05"),
    });

    /* 3) 小周 · 跨日全车隐形车衣：今日 + 明日，已确认，占用 3号贴膜工位与技师小河 */
    state.bookings.push({
      id: "bk_wrap_zhou",
      customerId: "cu_zhou",
      vehicleId: "vh_zhou_1",
      serviceId: "sv_ppf",
      technicianId: "tech_he",
      bayId: "bay_3",
      startDate: today,
      startTime: "09:00",
      endDate: d1,
      endTime: "18:00",
      intervals: [
        { date: today, start: "09:00", end: "18:00" },
        { date: d1, start: "09:00", end: "18:00" },
      ],
      spanDays: 2,
      status: "confirmed",
      photos: [],
      cardId: null,
      redeemed: false,
      payment: null,
      createdAt: isoAt(addDays(today, -3), "15:10"),
      updatedAt: isoAt(addDays(today, -3), "15:40"),
      logs: [
        { at: isoAt(addDays(today, -3), "15:10"), action: "submit", from: null, to: "pending", by: "顾客小周", note: "提交跨日预约，已锁定两日工位与技师" },
        { at: isoAt(addDays(today, -3), "15:40"), action: "confirm", from: "pending", to: "confirmed", by: "老板林", note: "确认跨日工单" },
      ],
    });

    /* 4) 阿明 · 待确认精洗：后天 14:00，1号工位 阿凯，沪A·AF008 */
    state.bookings.push({
      id: "bk_pending_aming",
      customerId: "cu_aming",
      vehicleId: "vh_aming_2",
      serviceId: "sv_detail",
      technicianId: "tech_kai",
      bayId: "bay_1",
      startDate: d2,
      startTime: "14:00",
      endDate: d2,
      endTime: "16:00",
      intervals: [{ date: d2, start: "14:00", end: "16:00" }],
      spanDays: 1,
      status: "pending",
      photos: [],
      cardId: null,
      redeemed: false,
      payment: null,
      createdAt: isoAt(today, "09:12"),
      updatedAt: isoAt(today, "09:12"),
      logs: [
        { at: isoAt(today, "09:12"), action: "submit", from: null, to: "pending", by: "顾客阿明", note: "提交预约，已锁定工位与技师时段（待确认亦占位）" },
      ],
    });

    /* 5) 阿珍 · 今日已到店精洗，可开始 / 上传照片 / 短单完工并核销 */
    state.bookings.push({
      id: "bk_arrived_zhen",
      customerId: "cu_zhen",
      vehicleId: "vh_zhen_1",
      serviceId: "sv_detail",
      technicianId: "tech_wei",
      bayId: "bay_2",
      startDate: today,
      startTime: "10:00",
      endDate: today,
      endTime: "12:00",
      intervals: [{ date: today, start: "10:00", end: "12:00" }],
      spanDays: 1,
      status: "arrived",
      photos: [
        { id: "ph_3", stage: "arrive", src: "assets/photos/arrive-1.svg", label: "演示占位图 · 到店 A", at: isoAt(today, "10:02"), by: "店员小陈" },
      ],
      cardId: null,
      redeemed: false,
      payment: null,
      createdAt: isoAt(addDays(today, -1), "18:20"),
      updatedAt: isoAt(today, "10:02"),
      logs: [
        { at: isoAt(addDays(today, -1), "18:20"), action: "submit", from: null, to: "pending", by: "顾客阿珍", note: "提交预约" },
        { at: isoAt(addDays(today, -1), "18:30"), action: "confirm", from: "pending", to: "confirmed", by: "店员小陈", note: "确认预约" },
        { at: isoAt(today, "10:02"), action: "arrive", from: "confirmed", to: "arrived", by: "店员小陈", note: "登记到店" },
      ],
    });

    /* 6) 小周 · 今日傍晚已确认洗车，可用于逾期未到或取消释放演示（与跨日单不冲突：不同工位与技师） */
    state.bookings.push({
      id: "bk_confirm_wash",
      customerId: "cu_zhou",
      vehicleId: "vh_zhou_1",
      serviceId: "sv_wash",
      technicianId: "tech_kai",
      bayId: "bay_1",
      startDate: today,
      startTime: "16:30",
      endDate: today,
      endTime: "17:00",
      intervals: [{ date: today, start: "16:30", end: "17:00" }],
      spanDays: 1,
      status: "confirmed",
      photos: [],
      cardId: null,
      redeemed: false,
      payment: null,
      createdAt: isoAt(today, "08:00"),
      updatedAt: isoAt(today, "08:10"),
      logs: [
        { at: isoAt(today, "08:00"), action: "submit", from: null, to: "pending", by: "顾客小周", note: "提交预约" },
        { at: isoAt(today, "08:10"), action: "confirm", from: "confirmed", to: "confirmed", by: "店员小陈", note: "确认预约" },
      ],
    });
    /* fix typo in log from status */
    state.bookings[state.bookings.length - 1].logs[1].from = "pending";

    /* 次卡 */
    state.cards.push({
      id: "cd_aming_detail",
      customerId: "cu_aming",
      name: "精洗次卡（10 次）",
      total: 10,
      remaining: 7,
      applicableServiceIds: ["sv_wash", "sv_detail"],
      status: "active",
      demoClaim: false,
      issuedAt: isoAt(addDays(today, -90), "10:00"),
      updatedAt: isoAt(dMinus30, "16:05"),
      issuedBy: "老板林",
    });
    state.cardLedger.push(
      { id: "ld_1", cardId: "cd_aming_detail", bookingId: null, type: "issue", delta: 10, remainingAfter: 10, at: isoAt(addDays(today, -90), "10:00"), operator: "老板林", note: "老板发放次卡（凭证发放）" },
      { id: "ld_2", cardId: "cd_aming_detail", bookingId: "bk_hist_1", type: "redeem", delta: -1, remainingAfter: 9, at: isoAt(addDays(today, -70), "11:00"), operator: "店员小陈", note: "到店核销扣 1 次" },
      { id: "ld_3", cardId: "cd_aming_detail", bookingId: "bk_hist_2", type: "redeem", delta: -1, remainingAfter: 8, at: isoAt(addDays(today, -50), "11:00"), operator: "店员小陈", note: "到店核销扣 1 次" },
      { id: "ld_4", cardId: "cd_aming_detail", bookingId: "bk_done_detail", type: "redeem", delta: -1, remainingAfter: 7, at: isoAt(dMinus30, "16:05"), operator: "店员小陈", note: "到店核销扣 1 次" }
    );
    state.cards.push({
      id: "cd_zhou_empty",
      customerId: "cu_zhou",
      name: "洗车次卡（已用尽）",
      total: 5,
      remaining: 0,
      applicableServiceIds: ["sv_wash"],
      status: "active",
      demoClaim: false,
      issuedAt: isoAt(addDays(today, -120), "10:00"),
      updatedAt: isoAt(addDays(today, -5), "10:00"),
      issuedBy: "老板林",
    });
    state.cardLedger.push(
      { id: "ld_5", cardId: "cd_zhou_empty", bookingId: null, type: "issue", delta: 5, remainingAfter: 5, at: isoAt(addDays(today, -120), "10:00"), operator: "老板林", note: "老板发放次卡（凭证发放）" },
      { id: "ld_6", cardId: "cd_zhou_empty", bookingId: "bk_hist_z1", type: "redeem", delta: -1, remainingAfter: 0, at: isoAt(addDays(today, -5), "10:00"), operator: "店员小陈", note: "最后一次核销，余次为 0（历史演示）" }
    );
    /* 将余次为 0 的流水补齐到 0：上面简化为最后一条直接到 0，测试余次不足即可 */

    state.notices.push({
      id: "nt_1",
      at: isoAt(today, "09:12"),
      read: false,
      role: "staff",
      customerId: null,
      title: "新预约待确认",
      body: "阿明 预约了「精洗护理」，请确认。",
      bookingId: "bk_pending_aming",
    });

    state.placeholders = PLACEHOLDERS;
    state.actors = {
      customer: { role: "customer", customerId: "cu_aming", staffId: null, label: "顾客阿明" },
      staff: { role: "staff", customerId: null, staffId: "st_chen", label: "店员小陈" },
      boss: { role: "boss", customerId: null, staffId: "st_lin", label: "老板林" },
    };
    return state;
  }

  return { createSeed: createSeed, PLACEHOLDERS: PLACEHOLDERS };
});
