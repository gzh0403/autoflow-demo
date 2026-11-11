#!/usr/bin/env node
/**
 * AutoFlow 业务规则轻量单测：冲突锁、释放占位、扣次、越权拒绝、状态机。
 * 运行：在本目录上级执行  node tests/rules.test.js
 */
"use strict";

var path = require("path");
var rules = require(path.join(__dirname, "../js/rules.js"));
var data = require(path.join(__dirname, "../js/data.js"));

var passed = 0;
var failed = 0;
var errors = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log("  ok  " + name);
  } else {
    failed += 1;
    errors.push(name + (detail ? " —— " + detail : ""));
    console.log("  FAIL  " + name + (detail ? " —— " + detail : ""));
  }
}

function seed() {
  return data.createSeed(new Date(2026, 10, 11, 9, 30, 0)); // 2026-11-11 09:30 本地
}

function actor(state, role) {
  return state.actors[role];
}

function booking(state, id) {
  return rules.findById(state.bookings, id);
}

console.log("\n== 状态机 ==");
(function () {
  var state = seed();
  var staff = actor(state, "staff");
  var now = new Date(2026, 10, 11, 9, 30, 0);

  var r = rules.applyTransition(state, staff, "bk_pending_aming", "confirm", {}, now);
  assert("待确认可由店员确认", r.ok && r.state && booking(r.state, "bk_pending_aming").status === "confirmed", r.message);

  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "arrive", {}, now);
  assert("已确认可到店", r.ok && booking(r.state, "bk_pending_aming").status === "arrived", r.message);

  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "start", {}, now);
  assert("已到店可开始施工", r.ok && booking(r.state, "bk_pending_aming").status === "in_progress", r.message);

  var mid = r.state;
  r = rules.applyTransition(mid, staff, "bk_pending_aming", "finish", {}, now);
  assert("施工中可完工进入待交车", r.ok && booking(r.state, "bk_pending_aming").status === "ready", r.message);

  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "checkout", { payMethod: "cash" }, now);
  assert("待交车可交车核销至已完成", r.ok && booking(r.state, "bk_pending_aming").status === "completed", r.message);
  assert("核销后写入消费记录", r.state.consumptions.some(function (c) { return c.bookingId === "bk_pending_aming"; }));

  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "checkout", { payMethod: "cash" }, now);
  assert("已完成不能再次核销", !r.ok, r.message);

  r = rules.applyTransition(state, staff, "bk_pending_aming", "arrive", {}, now);
  assert("待确认不能直接到店", !r.ok);

  r = rules.applyTransition(state, staff, "bk_arrived_zhen", "confirm", {}, now);
  assert("已到店不能再确认", !r.ok);
})();

console.log("\n== 短单合并完工核销 ==");
(function () {
  var state = seed();
  var staff = actor(state, "staff");
  var now = new Date(2026, 10, 11, 11, 0, 0);
  var r = rules.applyTransition(state, staff, "bk_arrived_zhen", "start", {}, now);
  r = rules.applyTransition(r.state, staff, "bk_arrived_zhen", "finish_and_checkout", { payMethod: "cash" }, now);
  assert("精洗短单可一步完工并核销", r.ok && booking(r.state, "bk_arrived_zhen").status === "completed", r.message);
  var logs = booking(r.state, "bk_arrived_zhen").logs;
  assert("短单仍写入完工与核销两步日志", logs.some(function (l) { return l.action === "finish"; }) && logs.some(function (l) { return l.action === "checkout" && l.to === "completed"; }));

  state = seed();
  r = rules.applyTransition(state, staff, "bk_wrap_zhou", "arrive", {}, now);
  /* wrap is confirmed, arrive is allowed */
  r = rules.applyTransition(r.state, staff, "bk_wrap_zhou", "start", {}, now);
  r = rules.applyTransition(r.state, staff, "bk_wrap_zhou", "finish_and_checkout", { payMethod: "cash" }, now);
  assert("跨日长单不可一步合并核销", !r.ok, r.message);
})();

console.log("\n== 越权拒绝 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var staff = actor(state, "staff");
  var now = new Date(2026, 10, 11, 9, 30, 0);

  var r = rules.applyTransition(state, customer, "bk_pending_aming", "confirm", {}, now);
  assert("顾客不能确认预约", !r.ok && /不能确认/.test(r.message), r.message);

  r = rules.applyTransition(state, customer, "bk_arrived_zhen", "start", {}, now);
  assert("顾客不能改写施工状态", !r.ok, r.message);

  r = rules.applyTransition(state, customer, "bk_arrived_zhen", "checkout", { payMethod: "cash" }, now);
  assert("顾客不能核销", !r.ok, r.message);

  r = rules.applyTransition(state, customer, "bk_wrap_zhou", "cancel", {}, now);
  assert("顾客不能取消他人预约", !r.ok, r.message);

  r = rules.updateService(state, staff, { id: "sv_detail", price: 1, field: "price" });
  assert("店员不能改价格", !r.ok && /价格/.test(r.message), r.message);

  r = rules.updateSchedule(state, staff, { technicianId: "tech_kai", weekday: 1, working: false });
  assert("店员不能改排班", !r.ok, r.message);

  r = rules.can(staff, "view_dashboard");
  assert("店员不能看全店经营看板", !r.ok, r.message);

  r = rules.can(staff, "grant_role");
  assert("不允许空表自提/演示赋权", !r.ok, r.message);

  r = rules.changeCardTimesDirect();
  assert("禁止无凭证直接改次数", !r.ok, r.message);

  r = rules.issueCard(state, staff, { customerId: "cu_aming", total: 5, name: "非法发放" });
  assert("店员不能发放次卡", !r.ok, r.message);

  r = rules.addVehicle(state, customer, { customerId: "cu_zhou", plate: "沪Z·HACK", model: "X", color: "黑" });
  assert("顾客不能给他人建车档", !r.ok, r.message);
})();

console.log("\n== 跨日工位占用与冲突锁 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 9, 30, 0);
  /* 小周跨日占用 today+tomorrow，3 号贴膜工位 + 技师小河 */

  /* 预置跨日单占用 11 日与 12 日；12 日尚未开始，用以验证第二天区间锁而非“已过期”拦截。
     贴膜单不得改分到精洗工位，因此技师冲突用精洗项目 + 小河来隔离。 */
  var r = rules.submitBooking(state, customer, {
    serviceId: "sv_detail",
    vehicleId: "vh_aming_1",
    technicianId: "tech_he",
    startDate: "2026-11-12",
    startTime: "10:00",
  }, now);
  assert("同一技师跨日时段冲突应被拒绝", !r.ok && /小河/.test(r.message), r.message);

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_color",
    vehicleId: "vh_aming_1",
    technicianId: "tech_wei",
    bayId: "bay_3",
    startDate: "2026-11-12",
  }, now);
  assert("同一工位跨日时段冲突应被拒绝", !r.ok && /3号贴膜工位/.test(r.message), r.message);

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_detail",
    vehicleId: "vh_aming_1",
    technicianId: "tech_kai",
    startDate: "2026-11-12",
    startTime: "10:00",
  }, now);
  assert("不同工位与技师不冲突，可预约", r.ok, r.message);

  var built = rules.buildIntervals(
    rules.findById(state.services, "sv_ppf"),
    "2026-11-11",
    "09:00",
    { start: "09:00", end: "18:00" }
  );
  assert("跨日项目生成两个同日区间", built.intervals && built.intervals.length === 2, JSON.stringify(built));
  assert(
    "跨日区间覆盖两个营业日全时段",
    built.intervals[0].date === "2026-11-11" &&
      built.intervals[1].date === "2026-11-12" &&
      built.intervals[0].start === "09:00" &&
      built.intervals[1].end === "18:00"
  );

  var wrap = booking(state, "bk_wrap_zhou");
  assert("预置跨日工单含两日占用", wrap.intervals.length === 2 && wrap.spanDays === 2);
  assert("待确认预约也占用资源", rules.isOccupying("pending"));
})();

console.log("\n== 取消与逾期未到必须释放占位 ==");
(function () {
  var state = seed();
  var staff = actor(state, "staff");
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 9, 30, 0);

  var r = rules.applyTransition(state, staff, "bk_wrap_zhou", "cancel", {}, now);
  assert("店员可取消已确认跨日单", r.ok && booking(r.state, "bk_wrap_zhou").status === "cancelled", r.message);
  assert("取消后不再计入占用", !rules.isOccupying(booking(r.state, "bk_wrap_zhou").status));

  var again = rules.submitBooking(r.state, customer, {
    serviceId: "sv_color",
    vehicleId: "vh_aming_1",
    technicianId: "tech_he",
    startDate: "2026-11-12",
  }, now);
  assert("释放后同一工位/技师可再次预约", again.ok, again.message);

  state = seed();
  r = rules.applyTransition(state, staff, "bk_confirm_wash", "noshow", {}, now);
  assert("可标记逾期未到", r.ok && booking(r.state, "bk_confirm_wash").status === "noshow", r.message);
  var slot = rules.listAvailableSlots(r.state, {
    serviceId: "sv_wash",
    technicianId: "tech_kai",
    date: "2026-11-11",
    now: now,
  });
  assert(
    "逾期未到后原时段应释放",
    slot.ok && slot.slots.some(function (s) { return s.startTime === "16:30"; }),
    slot.slots && slot.slots.map(function (s) { return s.startTime; }).join(",")
  );

  /* 待确认占用：阿明后天 14:00-16:00 阿凯 1号工位，他人不能再约同一段 */
  var conflictPending = rules.submitBooking(state, actor(state, "boss"), {
    customerId: "cu_zhen",
    serviceId: "sv_detail",
    vehicleId: "vh_zhen_1",
    technicianId: "tech_kai",
    startDate: "2026-11-13",
    startTime: "14:00",
  }, now);
  assert("待确认亦锁定时段，冲突应拒绝", !conflictPending.ok, conflictPending.message);
})();

console.log("\n== 顾客取消提前量 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  /* 待确认：后天，顾客可取消 */
  var now = new Date(2026, 10, 11, 9, 30, 0);
  var r = rules.applyTransition(state, customer, "bk_pending_aming", "cancel", {}, now);
  assert("顾客可取消自己的待确认预约", r.ok, r.message);

  /* 构造一笔已确认且即将开始的短单给阿明，取消应失败 */
  state = seed();
  var staff = actor(state, "staff");
  /* 使用 bk_confirm_wash 是小周的。给阿明提交一笔今天很近的？今天 09:30，最早可约时段可能在 10:00 之后。
     改用：先确认阿明后天的单，再用「临近开始」的 now 去取消。 */
  r = rules.applyTransition(state, staff, "bk_pending_aming", "confirm", {}, now);
  var near = new Date(2026, 10, 13, 13, 0, 0); /* 开始前 1 小时，提前量是 2 小时 */
  var c = rules.applyTransition(r.state, customer, "bk_pending_aming", "cancel", {}, near);
  assert("已确认且不足提前量时顾客不能取消", !c.ok && /提前/.test(c.message), c.message);
  c = rules.applyTransition(r.state, staff, "bk_pending_aming", "cancel", {}, near);
  assert("店员在不足提前量时仍可取消", c.ok, c.message);
})();

console.log("\n== 次卡凭证扣次 ==");
(function () {
  var state = seed();
  var staff = actor(state, "staff");
  var boss = actor(state, "boss");
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 11, 0, 0);

  var r = rules.applyTransition(state, staff, "bk_arrived_zhen", "start", {}, now);
  /* 阿珍没有次卡，用阿明的卡应失败 */
  r = rules.applyTransition(r.state, staff, "bk_arrived_zhen", "finish_and_checkout", {
    payMethod: "card",
    cardId: "cd_aming_detail",
  }, now);
  assert("不能核销他人次卡", !r.ok, r.message);

  /* 小周洗车次卡余次为 0：先到店再尝试扣次 */
  state = seed();
  r = rules.applyTransition(state, staff, "bk_confirm_wash", "arrive", {}, now);
  r = rules.applyTransition(r.state, staff, "bk_confirm_wash", "start", {}, now);
  r = rules.applyTransition(r.state, staff, "bk_confirm_wash", "finish_and_checkout", {
    payMethod: "card",
    cardId: "cd_zhou_empty",
  }, now);
  assert("余次不足应拒绝扣次", !r.ok && /余次不足/.test(r.message), r.message);

  /* 阿明待确认精洗，走完后用自己的次卡扣一次 */
  state = seed();
  var n = new Date(2026, 10, 13, 14, 5, 0);
  r = rules.applyTransition(state, staff, "bk_pending_aming", "confirm", {}, now);
  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "arrive", {}, n);
  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "start", {}, n);
  var before = rules.findById(r.state.cards, "cd_aming_detail").remaining;
  r = rules.applyTransition(r.state, staff, "bk_pending_aming", "finish_and_checkout", {
    payMethod: "card",
    cardId: "cd_aming_detail",
  }, n);
  assert("核销时余次足够则扣 1 次", r.ok, r.message);
  var after = rules.findById(r.state.cards, "cd_aming_detail").remaining;
  assert("余次减 1", after === before - 1, "before=" + before + " after=" + after);
  assert(
    "写入扣次流水",
    r.state.cardLedger.some(function (l) {
      return l.bookingId === "bk_pending_aming" && l.type === "redeem" && l.delta === -1;
    })
  );

  var again = rules.applyTransition(r.state, staff, "bk_pending_aming", "finish_and_checkout", {
    payMethod: "card",
    cardId: "cd_aming_detail",
  }, n);
  assert("同一工单不能重复扣次/核销", !again.ok, again.message);

  var claim = rules.issueCard(state, customer, { demoClaim: true, total: 3, name: "演示次卡", applicableServiceIds: ["sv_wash"] }, now);
  assert("顾客可领取演示次卡（凭证发放）", claim.ok && claim.card.remaining === 3, claim.message);
  var claim2 = rules.issueCard(claim.state, customer, { demoClaim: true, total: 3, name: "演示次卡" }, now);
  assert("不可重复领取有效演示次卡", !claim2.ok, claim2.message);

  var issued = rules.issueCard(state, boss, { customerId: "cu_zhen", total: 5, name: "阿珍精洗卡", applicableServiceIds: ["sv_detail"] }, now);
  assert("老板可发放次卡并写流水", issued.ok && issued.state.cardLedger.some(function (l) { return l.cardId === issued.card.id && l.type === "issue"; }), issued.message);
})();

console.log("\n== 车辆档案 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 9, 30, 0);
  var amingCars = state.vehicles.filter(function (v) { return v.customerId === "cu_aming"; });
  assert("预置顾客阿明名下有两辆车", amingCars.length === 2);

  var r = rules.submitBooking(state, customer, {
    serviceId: "sv_wash",
    vehicleId: "vh_zhen_1",
    technicianId: "tech_kai",
    startDate: "2026-11-14",
    startTime: "11:00",
  }, now);
  assert("不能用他人车辆预约", !r.ok, r.message);

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_wash",
    technicianId: "tech_kai",
    startDate: "2026-11-14",
    startTime: "11:00",
  }, now);
  assert("预约必须绑定车辆", !r.ok && /车辆/.test(r.message), r.message);

  r = rules.addVehicle(state, customer, { plate: "沪A·AF900", model: "试驾车型", color: "石墨" }, now);
  assert("顾客可为自己建档", r.ok && r.vehicle.plate === "沪A·AF900", r.message);

  r = rules.addVehicle(state, customer, { plate: "沪A·AF001", model: "重复", color: "红" }, now);
  assert("重复车牌拒绝", !r.ok, r.message);

  r = rules.addVehicle(state, customer, { plate: "", model: "X", color: "红" }, now);
  assert("缺车牌拒绝", !r.ok);
})();

console.log("\n== 照片与质保 ==");
(function () {
  var state = seed();
  var staff = actor(state, "staff");
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 11, 0, 0);

  var r = rules.uploadPhoto(state, customer, { bookingId: "bk_arrived_zhen", stage: "before", src: "assets/photos/before-1.svg" }, now);
  assert("顾客不能上传施工照片", !r.ok, r.message);

  r = rules.uploadPhoto(state, staff, { bookingId: "bk_arrived_zhen", stage: "before", src: "assets/photos/before-1.svg", label: "演示占位图 · 施工前 A" }, now);
  assert("店员可登记演示占位图", r.ok && booking(r.state, "bk_arrived_zhen").photos.length >= 2, r.message);

  r = rules.addWarrantyStandalone(state, staff, {
    bookingId: "bk_done_sun",
    startDate: "2026-09-12",
    endDate: "2029-09-12",
    note: "重复",
  }, now);
  assert("同一工单不能重复登记质保", !r.ok, r.message);

  var w = rules.findById(state.warranties, "wr_sun_aming");
  assert("预置质保绑定阿明的车 沪A·AF001", w && w.vehicleId === "vh_aming_1" && w.customerId === "cu_aming");
})();

console.log("\n== 预约提交基本校验 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var now = new Date(2026, 10, 11, 9, 30, 0);
  var r = rules.submitBooking(state, customer, {
    serviceId: "sv_detail",
    vehicleId: "vh_aming_1",
    technicianId: "tech_kai",
    startDate: "2026-11-11",
    startTime: "09:00",
  }, now);
  assert("不能预约已经开始或过去的时段", !r.ok, r.message);

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_detail",
    vehicleId: "vh_aming_1",
    technicianId: "tech_he",
    startDate: "2026-11-14",
    startTime: "10:00",
  }, now);
  /* 小河 specialties 不含精洗，但规则层目前未强制技师擅长项目，只检查排班。可接受或加校验。此处只确认能给出明确结果。 */
  assert("提交接口返回明确结果", typeof r.ok === "boolean");
})();

console.log("\n== 工位类型必须匹配且不得回退 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var staff = actor(state, "staff");
  var now = new Date(2026, 10, 11, 9, 30, 0);

  var r = rules.submitBooking(state, customer, {
    serviceId: "sv_color",
    vehicleId: "vh_aming_1",
    technicianId: "tech_wei",
    startDate: "2026-11-12",
  }, now);
  assert(
    "贴膜工位被占且换空闲技师时不得回退到精洗工位",
    !r.ok && /类型|贴膜工位/.test(r.message) && (!r.booking || r.booking.bayId !== "bay_1") && (!r.booking || r.booking.bayId !== "bay_2"),
    r.message
  );

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_color",
    vehicleId: "vh_aming_1",
    technicianId: "tech_wei",
    bayId: "bay_1",
    startDate: "2026-11-12",
  }, now);
  assert(
    "明确把贴膜单分到 1 号精洗工位应被拒绝",
    !r.ok && /贴膜单不能分到精洗工位|类型|贴膜工位/.test(r.message),
    r.message
  );

  var cancelled = rules.applyTransition(state, staff, "bk_wrap_zhou", "cancel", {}, now);
  assert("取消小周跨日单以便释放贴膜工位", cancelled.ok, cancelled.message);
  var again = rules.submitBooking(cancelled.state, customer, {
    serviceId: "sv_color",
    vehicleId: "vh_aming_1",
    technicianId: "tech_wei",
    startDate: "2026-11-12",
  }, now);
  assert(
    "取消后同类型贴膜工位可再被预约",
    again.ok && again.booking && again.booking.bayId === "bay_3",
    again.message
  );
})();

console.log("\n== 同一车辆同一时段不可重叠 ==");
(function () {
  var state = seed();
  var customer = actor(state, "customer");
  var staff = actor(state, "staff");
  var now = new Date(2026, 10, 11, 9, 30, 0);
  /* 阿明 沪A·AF008（vh_aming_2）后天 14:00-16:00 已有待确认精洗，占用 1 号工位与阿凯 */

  var r = rules.submitBooking(state, customer, {
    serviceId: "sv_wash",
    vehicleId: "vh_aming_2",
    technicianId: "tech_wei",
    startDate: "2026-11-13",
    startTime: "14:00",
  }, now);
  assert(
    "同车同一时段换工位与技师再约应被拒绝",
    !r.ok && /沪A·AF008|不可重叠|该车辆/.test(r.message),
    r.message
  );

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_wash",
    vehicleId: "vh_aming_2",
    technicianId: "tech_wei",
    startDate: "2026-11-13",
    startTime: "10:00",
  }, now);
  assert("同车不重叠时段可以预约", r.ok && r.booking && r.booking.vehicleId === "vh_aming_2", r.message);

  r = rules.submitBooking(state, customer, {
    serviceId: "sv_wash",
    vehicleId: "vh_aming_1",
    technicianId: "tech_wei",
    startDate: "2026-11-13",
    startTime: "14:00",
  }, now);
  assert("阿明另一台车在同一时段可以预约", r.ok && r.booking && r.booking.vehicleId === "vh_aming_1", r.message);

  var self = rules.checkConflict(state, {
    bayId: "bay_2",
    technicianId: "tech_wei",
    vehicleId: "vh_aming_2",
    intervals: [{ date: "2026-11-13", start: "14:00", end: "16:00" }],
    exceptId: "bk_pending_aming",
  });
  assert("改约时 exceptId 不与自身冲突", self.ok, self.message);

  var cancelled = rules.applyTransition(state, staff, "bk_pending_aming", "cancel", {}, now);
  assert("取消阿明待确认精洗", cancelled.ok, cancelled.message);
  var again = rules.submitBooking(cancelled.state, customer, {
    serviceId: "sv_wash",
    vehicleId: "vh_aming_2",
    technicianId: "tech_wei",
    startDate: "2026-11-13",
    startTime: "14:00",
  }, now);
  assert("取消后同车同段可再约", again.ok, again.message);
})();

console.log("\n-----------");
console.log("通过 " + passed + " 项，失败 " + failed + " 项");
if (errors.length) {
  console.log("失败明细：");
  errors.forEach(function (e) { console.log(" - " + e); });
  process.exit(1);
}
process.exit(0);
