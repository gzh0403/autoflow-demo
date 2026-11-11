/**
 * AutoFlow 业务规则：状态机、工位跨日占用、次卡凭证、权限。
 * 可在浏览器与 Node 测试中共用。权限必须在此校验，不能只靠界面藏按钮。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AFRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STATUS = {
    pending: "pending",
    confirmed: "confirmed",
    arrived: "arrived",
    in_progress: "in_progress",
    ready: "ready",
    completed: "completed",
    cancelled: "cancelled",
    noshow: "noshow",
  };

  var STATUS_LABEL = {
    pending: "待确认",
    confirmed: "已确认",
    arrived: "已到店",
    in_progress: "施工中",
    ready: "待交车",
    completed: "已完成",
    cancelled: "已取消",
    noshow: "逾期未到",
  };

  var OCCUPYING = ["pending", "confirmed", "arrived", "in_progress", "ready"];
  var TERMINAL = ["completed", "cancelled", "noshow"];

  var PHOTO_STAGES = [
    { id: "arrive", label: "到店" },
    { id: "before", label: "施工前" },
    { id: "during", label: "施工中" },
    { id: "after", label: "完工" },
  ];

  var PAY_METHODS = [
    { id: "cash", label: "到店现金（仅记录，非真实支付）" },
    { id: "pos", label: "到店刷卡（仅记录，非真实支付）" },
    { id: "qr", label: "到店扫码当面收（仅记录，非接口）" },
    { id: "card", label: "次卡核销" },
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateStr(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseDate(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0, 0);
  }

  function addDays(s, n) {
    var d = parseDate(s);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function weekday(s) {
    return parseDate(s).getDay();
  }

  function toMinutes(hm) {
    var p = String(hm).split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function fromMinutes(m) {
    return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  }

  function nowParts(now) {
    now = now || new Date();
    return {
      date: dateStr(now),
      time: pad(now.getHours()) + ":" + pad(now.getMinutes()),
      dateTime: now.getTime(),
    };
  }

  function intervalToStamp(date, hm) {
    var d = parseDate(date);
    var m = toMinutes(hm);
    return d.getTime() + m * 60000;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function findById(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function isOccupying(status) {
    return OCCUPYING.indexOf(status) !== -1;
  }

  function isShortJob(service) {
    if (!service) return true;
    if (service.durationDays && service.durationDays >= 2) return false;
    return !service.durationDays && (service.durationMinutes || 0) <= 180;
  }

  function storeHours(state) {
    var h = (state.store && state.store.hours) || { start: "09:00", end: "18:00" };
    return { start: h.start || "09:00", end: h.end || "18:00" };
  }

  function buildIntervals(service, startDate, startTime, hours) {
    hours = hours || { start: "09:00", end: "18:00" };
    var intervals = [];
    if (service.durationDays && service.durationDays >= 2) {
      for (var i = 0; i < service.durationDays; i++) {
        intervals.push({
          date: addDays(startDate, i),
          start: hours.start,
          end: hours.end,
        });
      }
    } else {
      var start = startTime || hours.start;
      var endMin = toMinutes(start) + (service.durationMinutes || 60);
      var close = toMinutes(hours.end);
      if (endMin > close) return { error: "该时段会超出当日营业时间，请改选更早的开始时间。" };
      intervals.push({ date: startDate, start: start, end: fromMinutes(endMin) });
    }
    return { intervals: intervals };
  }

  function intervalsOverlap(a, b) {
    if (a.date !== b.date) return false;
    return a.start < b.end && b.start < a.end;
  }

  function bookingIntervalsOverlap(aIntervals, bIntervals) {
    for (var i = 0; i < aIntervals.length; i++) {
      for (var j = 0; j < bIntervals.length; j++) {
        if (intervalsOverlap(aIntervals[i], bIntervals[j])) return aIntervals[i];
      }
    }
    return null;
  }

  function occupyingBookings(state, exceptId) {
    return (state.bookings || []).filter(function (b) {
      return b.id !== exceptId && isOccupying(b.status);
    });
  }

  function formatInterval(iv) {
    return iv.date + " " + iv.start + "–" + iv.end;
  }

  /**
   * 工位与技师都是可预约资源。跨日占用是连续多个营业日的工位与技师区间锁，
   * 不是把单日工位简单改个名字。冲突检测与同日区间锁使用同一套重叠判断。
   */
  function checkConflict(state, opts) {
    var bayId = opts.bayId;
    var technicianId = opts.technicianId;
    var vehicleId = opts.vehicleId;
    var intervals = opts.intervals || [];
    var exceptId = opts.exceptId;
    var conflicts = [];
    var list = occupyingBookings(state, exceptId);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var hit = bookingIntervalsOverlap(intervals, b.intervals || []);
      if (!hit) continue;
      var service = findById(state.services, b.serviceId);
      var customer = findById(state.customers, b.customerId);
      var bay = findById(state.bays, b.bayId);
      var tech = findById(state.technicians, b.technicianId);
      var vehicle = findById(state.vehicles, b.vehicleId);
      var who =
        (customer ? "顾客" + customer.name : "") +
        (tech ? (customer ? "，技师" : "技师") + tech.name : "");
      var whoText = who ? "（" + who + "）" : "";
      if (bayId && b.bayId === bayId) {
        conflicts.push({
          type: "bay",
          resourceId: bayId,
          bookingId: b.id,
          interval: hit,
          message:
            (bay ? bay.name : "工位") +
            " 在 " +
            formatInterval(hit) +
            " 已被「" +
            (service ? service.name : "其他项目") +
            "」占用" +
            whoText +
            "。请改期或更换技师，查看是否有空闲档期。",
        });
      }
      if (technicianId && b.technicianId === technicianId) {
        conflicts.push({
          type: "technician",
          resourceId: technicianId,
          bookingId: b.id,
          interval: hit,
          message:
            (tech ? "技师" + tech.name : "技师") +
            " 在 " +
            formatInterval(hit) +
            " 已有「" +
            (service ? service.name : "其他项目") +
            "」档期" +
            (customer ? "（顾客" + customer.name + "）" : "") +
            "。请改期或更换技师。",
        });
      }
      if (vehicleId && b.vehicleId === vehicleId) {
        conflicts.push({
          type: "vehicle",
          resourceId: vehicleId,
          bookingId: b.id,
          interval: hit,
          message:
            "该车辆" +
            (vehicle && vehicle.plate ? " " + vehicle.plate : "") +
            " 在 " +
            formatInterval(hit) +
            " 已有其他预约「" +
            (service ? service.name : "其他项目") +
            "」，同一时段不可重叠。请改期。",
        });
      }
    }
    if (conflicts.length) {
      return { ok: false, conflicts: conflicts, message: conflicts[0].message };
    }
    return { ok: true, conflicts: [] };
  }

  function isTechWorking(state, technicianId, date) {
    var tech = findById(state.technicians, technicianId);
    if (!tech || tech.enabled === false) return false;
    var day = weekday(date);
    var sched = (state.schedules || []).filter(function (s) {
      return s.technicianId === technicianId;
    });
    if (!sched.length) return true;
    return sched.some(function (s) {
      return s.weekday === day && s.working !== false;
    });
  }

  function bayTypeLabel(type) {
    if (type === "wash") return "精洗工位";
    if (type === "wrap") return "贴膜工位";
    return "对应类型工位";
  }

  function bayTypeMismatchMessage(service, bay) {
    var need = bayTypeLabel(service && service.bayType);
    var got = (bay && bay.name) || bayTypeLabel(bay && bay.type);
    var specific = "";
    if (service && service.bayType === "wrap" && bay && bay.type === "wash") {
      specific = "贴膜单不能分到精洗工位。";
    } else if (service && service.bayType === "wash" && bay && bay.type === "wrap") {
      specific = "精洗单不能分到贴膜工位。";
    }
    return (specific ? specific : "") + "该项目需要" + need + "，不能分到" + got + "。类型不符即不可用。";
  }

  function enabledBays(state, requiredType) {
    var list = (state.bays || []).filter(function (b) {
      return b.enabled !== false;
    });
    if (!requiredType) return list;
    return list.filter(function (b) {
      return b.type === requiredType;
    });
  }

  function pickBay(state, service, technicianId, intervals, exceptId, vehicleId) {
    var requiredType = service && service.bayType;
    var bays = enabledBays(state, requiredType);
    if (requiredType && !bays.length) {
      return {
        ok: false,
        message:
          "该项目需要" +
          bayTypeLabel(requiredType) +
          "，当前没有可用的对应类型工位；类型不符即不可用。",
      };
    }
    if (vehicleId) {
      var vehicleLock = checkConflict(state, {
        vehicleId: vehicleId,
        intervals: intervals,
        exceptId: exceptId,
      });
      if (!vehicleLock.ok) {
        return { ok: false, message: vehicleLock.message, conflicts: vehicleLock.conflicts };
      }
    }
    for (var i = 0; i < bays.length; i++) {
      var r = checkConflict(state, {
        bayId: bays[i].id,
        technicianId: technicianId,
        intervals: intervals,
        exceptId: exceptId,
        vehicleId: vehicleId,
      });
      if (r.ok) return { ok: true, bay: bays[i] };
    }
    var last = checkConflict(state, {
      bayId: bays[0] && bays[0].id,
      technicianId: technicianId,
      intervals: intervals,
      exceptId: exceptId,
      vehicleId: vehicleId,
    });
    return {
      ok: false,
      message: last.message || "所选日期与时段没有空闲的对应类型工位，请改期或更换技师。",
    };
  }

  function listAvailableSlots(state, opts) {
    var service = findById(state.services, opts.serviceId);
    var technicianId = opts.technicianId;
    var date = opts.date;
    var now = opts.now || new Date();
    if (!service) return { ok: false, message: "未找到服务项目。", slots: [] };
    if (service.enabled === false) return { ok: false, message: "该项目已下架。", slots: [] };
    if (!isTechWorking(state, technicianId, date)) {
      return { ok: false, message: "该技师当天未排班。", slots: [] };
    }
    var hours = storeHours(state);
    var built = buildIntervals(service, date, service.durationDays >= 2 ? hours.start : hours.start, hours);
    if (built.error) return { ok: false, message: built.error, slots: [] };

    if (service.durationDays >= 2) {
      var conflict = pickBay(state, service, technicianId, built.intervals, opts.exceptId, opts.vehicleId);
      var np = nowParts(now);
      var started = date < np.date || (date === np.date && hours.start <= np.time);
      if (started) return { ok: true, slots: [], message: "跨日项目请选择尚未开始的日期。" };
      if (!conflict.ok) return { ok: true, slots: [], blockedReason: conflict.message };
      return {
        ok: true,
        slots: [
          {
            startDate: date,
            startTime: hours.start,
            endDate: built.intervals[built.intervals.length - 1].date,
            endTime: hours.end,
            intervals: built.intervals,
            bayId: conflict.bay.id,
            bayName: conflict.bay.name,
            label:
              date +
              " 起共 " +
              service.durationDays +
              " 个工作日（" +
              built.intervals[0].date +
              " " +
              hours.start +
              " 至 " +
              built.intervals[built.intervals.length - 1].date +
              " " +
              hours.end +
              "，" +
              conflict.bay.name +
              "）",
          },
        ],
      };
    }

    var slots = [];
    var startMin = toMinutes(hours.start);
    var close = toMinutes(hours.end);
    var dur = service.durationMinutes || 60;
    var step = 30;
    var np2 = nowParts(now);
    for (var m = startMin; m + dur <= close; m += step) {
      var st = fromMinutes(m);
      if (date < np2.date || (date === np2.date && st <= np2.time)) continue;
      var ivs = buildIntervals(service, date, st, hours);
      if (ivs.error) continue;
      var picked = pickBay(state, service, technicianId, ivs.intervals, opts.exceptId, opts.vehicleId);
      if (!picked.ok) continue;
      slots.push({
        startDate: date,
        startTime: st,
        endDate: date,
        endTime: fromMinutes(m + dur),
        intervals: ivs.intervals,
        bayId: picked.bay.id,
        bayName: picked.bay.name,
        label: st + "–" + fromMinutes(m + dur) + "（" + picked.bay.name + "）",
      });
    }
    return { ok: true, slots: slots };
  }

  function fail(message, extra) {
    var r = { ok: false, message: message };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    }
    return r;
  }

  function ok(state, message, extra) {
    var r = { ok: true, state: state, message: message || "完成" };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    }
    return r;
  }

  function assertActor(actor) {
    if (!actor || !actor.role) return fail("未识别当前角色。");
    return null;
  }

  function can(actor, action, ctx) {
    ctx = ctx || {};
    if (!actor || !actor.role) return { ok: false, message: "未识别当前角色。" };
    var role = actor.role;

    var staffOrBoss = role === "staff" || role === "boss";
    var matrix = {
      view_dashboard: role === "boss",
      update_price: role === "boss",
      update_service: role === "boss",
      update_schedule: role === "boss",
      update_bay: role === "boss",
      update_store: role === "boss",
      grant_role: false,
      change_card_times_direct: false,
      issue_card: role === "boss" || (action === "claim_demo_card" && role === "customer"),
      claim_demo_card: role === "customer",
      confirm: staffOrBoss,
      arrive: staffOrBoss,
      start: staffOrBoss,
      finish: staffOrBoss,
      checkout: staffOrBoss,
      noshow: staffOrBoss,
      upload_photo: staffOrBoss,
      add_warranty: staffOrBoss,
      view_all_customers: staffOrBoss,
    };

    if (action === "cancel") {
      if (staffOrBoss) return { ok: true };
      if (role === "customer") return { ok: true };
      return { ok: false, message: "当前角色不能取消预约。" };
    }
    if (action === "submit_booking") {
      if (role === "customer" || staffOrBoss) return { ok: true };
      return { ok: false, message: "当前角色不能提交预约。" };
    }
    if (action === "add_vehicle" || action === "update_vehicle") {
      if (staffOrBoss) return { ok: true };
      if (role === "customer") {
        if (ctx.customerId && actor.customerId && ctx.customerId !== actor.customerId) {
          return { ok: false, message: "顾客只能维护自己的车辆档案。" };
        }
        return { ok: true };
      }
      return { ok: false, message: "当前角色不能维护车辆档案。" };
    }
    if (Object.prototype.hasOwnProperty.call(matrix, action)) {
      if (matrix[action]) return { ok: true };
      var messages = {
        view_dashboard: "店员不能查看全店经营看板。",
        update_price: "店员不能修改价格。只有老板可以改价。",
        update_service: "只有老板可以维护服务项目。",
        update_schedule: "店员不能改排班。只有老板可以调整排班。",
        update_bay: "只有老板可以管理工位。",
        update_store: "只有老板可以修改门店资料与规则。",
        grant_role: "演示环境不做真实开通。管理员开通禁止空表自提。",
        change_card_times_direct: "禁止无凭证直接改次数。请通过发放次卡或到店核销写入流水。",
        confirm: "顾客不能确认预约。",
        arrive: "顾客不能改写施工状态。",
        start: "顾客不能改写施工状态。",
        finish: "顾客不能改写施工状态。",
        checkout: "顾客不能核销。",
        noshow: "顾客不能标记逾期未到。",
        upload_photo: "顾客不能在演示中直接登记施工照片，请由店员或老板上传。",
        add_warranty: "顾客不能登记质保，请由店员或老板写入。",
        issue_card: "只有老板可以发放次卡。顾客可在会员页领取演示次卡。",
        claim_demo_card: "只有顾客可以领取自己的演示次卡。",
        view_all_customers: "顾客不能查看他人档案。",
      };
      return { ok: false, message: messages[action] || "当前角色无权执行该操作。" };
    }
    return { ok: false, message: "未知操作：" + action };
  }

  function appendLog(booking, entry) {
    booking.logs = booking.logs || [];
    booking.logs.push(entry);
  }

  function actorName(state, actor) {
    if (!actor) return "系统";
    if (actor.role === "customer") {
      var c = findById(state.customers, actor.customerId);
      return c ? "顾客" + c.name : "顾客";
    }
    if (actor.role === "staff") {
      var s = findById(state.staff, actor.staffId);
      return s ? "店员" + s.name : "店员";
    }
    if (actor.role === "boss") {
      var b = findById(state.staff, actor.staffId) || findById(state.staff, state.bossId);
      return b ? "老板" + b.name : "老板";
    }
    return "系统";
  }

  function nextId(state, prefix) {
    state._seq = state._seq || {};
    state._seq[prefix] = (state._seq[prefix] || 100) + 1;
    return prefix + "_" + state._seq[prefix];
  }

  function submitBooking(state, actor, payload, now) {
    var denied = assertActor(actor) || (can(actor, "submit_booking").ok ? null : can(actor, "submit_booking"));
    if (denied && denied.ok === false) return denied;
    state = deepClone(state);
    now = now || new Date();
    var service = findById(state.services, payload.serviceId);
    if (!service) return fail("请选择服务项目。");
    if (service.enabled === false) return fail("该项目已下架，无法预约。");
    var customerId = payload.customerId;
    if (actor.role === "customer") customerId = actor.customerId;
    if (!customerId) return fail("请选择顾客。");
    var vehicle = findById(state.vehicles, payload.vehicleId);
    if (!vehicle) return fail("预约必须绑定具体车辆。请先选择或新建车辆。");
    if (vehicle.customerId !== customerId) return fail("只能预约该顾客名下的车辆。");
    var tech = findById(state.technicians, payload.technicianId);
    if (!tech || tech.enabled === false) return fail("请选择可用技师。");
    if (!payload.startDate) return fail("请选择日期。");
    if (!isTechWorking(state, tech.id, payload.startDate)) return fail("该技师当天未排班。");

    var hours = storeHours(state);
    var startTime = service.durationDays >= 2 ? hours.start : payload.startTime;
    if (service.durationDays >= 2) {
      /* startTime 由营业时间决定 */
    } else if (!startTime) {
      return fail("请选择时段。");
    }
    var built = buildIntervals(service, payload.startDate, startTime, hours);
    if (built.error) return fail(built.error);
    var intervals = built.intervals;
    var np = nowParts(now);
    var first = intervals[0];
    if (first.date < np.date || (first.date === np.date && first.start <= np.time)) {
      return fail("不能预约已经开始或已经过去的时段。");
    }

    var bayId = payload.bayId;
    var bay = bayId ? findById(state.bays, bayId) : null;
    if (bay && bay.enabled === false) return fail("该工位已停用。");
    if (bay && service.bayType && bay.type !== service.bayType) {
      return fail(bayTypeMismatchMessage(service, bay));
    }
    if (!bay) {
      var picked = pickBay(state, service, tech.id, intervals, null, vehicle.id);
      if (!picked.ok) return fail(picked.message);
      bay = picked.bay;
      bayId = bay.id;
    } else {
      var conflict = checkConflict(state, {
        bayId: bayId,
        technicianId: tech.id,
        intervals: intervals,
        vehicleId: vehicle.id,
        exceptId: payload.exceptId,
      });
      if (!conflict.ok) return fail(conflict.message, { conflicts: conflict.conflicts });
    }

    var booking = {
      id: nextId(state, "bk"),
      customerId: customerId,
      vehicleId: vehicle.id,
      serviceId: service.id,
      technicianId: tech.id,
      bayId: bayId,
      startDate: intervals[0].date,
      startTime: intervals[0].start,
      endDate: intervals[intervals.length - 1].date,
      endTime: intervals[intervals.length - 1].end,
      intervals: intervals,
      spanDays: intervals.length,
      status: STATUS.pending,
      photos: [],
      cardId: null,
      redeemed: false,
      payment: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      logs: [
        {
          at: now.toISOString(),
          action: "submit",
          from: null,
          to: STATUS.pending,
          by: actorName(state, actor),
          note: "提交预约，已锁定工位与技师时段（待确认亦占位）",
        },
      ],
    };
    state.bookings.push(booking);
    addNotice(state, {
      role: "staff",
      title: "新预约待确认",
      body: customerName(state, customerId) + " 预约了「" + service.name + "」，请确认。",
      bookingId: booking.id,
    });
    return ok(state, "预约已提交，等待店员确认。工位与技师时段已占用。", { booking: booking });
  }

  function customerName(state, id) {
    var c = findById(state.customers, id);
    return c ? c.name : "顾客";
  }

  function addNotice(state, n) {
    state.notices = state.notices || [];
    state.notices.unshift({
      id: nextId(state, "nt"),
      at: new Date().toISOString(),
      read: false,
      role: n.role || "all",
      customerId: n.customerId || null,
      title: n.title,
      body: n.body,
      bookingId: n.bookingId || null,
    });
  }

  function noticeCopyForBooking(state, booking, role) {
    var label = STATUS_LABEL[booking.status] || booking.status;
    var sv = findById(state.services, booking.serviceId);
    var svName = (sv && sv.name) || "服务";
    var cu = findById(state.customers, booking.customerId);
    if (role === "staff" || role === "all") {
      var title =
        booking.status === STATUS.pending
          ? "新预约待确认"
          : booking.status === STATUS.confirmed
          ? "预约已确认"
          : booking.status === STATUS.completed
          ? "预约已完成"
          : "预约状态更新：" + label;
      var body =
        booking.status === STATUS.pending
          ? (cu ? cu.name + " " : "") + "预约了「" + svName + "」，请确认。"
          : (cu ? cu.name : "顾客") + "的「" + svName + "」当前状态为「" + label + "」。";
      return { title: title, body: body };
    }
    return {
      title: "预约状态更新：" + label,
      body: "您的「" + svName + "」已更新为「" + label + "」。",
    };
  }

  function noticeIsStale(n, booking) {
    var title = n.title || "";
    var body = n.body || "";
    var text = title + body;
    if (/待确认/.test(text) && booking.status !== STATUS.pending) return true;
    if (/已确认/.test(title) && booking.status !== STATUS.confirmed && booking.status !== STATUS.pending) return true;
    if (/已完成/.test(title) && booking.status !== STATUS.completed) return true;
    return false;
  }

  function syncBookingNotices(state, booking) {
    (state.notices || []).forEach(function (n) {
      if (!n || n.bookingId !== booking.id) return;
      if (!noticeIsStale(n, booking)) return;
      var copy = noticeCopyForBooking(state, booking, n.role);
      n.title = copy.title;
      n.body = copy.body;
    });
  }

  function leadOk(booking, state, now) {
    var hours = (state.settings && state.settings.cancelLeadHours) || 2;
    var start = intervalToStamp(booking.startDate, booking.startTime);
    return now.getTime() + hours * 3600000 <= start;
  }

  var TRANSITIONS = {
    confirm: { from: ["pending"], to: "confirmed", action: "confirm", label: "确认预约" },
    cancel: { from: ["pending", "confirmed"], to: "cancelled", action: "cancel", label: "取消预约" },
    noshow: { from: ["confirmed"], to: "noshow", action: "noshow", label: "标记逾期未到" },
    arrive: { from: ["confirmed"], to: "arrived", action: "arrive", label: "登记到店" },
    start: { from: ["arrived"], to: "in_progress", action: "start", label: "开始施工" },
    finish: { from: ["in_progress"], to: "ready", action: "finish", label: "完工（待交车）" },
    checkout: { from: ["ready"], to: "completed", action: "checkout", label: "交车并核销" },
    finish_and_checkout: {
      from: ["in_progress"],
      to: "completed",
      action: "checkout",
      label: "完工并核销",
    },
  };

  function applyTransition(state, actor, bookingId, op, payload, now) {
    var denied = assertActor(actor);
    if (denied) return denied;
    state = deepClone(state);
    now = now || new Date();
    payload = payload || {};
    var rule = TRANSITIONS[op];
    if (!rule) return fail("未知的状态操作。");
    var perm = can(actor, rule.action);
    if (!perm.ok) return perm;

    var booking = findById(state.bookings, bookingId);
    if (!booking) return fail("未找到该预约。");
    if (actor.role === "customer" && booking.customerId !== actor.customerId) {
      return fail("只能操作自己的预约。");
    }
    if (rule.from.indexOf(booking.status) === -1) {
      return fail(
        "当前状态为「" + STATUS_LABEL[booking.status] + "」，不能执行「" + rule.label + "」。"
      );
    }
    if (booking.status === STATUS.completed && (op === "checkout" || op === "finish_and_checkout")) {
      return fail("已完成是终态，不能再次核销。");
    }
    if (op === "cancel") {
      if (booking.status === STATUS.confirmed && actor.role === "customer" && !leadOk(booking, state, now)) {
        return fail(
          "已确认预约需至少提前 " +
            ((state.settings && state.settings.cancelLeadHours) || 2) +
            " 小时取消。如需改期，请联系门店。"
        );
      }
    }
    if (op === "finish_and_checkout") {
      var serviceChk = findById(state.services, booking.serviceId);
      if (!isShortJob(serviceChk)) {
        return fail("该项目为跨日或长工时单，请先完工进入待交车，再交车核销。");
      }
    }

    var from = booking.status;
    var to = rule.to;
    var note = payload.note || "";

    if (to === STATUS.completed) {
      var checkoutRes = performCheckout(state, actor, booking, payload, now);
      if (!checkoutRes.ok) return checkoutRes;
      note = checkoutRes.note || note;
    }

    booking.status = to;
    booking.updatedAt = now.toISOString();
    if (to === STATUS.cancelled || to === STATUS.noshow) {
      booking.releasedAt = now.toISOString();
      note = (note ? note + "；" : "") + "已释放工位与技师时段占用";
    }
    if (op === "finish_and_checkout") {
      appendLog(booking, {
        at: now.toISOString(),
        action: "finish",
        from: from,
        to: STATUS.ready,
        by: actorName(state, actor),
        note: "短单合并步骤：先记录完工",
      });
      appendLog(booking, {
        at: now.toISOString(),
        action: "checkout",
        from: STATUS.ready,
        to: STATUS.completed,
        by: actorName(state, actor),
        note: note || "交车并核销",
      });
    } else {
      appendLog(booking, {
        at: now.toISOString(),
        action: op,
        from: from,
        to: to,
        by: actorName(state, actor),
        note: note || rule.label,
      });
    }

    if (to === STATUS.cancelled || to === STATUS.noshow || to === STATUS.confirmed || to === STATUS.completed || to === STATUS.in_progress || to === STATUS.arrived || to === STATUS.ready) {
      syncBookingNotices(state, booking);
      addNotice(state, {
        role: "customer",
        customerId: booking.customerId,
        title: "预约状态更新：" + STATUS_LABEL[to],
        body: "您的「" + ((findById(state.services, booking.serviceId) || {}).name || "服务") + "」已更新为「" + STATUS_LABEL[to] + "」。",
        bookingId: booking.id,
      });
    }

    var msg = rule.label + "成功";
    if (to === STATUS.cancelled || to === STATUS.noshow) msg += "，工位与技师时段已释放。";
    if (to === STATUS.completed) msg += "，消费记录已写入。";
    return ok(state, msg, { booking: booking });
  }

  function performCheckout(state, actor, booking, payload, now) {
    if (booking.redeemed || booking.status === STATUS.completed) {
      return fail("已完成是终态，不能再次核销。");
    }
    var service = findById(state.services, booking.serviceId);
    var method = payload.payMethod;
    if (!method) return fail("请选择到店结算方式（先约后付，预约时不收费）。");
    var pay = findById(PAY_METHODS, method);
    if (!pay) return fail("不支持的结算方式。");

    var card = null;
    if (method === "card") {
      if (!payload.cardId) return fail("请选择要核销的次卡。");
      card = findById(state.cards, payload.cardId);
      var redeem = redeemCard(state, actor, {
        cardId: payload.cardId,
        bookingId: booking.id,
        now: now,
      }, true);
      if (!redeem.ok) return redeem;
      card = findById(state.cards, payload.cardId);
    } else if (payload.cardId) {
      return fail("未选择次卡核销时，不要传入次卡。");
    }

    booking.redeemed = true;
    booking.cardId = card ? card.id : null;
    booking.payment = {
      method: method,
      methodLabel: pay.label,
      amount: card ? 0 : service ? service.price : 0,
      at: now.toISOString(),
      note: "演示结算记录，非真实支付",
    };

    var consumption = {
      id: nextId(state, "cs"),
      bookingId: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      serviceId: booking.serviceId,
      amount: booking.payment.amount,
      method: method,
      methodLabel: pay.label,
      cardId: card ? card.id : null,
      at: now.toISOString(),
    };
    state.consumptions.push(consumption);

    if (payload.warranty && service && service.warrantyDays) {
      var w = createWarranty(state, actor, booking, payload.warranty, now);
      if (!w.ok) return w;
    } else if (payload.warranty && service && !service.warrantyDays) {
      var w2 = createWarranty(state, actor, booking, payload.warranty, now);
      if (!w2.ok) return w2;
    }

    return { ok: true, note: "交车并核销（" + pay.label + "）" };
  }

  function createWarranty(state, actor, booking, wpayload, now) {
    var perm = can(actor, "add_warranty");
    if (!perm.ok) return perm;
    var start = wpayload.startDate || dateStr(now);
    var end = wpayload.endDate;
    var service = findById(state.services, booking.serviceId);
    if (!end) {
      var days = (service && service.warrantyDays) || 365;
      end = addDays(start, days);
    }
    if (end < start) return fail("质保结束日不能早于开始日。");
    var exists = (state.warranties || []).some(function (w) {
      return w.bookingId === booking.id;
    });
    if (exists) return fail("该工单已登记过质保记录。");
    var rec = {
      id: nextId(state, "wr"),
      bookingId: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      serviceId: booking.serviceId,
      startDate: start,
      endDate: end,
      note: wpayload.note || "门店简易质保记录，不对接膜厂官方质保系统。",
      createdAt: now.toISOString(),
      by: actorName(state, actor),
    };
    state.warranties.push(rec);
    return { ok: true, warranty: rec };
  }

  function addWarrantyStandalone(state, actor, payload, now) {
    var perm = can(actor, "add_warranty");
    if (!perm.ok) return perm;
    state = deepClone(state);
    now = now || new Date();
    var booking = findById(state.bookings, payload.bookingId);
    if (!booking) return fail("请选择关联工单。");
    if (booking.status !== STATUS.completed && booking.status !== STATUS.ready && booking.status !== STATUS.in_progress) {
      return fail("请在施工完成或交车后再登记质保。");
    }
    var r = createWarranty(state, actor, booking, payload, now);
    if (!r.ok) return r;
    return ok(state, "质保记录已登记。", { warranty: r.warranty });
  }

  function redeemCard(state, actor, payload, inPlace) {
    var perm = can(actor, "checkout");
    if (!perm.ok) return fail("顾客不能核销次卡。只有店员或老板可在交车核销时扣次。");
    var card = findById(state.cards, payload.cardId);
    if (!card) return fail("未找到该次卡。");
    if (card.status !== "active") return fail("该次卡不可用。");
    if (card.remaining <= 0) return fail("次卡余次不足，无法核销。请改用其他结算方式，或由老板另行发放次卡。");
    var booking = findById(state.bookings, payload.bookingId);
    if (!booking) return fail("核销必须关联工单。");
    if (booking.customerId !== card.customerId) return fail("次卡不属于该预约顾客。");
    if (booking.redeemed) return fail("该工单已核销，不能再次扣次。");
    var already = (state.cardLedger || []).some(function (l) {
      return l.bookingId === booking.id && l.type === "redeem";
    });
    if (already) return fail("该工单已扣过次，不能重复扣次。");
    var service = findById(state.services, booking.serviceId);
    if (card.applicableServiceIds && card.applicableServiceIds.length) {
      if (card.applicableServiceIds.indexOf(booking.serviceId) === -1) {
        return fail("该次卡不适用于「" + (service ? service.name : "当前项目") + "」。");
      }
    }
    card.remaining -= 1;
    card.updatedAt = (payload.now || new Date()).toISOString();
    var entry = {
      id: nextId(state, "ld"),
      cardId: card.id,
      bookingId: booking.id,
      type: "redeem",
      delta: -1,
      remainingAfter: card.remaining,
      at: (payload.now || new Date()).toISOString(),
      operator: actorName(state, actor),
      note: "到店核销扣 1 次",
    };
    state.cardLedger.push(entry);
    if (inPlace) return { ok: true, card: card, ledger: entry };
    return ok(state, "已扣 1 次，余次 " + card.remaining + "。", { card: card, ledger: entry });
  }

  function issueCard(state, actor, payload, now) {
    now = now || new Date();
    var isClaim = payload && payload.demoClaim;
    var perm = can(actor, isClaim ? "claim_demo_card" : "issue_card");
    if (!perm.ok) return perm;
    state = deepClone(state);
    var customerId = payload.customerId;
    if (isClaim) customerId = actor.customerId;
    if (!customerId) return fail("请选择要发放的顾客。");
    if (isClaim) {
      var existing = (state.cards || []).some(function (c) {
        return c.customerId === customerId && c.demoClaim && c.status === "active" && c.remaining > 0;
      });
      if (existing) return fail("您已领取过演示次卡，无需重复领取。可在本页查看余次。");
    }
    var total = Number(payload.total || 5);
    if (!total || total < 1 || total > 100) return fail("发放次数需在 1–100 之间。");
    var applicable = payload.applicableServiceIds || [];
    var card = {
      id: nextId(state, "cd"),
      customerId: customerId,
      name: payload.name || "演示次卡",
      total: total,
      remaining: total,
      applicableServiceIds: applicable,
      status: "active",
      demoClaim: !!isClaim,
      issuedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      issuedBy: actorName(state, actor),
    };
    state.cards.push(card);
    state.cardLedger.push({
      id: nextId(state, "ld"),
      cardId: card.id,
      bookingId: null,
      type: "issue",
      delta: total,
      remainingAfter: total,
      at: now.toISOString(),
      operator: actorName(state, actor),
      note: isClaim ? "顾客领取演示次卡（凭证发放）" : "老板发放次卡（凭证发放）",
    });
    return ok(state, isClaim ? "演示次卡已到账。" : "次卡已发放。", { card: card });
  }

  function changeCardTimesDirect() {
    return fail("禁止无凭证直接改次数。请通过发放次卡或到店核销写入流水。");
  }

  function addVehicle(state, actor, payload, now) {
    var perm = can(actor, "add_vehicle", { customerId: payload.customerId });
    if (!perm.ok) return perm;
    state = deepClone(state);
    now = now || new Date();
    var customerId = payload.customerId;
    if (actor.role === "customer") customerId = actor.customerId;
    if (!customerId) return fail("请选择车辆所属顾客。");
    var plate = String(payload.plate || "").trim();
    var model = String(payload.model || "").trim();
    var color = String(payload.color || "").trim();
    if (!plate) return fail("请填写车牌。");
    if (!model) return fail("请填写车型。");
    if (!color) return fail("请填写颜色。");
    var dup = (state.vehicles || []).some(function (v) {
      return v.plate.replace(/\s/g, "") === plate.replace(/\s/g, "");
    });
    if (dup) return fail("该车牌已建档，请直接选用。");
    var vehicle = {
      id: nextId(state, "vh"),
      customerId: customerId,
      plate: plate,
      model: model,
      color: color,
      vin: String(payload.vin || "").trim(),
      mileage: payload.mileage ? Number(payload.mileage) : null,
      createdAt: now.toISOString(),
    };
    state.vehicles.push(vehicle);
    return ok(state, "车辆档案已建立。", { vehicle: vehicle });
  }

  function updateVehicle(state, actor, payload) {
    var perm = can(actor, "update_vehicle", { customerId: payload.customerId });
    if (!perm.ok) return perm;
    state = deepClone(state);
    var v = findById(state.vehicles, payload.id);
    if (!v) return fail("未找到车辆。");
    if (actor.role === "customer" && v.customerId !== actor.customerId) {
      return fail("顾客只能维护自己的车辆档案。");
    }
    if (payload.plate) v.plate = String(payload.plate).trim();
    if (payload.model) v.model = String(payload.model).trim();
    if (payload.color) v.color = String(payload.color).trim();
    if (payload.vin !== undefined) v.vin = String(payload.vin || "").trim();
    if (payload.mileage !== undefined) v.mileage = payload.mileage === "" ? null : Number(payload.mileage);
    return ok(state, "车辆档案已更新。", { vehicle: v });
  }

  function uploadPhoto(state, actor, payload, now) {
    var perm = can(actor, "upload_photo");
    if (!perm.ok) return perm;
    state = deepClone(state);
    now = now || new Date();
    var booking = findById(state.bookings, payload.bookingId);
    if (!booking) return fail("未找到工单。");
    if (["cancelled", "noshow"].indexOf(booking.status) !== -1) return fail("该预约已结束，不能再上传照片。");
    var stage = payload.stage;
    var stageOk = PHOTO_STAGES.some(function (s) { return s.id === stage; });
    if (!stageOk) return fail("请选择照片阶段（到店 / 施工前 / 施工中 / 完工）。");
    if (!payload.src) return fail("请选择一张演示占位图。本样品不连接真实相册或图床。");
    booking.photos.push({
      id: nextId(state, "ph"),
      stage: stage,
      src: payload.src,
      label: payload.label || "演示占位图",
      at: now.toISOString(),
      by: actorName(state, actor),
    });
    booking.updatedAt = now.toISOString();
    return ok(state, "照片已登记（演示占位图）。", { booking: booking });
  }

  function updateService(state, actor, payload) {
    var perm = can(actor, payload.field === "price" ? "update_price" : "update_service");
    if (!perm.ok) return perm;
    state = deepClone(state);
    var s = findById(state.services, payload.id);
    if (!s) return fail("未找到项目。");
    if (payload.name) s.name = String(payload.name).trim();
    if (payload.price !== undefined) {
      var price = Number(payload.price);
      if (!(price >= 0)) return fail("价格无效。");
      s.price = price;
    }
    if (payload.durationMinutes !== undefined) s.durationMinutes = Number(payload.durationMinutes) || 0;
    if (payload.durationDays !== undefined) s.durationDays = Number(payload.durationDays) || 0;
    if (payload.enabled !== undefined) s.enabled = !!payload.enabled;
    if (payload.description !== undefined) s.description = String(payload.description);
    return ok(state, "服务项目已更新。", { service: s });
  }

  function updateBay(state, actor, payload) {
    var perm = can(actor, "update_bay");
    if (!perm.ok) return perm;
    state = deepClone(state);
    if (payload.create) {
      var bay = {
        id: nextId(state, "bay"),
        name: String(payload.name || "").trim() || "新工位",
        type: payload.type || "wash",
        enabled: true,
      };
      state.bays.push(bay);
      return ok(state, "工位已添加。", { bay: bay });
    }
    var b = findById(state.bays, payload.id);
    if (!b) return fail("未找到工位。");
    if (payload.name) b.name = String(payload.name).trim();
    if (payload.type) b.type = payload.type;
    if (payload.enabled !== undefined) {
      if (payload.enabled === false) {
        var busy = occupyingBookings(state).some(function (bk) { return bk.bayId === b.id; });
        if (busy) return fail("该工位仍有未完成占用，不能停用。请先完成、取消或标记逾期未到。");
      }
      b.enabled = !!payload.enabled;
    }
    return ok(state, "工位已更新。", { bay: b });
  }

  function updateSchedule(state, actor, payload) {
    var perm = can(actor, "update_schedule");
    if (!perm.ok) return perm;
    state = deepClone(state);
    var tech = findById(state.technicians, payload.technicianId);
    if (!tech) return fail("未找到技师。");
    var day = Number(payload.weekday);
    if (day < 0 || day > 6) return fail("星期无效。");
    var item = (state.schedules || []).find(function (s) {
      return s.technicianId === tech.id && s.weekday === day;
    });
    if (!item) {
      item = { technicianId: tech.id, weekday: day, working: true, start: "09:00", end: "18:00" };
      state.schedules.push(item);
    }
    if (payload.working !== undefined) item.working = !!payload.working;
    if (payload.start) item.start = payload.start;
    if (payload.end) item.end = payload.end;
    return ok(state, "排班已更新。", { schedule: item });
  }

  function updateTechnician(state, actor, payload) {
    var perm = can(actor, "update_schedule");
    if (!perm.ok) return perm;
    state = deepClone(state);
    var t = findById(state.technicians, payload.id);
    if (!t) return fail("未找到技师。");
    if (payload.enabled !== undefined) t.enabled = !!payload.enabled;
    if (payload.bio !== undefined) t.bio = String(payload.bio);
    if (payload.title !== undefined) t.title = String(payload.title);
    return ok(state, "员工资料已更新。", { technician: t });
  }

  function updateStore(state, actor, payload) {
    var perm = can(actor, "update_store");
    if (!perm.ok) return perm;
    state = deepClone(state);
    state.store = state.store || {};
    ["name", "address", "phone", "announcement", "intro"].forEach(function (k) {
      if (payload[k] !== undefined) state.store[k] = String(payload[k]);
    });
    if (payload.hoursStart || payload.hoursEnd) {
      state.store.hours = state.store.hours || { start: "09:00", end: "18:00" };
      if (payload.hoursStart) state.store.hours.start = payload.hoursStart;
      if (payload.hoursEnd) state.store.hours.end = payload.hoursEnd;
    }
    if (payload.cancelLeadHours !== undefined) {
      var n = Number(payload.cancelLeadHours);
      if (!(n >= 0 && n <= 72)) return fail("取消提前量应在 0–72 小时之间。");
      state.settings = state.settings || {};
      state.settings.cancelLeadHours = n;
    }
    return ok(state, "门店资料与规则已更新。");
  }

  function bookingsForDate(state, date) {
    return (state.bookings || []).filter(function (b) {
      return (b.intervals || []).some(function (iv) { return iv.date === date; });
    });
  }

  function vehicleHistory(state, vehicleId) {
    return {
      bookings: (state.bookings || []).filter(function (b) { return b.vehicleId === vehicleId; }),
      consumptions: (state.consumptions || []).filter(function (c) { return c.vehicleId === vehicleId; }),
      warranties: (state.warranties || []).filter(function (w) { return w.vehicleId === vehicleId; }),
    };
  }

  return {
    STATUS: STATUS,
    STATUS_LABEL: STATUS_LABEL,
    OCCUPYING: OCCUPYING,
    TERMINAL: TERMINAL,
    PHOTO_STAGES: PHOTO_STAGES,
    PAY_METHODS: PAY_METHODS,
    TRANSITIONS: TRANSITIONS,
    dateStr: dateStr,
    parseDate: parseDate,
    addDays: addDays,
    weekday: weekday,
    toMinutes: toMinutes,
    fromMinutes: fromMinutes,
    nowParts: nowParts,
    deepClone: deepClone,
    findById: findById,
    isOccupying: isOccupying,
    isShortJob: isShortJob,
    storeHours: storeHours,
    buildIntervals: buildIntervals,
    intervalsOverlap: intervalsOverlap,
    checkConflict: checkConflict,
    listAvailableSlots: listAvailableSlots,
    pickBay: pickBay,
    can: can,
    actorName: actorName,
    submitBooking: submitBooking,
    applyTransition: applyTransition,
    issueCard: issueCard,
    redeemCard: redeemCard,
    changeCardTimesDirect: changeCardTimesDirect,
    addVehicle: addVehicle,
    updateVehicle: updateVehicle,
    uploadPhoto: uploadPhoto,
    addWarrantyStandalone: addWarrantyStandalone,
    updateService: updateService,
    updateBay: updateBay,
    updateSchedule: updateSchedule,
    updateTechnician: updateTechnician,
    updateStore: updateStore,
    bookingsForDate: bookingsForDate,
    vehicleHistory: vehicleHistory,
    formatInterval: formatInterval,
    leadOk: leadOk,
    isTechWorking: isTechWorking,
    bayTypeLabel: bayTypeLabel,
    enabledBays: enabledBays,
  };
});
