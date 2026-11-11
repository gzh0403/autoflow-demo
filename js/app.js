/**
 * AutoFlow P2 可点击交互原型。
 * 静态页面，三角色共享同一份本地数据。
 */
(function () {
  "use strict";
  var R = AFRules;
  var state;
  var meta;
  var ui = {
    boardDate: null,
    boardMode: "time",
    book: {},
    customerQuery: "",
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function byId(list, id) { return R.findById(list, id); }
  function customer(id) { return byId(state.customers, id); }
  function vehicle(id) { return byId(state.vehicles, id); }
  function service(id) { return byId(state.services, id); }
  function tech(id) { return byId(state.technicians, id); }
  function bay(id) { return byId(state.bays, id); }

  function weekdayLabel(s) {
    return "日一二三四五六".charAt(R.weekday(s));
  }
  function fmtDate(s) {
    if (!s) return "";
    var p = s.split("-");
    return p[0] + "年" + Number(p[1]) + "月" + Number(p[2]) + "日（周" + weekdayLabel(s) + "）";
  }
  function fmtMoney(n) {
    return "¥" + Number(n || 0).toFixed(0);
  }
  function durationLabel(sv) {
    if (!sv) return "";
    if (sv.durationDays >= 2) return "跨日 " + sv.durationDays + " 天";
    var m = sv.durationMinutes || 0;
    if (m >= 60) {
      var h = Math.floor(m / 60);
      var r = m % 60;
      return r ? h + " 小时 " + r + " 分钟" : h + " 小时";
    }
    return m + " 分钟";
  }
  function periodLabel(b) {
    if (!b) return "";
    if (b.spanDays > 1) {
      return fmtDate(b.startDate) + " " + b.startTime + " 至 " + fmtDate(b.endDate) + " " + b.endTime + " · 跨日 " + b.spanDays + " 天";
    }
    return fmtDate(b.startDate) + " " + b.startTime + "–" + b.endTime;
  }
  function statusBadge(st) {
    return '<span class="badge st-' + esc(st) + '">' + esc(R.STATUS_LABEL[st] || st) + "</span>";
  }
  function actor() {
    return state.actors[meta.role];
  }

  function toast(msg, type) {
    var wrap = document.getElementById("toasts");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }
  function applyRes(res, stay) {
    if (!res) return;
    if (!res.ok) {
      toast(res.message || "操作未完成", "err");
      return false;
    }
    state = res.state;
    AFStore.saveState(state);
    toast(res.message || "已完成", "ok");
    if (!stay) render();
    return true;
  }

  function defaultPath(role) {
    role = role || meta.role;
    if (role === "staff") return "/s/today";
    if (role === "boss") return "/b/dashboard";
    return "/c/home";
  }
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h || h === "/") h = defaultPath();
    var parts = h.split("?");
    var path = parts[0];
    if (path.charAt(0) !== "/") path = "/" + path;
    var q = {};
    if (parts[1]) {
      parts[1].split("&").forEach(function (kv) {
        var pair = kv.split("=");
        q[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
      });
    }
    var segs = path.split("/").filter(Boolean);
    return { path: path, segs: segs, q: q, root: segs[0], page: segs[1] || "", id: segs[2] || "" };
  }
  function goto(path) {
    if (path.charAt(0) !== "#") path = "#" + path;
    if (location.hash === path) render();
    else location.hash = path;
  }

  function vehiclesOf(customerId) {
    return state.vehicles.filter(function (v) { return v.customerId === customerId; });
  }
  function cardsOf(customerId) {
    return state.cards.filter(function (c) { return c.customerId === customerId; });
  }
  function techsFor(sv) {
    var list = state.technicians.filter(function (t) { return t.enabled !== false; });
    if (!sv) return list;
    var fit = list.filter(function (t) { return !t.serviceIds || t.serviceIds.indexOf(sv.id) !== -1; });
    return fit.length ? fit : list;
  }

  function toolbarHTML() {
    return (
      '<header class="toolbar">' +
        '<div class="brand"><img src="assets/favicon.svg" alt="">AutoFlow</div>' +
        '<div class="flags">' +
          '<span class="flag">' + esc(state.demoLabel) + "</span>" +
          '<span class="flag warn">' + esc(state.visualNote) + "</span>" +
        "</div>" +
        '<div class="tools">' +
          '<label class="muted" style="font-size:12px">演示角色切换 ' +
            '<select id="roleSwitch">' +
              '<option value="customer"' + (meta.role === "customer" ? " selected" : "") + ">顾客阿明</option>" +
              '<option value="staff"' + (meta.role === "staff" ? " selected" : "") + ">店员小陈</option>" +
              '<option value="boss"' + (meta.role === "boss" ? " selected" : "") + ">老板林</option>" +
            "</select></label>" +
          '<button type="button" class="btn-ghost" data-action="toggle-frame">' + (meta.frame === "phone" ? "宽屏布局" : "手机容器") + "</button>" +
          '<button type="button" class="btn-ghost" data-action="open-guide">体验指引</button>' +
          '<button type="button" class="btn-reset" data-action="reset">重置演示数据</button>' +
        "</div>" +
      "</header>"
    );
  }

  var NAV = {
    customer: [
      { href: "/c/home", label: "首页", ico: "⌂" },
      { href: "/c/bookings", label: "预约", ico: "☰" },
      { href: "/c/member", label: "会员", ico: "◇" },
      { href: "/c/me", label: "我的", ico: "○" },
    ],
    staff: [
      { href: "/s/today", label: "今日", ico: "▣" },
      { href: "/s/customers", label: "顾客", ico: "☰" },
      { href: "/s/schedule", label: "我的排班", ico: "▦" },
      { href: "/s/me", label: "我的", ico: "○" },
    ],
    boss: [
      { href: "/b/dashboard", label: "看板", ico: "▣" },
      { href: "/b/bookings", label: "预约", ico: "☰" },
      { href: "/b/ops", label: "经营", ico: "◇" },
      { href: "/b/settings", label: "设置", ico: "⚙" },
    ],
  };

  function navActive(item, path) {
    if (path === item.href || path.indexOf(item.href + "/") === 0) return true;
    if (item.href === "/c/bookings" && (path.indexOf("/c/book") === 0 || path.indexOf("/c/service") === 0)) return true;
    if (item.href === "/c/me" && (path.indexOf("/c/vehicle") === 0 || path.indexOf("/c/order") === 0 || path.indexOf("/c/warrant") === 0 || path.indexOf("/c/shop") === 0 || path.indexOf("/c/tech") === 0)) return true;
    if (item.href === "/s/today" && path.indexOf("/s/booking") === 0) return true;
    if (item.href === "/b/bookings" && path.indexOf("/b/booking") === 0) return true;
    if (item.href === "/b/ops" && (path.indexOf("/b/orders") === 0 || path.indexOf("/b/warrant") === 0 || path.indexOf("/b/cards") === 0 || path.indexOf("/b/customers") === 0)) return true;
    if (item.href === "/b/settings" && (path.indexOf("/b/services") === 0 || path.indexOf("/b/staff") === 0 || path.indexOf("/b/bays") === 0 || path.indexOf("/b/store") === 0 || path.indexOf("/b/permission") === 0)) return true;
    return false;
  }
  function sideNavHTML(path) {
    var items = NAV[meta.role] || [];
    return (
      '<nav class="side-nav">' +
        items.map(function (it) {
          return '<a href="#' + it.href + '" class="' + (navActive(it, path) ? "active" : "") + '"><span>' + it.ico + "</span>" + esc(it.label) + "</a>";
        }).join("") +
        (meta.role === "boss"
          ? '<div class="muted" style="margin:16px 12px 6px;font-size:11px">快捷</div>' +
            '<a href="#/b/services">服务项目</a><a href="#/b/staff">员工与排班</a><a href="#/b/bays">工位管理</a><a href="#/b/permissions">权限说明</a>'
          : "") +
      "</nav>"
    );
  }
  function tabbarHTML(path) {
    var items = NAV[meta.role] || [];
    return (
      '<nav class="tabbar">' +
        items.map(function (it) {
          return '<a href="#' + it.href + '" class="' + (navActive(it, path) ? "active" : "") + '"><span class="ico">' + it.ico + "</span>" + esc(it.label) + "</a>";
        }).join("") +
      "</nav>"
    );
  }

  function shell(page, path) {
    var inner =
      '<div class="app-frame">' +
        '<div class="app-body">' +
          sideNavHTML(path) +
          '<main class="content">' + page + "</main>" +
        "</div>" +
        tabbarHTML(path) +
      "</div>";
    if (meta.frame === "phone") {
      inner = '<div class="phone-wrap"><div class="phone-notch"><span></span></div>' + inner + "</div>";
    }
    return toolbarHTML() + '<div id="toasts" class="toast-wrap"></div><div class="stage" data-frame="' + meta.frame + '">' + inner + "</div>";
  }

  function kicker(t) { return '<p class="page-kicker">' + esc(t) + "</p>"; }
  function backLink(href, t) { return '<p><a href="#' + href + '">← ' + esc(t || "返回") + "</a></p>"; }
  function prefix() {
    if (meta.role === "staff") return "/s";
    if (meta.role === "boss") return "/b";
    return "/c";
  }


  function serviceCard(s) {
    return (
      '<a class="card clickable" href="#/c/service/' + s.id + '">' +
        '<div class="between"><div class="item-title">' + esc(s.name) + '</div><div class="price">' + fmtMoney(s.price) + "</div></div>" +
        '<div class="item-meta">' + esc(s.category) + " · " + durationLabel(s) + (s.durationDays >= 2 ? " · 占用工位与技师跨日时段" : "") + "</div>" +
      "</a>"
    );
  }
  function viewCHome() {
    var rec = state.services.filter(function (s) { return s.enabled !== false; }).slice(0, 4);
    return (
      kicker("CUSTOMER") +
      '<section class="hero">' +
        '<p class="flag warn" style="display:inline-block;margin-bottom:10px">' + esc(state.visualNote) + "</p>" +
        "<h1>" + esc(state.store.name) + "</h1>" +
        '<p class="sub">' + esc(state.store.announcement) + "</p>" +
        '<div class="btn-row">' +
          '<a class="btn" href="#/c/book">开始预约</a>' +
          '<a class="btn btn-ghost" href="#/c/shop" style="color:#E8EAED;border-color:rgba(255,255,255,.3)">门店介绍</a>' +
        "</div>" +
      "</section>" +
      "<h2>推荐项目</h2>" +
      '<div class="list">' + rec.map(serviceCard).join("") + "</div>" +
      '<div class="btn-row page-end-actions"><a class="btn btn-ghost" href="#/c/services">全部项目</a><a class="btn btn-ghost" href="#/c/technicians">认识技师</a><a class="btn btn-ghost" href="#/c/vehicles">我的车辆</a></div>'
    );
  }
  function viewCShop() {
    return (
      kicker("门店介绍") + backLink("/c/home") +
      "<h1>" + esc(state.store.name) + "</h1>" +
      '<p class="sub">' + esc(state.demoLabel) + "</p>" +
      '<div class="card"><dl class="kv">' +
        "<dt>地址</dt><dd>" + esc(state.store.address) + "</dd>" +
        "<dt>电话</dt><dd>" + esc(state.store.phone) + "</dd>" +
        "<dt>营业</dt><dd>" + esc(state.store.hours.start) + "–" + esc(state.store.hours.end) + "（演示按每日营业）</dd>" +
      "</dl><p class='mt'>" + esc(state.store.intro) + "</p></div>"
    );
  }
  function viewCServices() {
    return kicker("服务项目") + "<h1>全部项目</h1><p class='sub'>先约后付，预约不收费。</p><div class='list'>" +
      state.services.filter(function (s) { return s.enabled !== false; }).map(serviceCard).join("") + "</div>";
  }
  function viewCService(id) {
    var s = service(id);
    if (!s) return "<p>未找到项目</p>";
    return (
      backLink("/c/services", "全部项目") +
      "<h1>" + esc(s.name) + "</h1>" +
      '<p class="sub">' + esc(s.category) + " · " + durationLabel(s) + " · " + fmtMoney(s.price) + "</p>" +
      '<div class="card"><p>' + esc(s.description) + "</p>" +
        (s.durationDays >= 2 ? '<div class="callout">跨日占用是连续多个营业日的工位与技师区间锁，不是把单日工位简单改个名字。该项目将占用连续 ' + s.durationDays + " 个营业日。提交前请看清占用区间。</div>" : "") +
        (s.warrantyDays ? "<p class='muted'>完成后可由门店登记简易质保（约 " + Math.round(s.warrantyDays / 365) + " 年），不对接膜厂官方接口。</p>" : "") +
      "</div>" +
      '<div class="btn-row"><a class="btn" href="#/c/book?service=' + s.id + '">预约此项目</a></div>'
    );
  }
  function viewCTechs() {
    return kicker("技师") + "<h1>在职技师</h1><div class='list'>" +
      state.technicians.filter(function (t) { return t.enabled !== false; }).map(function (t) {
        return '<a class="card clickable" href="#/c/technician/' + t.id + '"><div class="item-title">技师' + esc(t.name) + " · " + esc(t.title) + '</div><div class="item-meta">' + esc(t.specialties.join("、")) + "</div></a>";
      }).join("") + "</div>";
  }
  function viewCTech(id) {
    var t = tech(id);
    if (!t) return "<p>未找到技师</p>";
    return backLink("/c/technicians") + "<h1>技师" + esc(t.name) + "</h1><p class='sub'>" + esc(t.title) + "</p><div class='card'><p>" + esc(t.bio) + "</p><p class='muted'>擅长：" + esc(t.specialties.join("、")) + "</p></div>" +
      '<div class="btn-row"><a class="btn" href="#/c/book?tech=' + t.id + '">约这位技师</a></div>';
  }
  function viewCVehicles() {
    var list = vehiclesOf(actor().customerId);
    return (
      kicker("车辆档案") +
      "<h1>我的车辆</h1><p class='sub'>一位客人可以有多辆车。预约必须绑定本次要施工的那一台；消费与质保按车归档。</p>" +
      '<div class="list">' +
        list.map(function (v) {
          return '<a class="card clickable" href="#/c/vehicle/' + v.id + '"><div class="item-title">' + esc(v.plate) + " · " + esc(v.color) + " " + esc(v.model) + '</div><div class="item-meta">' + (v.vin ? "VIN " + esc(v.vin) : "VIN 未填") + (v.mileage ? " · " + v.mileage + " 公里" : "") + "</div></a>";
        }).join("") +
      "</div>" +
      '<div class="btn-row"><a class="btn" href="#/c/vehicle/new">新增车辆</a></div>'
    );
  }
  function vehicleForm(v) {
    return (
      '<form data-form="' + (v ? "update-vehicle" : "add-vehicle") + '" data-id="' + (v ? v.id : "") + '">' +
        '<label class="field"><span>车牌（必填）</span><input name="plate" required value="' + esc(v && v.plate) + '" placeholder="如 沪A·AF900"></label>' +
        '<label class="field"><span>车型（必填）</span><input name="model" required value="' + esc(v && v.model) + '" placeholder="虚拟车型名称"></label>' +
        '<label class="field"><span>颜色（必填）</span><input name="color" required value="' + esc(v && v.color) + '"></label>' +
        '<label class="field"><span>VIN（可选）</span><input name="vin" value="' + esc(v && v.vin) + '"></label>' +
        '<label class="field"><span>里程（可选，公里）</span><input name="mileage" type="number" min="0" value="' + esc(v && v.mileage != null ? v.mileage : "") + '"></label>' +
        '<button class="btn btn-block" type="submit">' + (v ? "保存" : "建立档案") + "</button>" +
      "</form>"
    );
  }
  function viewCVehicleNew() {
    return backLink("/c/vehicles") + "<h1>新增车辆</h1>" + vehicleForm(null);
  }
  function viewCVehicle(id) {
    var v = vehicle(id);
    if (!v || v.customerId !== actor().customerId) return "<p>未找到车辆，或无权查看。</p>";
    var hist = R.vehicleHistory(state, v.id);
    return (
      backLink("/c/vehicles") +
      "<h1>" + esc(v.plate) + "</h1><p class='sub'>" + esc(v.color) + " · " + esc(v.model) + "</p>" +
      '<div class="card mb">' + vehicleForm(v) + "</div>" +
      "<h2>这台车的预约</h2>" + bookingMiniList(hist.bookings) +
      "<h2 class='mt'>质保</h2>" + warrantyList(hist.warranties) +
      "<h2 class='mt'>消费</h2>" + consumptionList(hist.consumptions) +
      '<div class="btn-row"><a class="btn" href="#/c/book?vehicle=' + v.id + '">为这台车预约</a></div>'
    );
  }
  function bookingMiniList(list) {
    if (!list.length) return '<div class="empty">暂无记录</div>';
    var sorted = list.slice().sort(function (a, b) { return (b.startDate + b.startTime).localeCompare(a.startDate + a.startTime); });
    return '<div class="list">' + sorted.map(function (b) {
      var href = prefix() + "/booking/" + b.id;
      var sv = service(b.serviceId);
      return '<a class="card clickable" href="#' + href + '"><div class="between"><div class="item-title">' + esc(sv ? sv.name : "") + "</div>" + statusBadge(b.status) + "</div><div class='item-meta'>" + esc(periodLabel(b)) + "</div></a>";
    }).join("") + "</div>";
  }
  function warrantyList(list) {
    if (!list.length) return '<div class="empty">暂无质保记录</div>';
    return '<div class="list">' + list.map(function (w) {
      var sv = service(w.serviceId);
      var v = vehicle(w.vehicleId);
      var href = prefix() + "/warranty/" + w.id;
      return '<a class="card clickable" href="#' + href + '"><div class="item-title">' + esc(sv ? sv.name : "项目") + " · " + esc(v ? v.plate : "") + '</div><div class="item-meta">' + fmtDate(w.startDate) + " 至 " + fmtDate(w.endDate) + " · 点开查看详情与完工照片</div></a>";
    }).join("") + "</div>";
  }

  function viewWarranty(id, role) {
    var w = byId(state.warranties, id);
    if (!w) return "<p>未找到质保记录</p>";
    if (role === "customer" && w.customerId !== actor().customerId) return "<p>只能查看自己的质保记录。</p>";
    var sv = service(w.serviceId);
    var v = vehicle(w.vehicleId);
    var cu = customer(w.customerId);
    var b = byId(state.bookings, w.bookingId);
    var after = ((b && b.photos) || []).filter(function (pic) { return pic.stage === "after"; });
    var vehicleAfter = [];
    (state.bookings || []).forEach(function (bk) {
      if (bk.vehicleId !== w.vehicleId) return;
      if (b && bk.id === b.id) return;
      (bk.photos || []).forEach(function (pic) {
        if (pic.stage === "after") vehicleAfter.push(pic);
      });
    });
    var back = "/c/warranties";
    if (role === "staff") back = w.customerId ? "/s/customer/" + w.customerId : "/s/customers";
    if (role === "boss") back = "/b/warranties";
    var bookingHref = b ? (prefix() + "/booking/" + b.id) : "";
    return (
      backLink(back, "返回质保列表") +
      kicker("质保详情") +
      "<h1>" + esc(sv ? sv.name : "质保记录") + "</h1>" +
      '<p class="sub">门店简易记录，不对接膜厂官方质保系统。</p>' +
      '<div class="card"><dl class="kv">' +
        "<dt>顾客</dt><dd>" + esc(cu ? cu.name : "") + "</dd>" +
        "<dt>车辆</dt><dd>" + esc(v ? v.plate + " · " + v.color + " " + v.model : "") + "</dd>" +
        "<dt>项目</dt><dd>" + esc(sv ? sv.name : "") + "</dd>" +
        "<dt>质保期间</dt><dd>" + esc(fmtDate(w.startDate)) + " 至 " + esc(fmtDate(w.endDate)) + "</dd>" +
        "<dt>说明</dt><dd>" + esc(w.note || "门店简易质保记录") + "</dd>" +
        "<dt>关联工单</dt><dd>" + (bookingHref ? '<a href="#' + bookingHref + '">查看预约详情</a>' : "未关联工单") + "</dd>" +
        (w.by ? "<dt>登记人</dt><dd>" + esc(w.by) + "</dd>" : "") +
      "</dl></div>" +
      "<h2 class='mt'>该工单的完工照片</h2>" +
      (after.length ? photoGrid(after) : '<p class="muted">该工单暂无完工照片。</p>') +
      (vehicleAfter.length ? "<h2 class='mt'>该车辆的其他完工照片</h2>" + photoGrid(vehicleAfter) : "")
    );
  }
  function consumptionList(list) {
    if (!list.length) return '<div class="empty">暂无消费记录</div>';
    var sorted = list.slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
    return '<div class="list">' + sorted.map(function (c) {
      var sv = service(c.serviceId);
      var v = vehicle(c.vehicleId);
      return '<div class="card"><div class="between"><div class="item-title">' + esc(sv ? sv.name : "") + "</div><div class='price'>" + (c.method === "card" ? "次卡" : fmtMoney(c.amount)) + "</div></div><div class='item-meta'>" + esc(v ? v.plate : "") + " · " + esc(c.methodLabel) + "</div></div>";
    }).join("") + "</div>";
  }


  function viewCBook(q) {
    var d = ui.book;
    if (q.service && !d.touched) d.serviceId = q.service;
    if (q.tech && !d.touched) d.technicianId = q.tech;
    if (q.vehicle && !d.touched) d.vehicleId = q.vehicle;
    var cars = vehiclesOf(actor().customerId);
    if (!d.vehicleId && cars.length === 1) d.vehicleId = cars[0].id;
    var sv = service(d.serviceId);
    var techs = techsFor(sv);
    var today = R.dateStr(new Date());
    var dates = [];
    for (var i = 0; i < 14; i++) dates.push(R.addDays(today, i));
    if (!d.startDate) d.startDate = dates[1] || dates[0];

    var slotsHtml = "";
    if (sv && d.technicianId && d.startDate) {
      var slots = R.listAvailableSlots(state, {
        serviceId: sv.id,
        technicianId: d.technicianId,
        date: d.startDate,
        now: new Date(),
        vehicleId: d.vehicleId,
      });
      if (!slots.ok) slotsHtml = '<div class="callout warn">' + esc(slots.message) + "</div>";
      else if (!slots.slots.length) {
        slotsHtml = '<div class="callout warn">' + esc(slots.blockedReason || slots.message || "该日没有可约时段。若与跨日工单冲突，请改期或换技师。") + "</div>";
      } else {
        slotsHtml = '<div class="choice">' + slots.slots.map(function (s) {
          var sel = d.startTime === s.startTime && d.bayId === s.bayId;
          return '<button type="button" class="opt' + (sel ? " selected" : "") + '" data-action="pick-slot" data-start="' + s.startTime + '" data-bay="' + s.bayId + '">' + esc(s.label) + "</button>";
        }).join("") + "</div>";
        if (sv.durationDays >= 2) {
          slotsHtml = '<div class="callout">将锁定以下区间的工位与技师（待确认即占位）：' + esc(slots.slots[0].label) + "</div>" + slotsHtml;
        }
      }
    } else {
      slotsHtml = '<p class="muted">请先选择项目、车辆、技师和日期。</p>';
    }

    return (
      kicker("填写预约") +
      "<h1>填写预约</h1><p class='sub'>先约后付，提交后进入待确认，同时锁定工位与技师时段。需店员手动确认。</p>" +
      (cars.length === 0 ? '<div class="callout warn">请先建立车辆档案，预约必须绑定具体车辆。<a href="#/c/vehicle/new">现在新增</a></div>' : "") +
      '<div class="card">' +
        '<div class="field-label">服务项目</div><div class="choice mb">' +
          state.services.filter(function (s) { return s.enabled !== false; }).map(function (s) {
            return '<button type="button" class="opt' + (d.serviceId === s.id ? " selected" : "") + '" data-action="book-field" data-k="serviceId" data-v="' + s.id + '">' + esc(s.name) + "<br><span class='muted'>" + durationLabel(s) + " · " + fmtMoney(s.price) + "</span></button>";
          }).join("") +
        "</div>" +
        '<div class="field-label">施工车辆（必选）</div><div class="choice mb">' +
          cars.map(function (v) {
            return '<button type="button" class="opt' + (d.vehicleId === v.id ? " selected" : "") + '" data-action="book-field" data-k="vehicleId" data-v="' + v.id + '">' + esc(v.plate) + "<br><span class='muted'>" + esc(v.color) + " " + esc(v.model) + "</span></button>";
          }).join("") +
          '<a class="btn btn-ghost btn-sm" href="#/c/vehicle/new">新增车辆</a>' +
        "</div>" +
        '<div class="field-label">技师</div><div class="choice mb">' +
          techs.map(function (t) {
            return '<button type="button" class="opt' + (d.technicianId === t.id ? " selected" : "") + '" data-action="book-field" data-k="technicianId" data-v="' + t.id + '">' + esc(t.name) + " · " + esc(t.title) + "</button>";
          }).join("") +
        "</div>" +
        '<div class="field-label">日期</div><div class="choice mb">' +
          dates.map(function (dt) {
            return '<button type="button" class="opt' + (d.startDate === dt ? " selected" : "") + '" data-action="book-field" data-k="startDate" data-v="' + dt + '">' + Number(dt.split("-")[1]) + "/" + Number(dt.split("-")[2]) + "<br><span class='muted'>周" + weekdayLabel(dt) + "</span></button>";
          }).join("") +
        "</div>" +
        '<div class="field-label">' + (sv && sv.durationDays >= 2 ? "跨日占用确认" : "时段（系统按空闲工位自动匹配）") + "</div>" +
        slotsHtml +
        '<div class="btn-row"><button type="button" class="btn btn-block" data-action="submit-booking">提交预约</button></div>' +
      "</div>"
    );
  }

  function viewCBookings() {
    var list = state.bookings.filter(function (b) { return b.customerId === actor().customerId; });
    return kicker("我的预约") + "<h1>我的预约</h1><div class='btn-row mb'><a class='btn' href='#/c/book'>新建预约</a></div>" + bookingMiniList(list);
  }

  function progressSteps(b) {
    var order = ["pending", "confirmed", "arrived", "in_progress", "ready", "completed"];
    if (b.status === "cancelled" || b.status === "noshow") {
      return '<div class="callout">' + esc(R.STATUS_LABEL[b.status]) + "，工位与技师时段已释放。</div>";
    }
    var idx = order.indexOf(b.status);
    return '<div class="steps">' + order.map(function (st, i) {
      var cls = i < idx ? "done" : i === idx ? "cur" : "";
      return '<div class="stp ' + cls + '">' + esc(R.STATUS_LABEL[st]) + "</div>";
    }).join("") + "</div>";
  }

  function photoGrid(photos) {
    if (!photos || !photos.length) return '<p class="muted">暂无施工照片。</p>';
    return '<div class="photos">' + photos.map(function (p) {
      var st = R.PHOTO_STAGES.filter(function (s) { return s.id === p.stage; })[0];
      return "<figure><img src='" + esc(p.src) + "' alt='" + esc(p.label) + "'><figcaption>" + esc((st && st.label) || p.stage) + " · " + esc(p.label) + "</figcaption></figure>";
    }).join("") + "</div>";
  }

  function btnAct(op, id, label, cls) {
    return '<button type="button" class="' + cls + '" data-action="transition" data-op="' + op + '" data-id="' + id + '">' + esc(label) + "</button>";
  }

  function viewBookingDetail(id, role) {
    var b = byId(state.bookings, id);
    if (!b) return "<p>未找到预约</p>";
    if (role === "customer" && b.customerId !== actor().customerId) return "<p>只能查看自己的预约。</p>";
    var sv = service(b.serviceId);
    var v = vehicle(b.vehicleId);
    var t = tech(b.technicianId);
    var ba = bay(b.bayId);
    var cu = customer(b.customerId);
    var ws = state.warranties.filter(function (w) { return w.bookingId === b.id; });
    var act = actor();
    var actions = [];
    function canOp(op) {
      var rule = R.TRANSITIONS[op];
      if (!rule) return false;
      if (rule.from.indexOf(b.status) === -1) return false;
      return R.can(act, rule.action).ok;
    }
    if (role !== "customer") {
      if (canOp("confirm")) actions.push(btnAct("confirm", b.id, "确认预约", "btn"));
      if (canOp("arrive")) actions.push(btnAct("arrive", b.id, "登记到店", "btn"));
      if (canOp("start")) actions.push(btnAct("start", b.id, "开始施工", "btn"));
      if (canOp("finish") && !R.isShortJob(sv)) actions.push(btnAct("finish", b.id, "完工（待交车）", "btn"));
      if (canOp("finish_and_checkout") && R.isShortJob(sv)) actions.push('<button type="button" class="btn btn-ok" data-action="open-checkout" data-id="' + b.id + '" data-merge="1">完工并核销</button>');
      if (canOp("checkout") && !R.isShortJob(sv)) actions.push('<button type="button" class="btn btn-ok" data-action="open-checkout" data-id="' + b.id + '">交车并核销</button>');
      if (canOp("noshow")) actions.push(btnAct("noshow", b.id, "逾期未到", "btn btn-warn"));
      if (canOp("cancel")) actions.push(btnAct("cancel", b.id, "取消预约", "btn btn-danger"));
      if (["cancelled", "noshow", "completed"].indexOf(b.status) === -1) {
        actions.push('<button type="button" class="btn btn-ghost" data-action="open-photo" data-id="' + b.id + '">登记照片</button>');
      }
      if (["in_progress", "ready", "completed"].indexOf(b.status) !== -1 && !ws.length) {
        actions.push('<button type="button" class="btn btn-ghost" data-action="open-warranty" data-id="' + b.id + '">登记质保</button>');
      }
    } else {
      if (canOp("cancel")) actions.push(btnAct("cancel", b.id, "取消预约", "btn btn-ghost"));
      actions.push('<button type="button" class="btn btn-ghost" data-action="try-unauth" data-op="confirm" data-id="' + b.id + '">演示：尝试确认预约</button>');
      actions.push('<button type="button" class="btn btn-ghost" data-action="try-unauth" data-op="checkout" data-id="' + b.id + '">演示：尝试自行核销</button>');
    }

    var back = role === "customer" ? "/c/bookings" : role === "staff" ? "/s/today" : "/b/bookings";
    return (
      backLink(back) +
      kicker("预约详情") +
      '<div class="between"><h1>' + esc(sv ? sv.name : "预约") + "</h1>" + statusBadge(b.status) + "</div>" +
      '<p class="sub">' + esc(periodLabel(b)) + "</p>" +
      progressSteps(b) +
      '<div class="card mt"><dl class="kv">' +
        "<dt>顾客</dt><dd>" + esc(cu ? cu.name : "") + (cu ? " · " + esc(cu.phone) : "") + "</dd>" +
        "<dt>车辆</dt><dd>" + esc(v ? v.plate + " · " + v.color + " " + v.model : "") + "</dd>" +
        "<dt>技师</dt><dd>" + esc(t ? t.name : "") + "</dd>" +
        "<dt>工位</dt><dd>" + esc(ba ? ba.name : "") + (b.spanDays > 1 ? " · 跨日占用" : "") + "</dd>" +
        "<dt>占用区间</dt><dd>" + (b.intervals || []).map(function (iv) { return esc(R.formatInterval(iv)); }).join("<br>") + "</dd>" +
        "<dt>结算</dt><dd>" + (b.payment ? esc(b.payment.methodLabel) + (b.payment.amount ? " · " + fmtMoney(b.payment.amount) : "") + "<br><span class='muted'>" + esc(b.payment.note) + "</span>" : "先约后付，尚未核销") + "</dd>" +
      "</dl></div>" +
      (role !== "customer" && (b.redeemed || (b.status === "completed" && b.payment))
        ? '<div class="callout mt">已核销、不可重复核销。</div>'
        : "") +
      (actions.length ? '<div class="btn-row">' + actions.join("") + "</div>" : "") +
      "<h2 class='mt'>施工照片</h2>" + photoGrid(b.photos) +
      "<h2 class='mt'>质保</h2>" + warrantyList(ws) +
      "<h2 class='mt'>流水</h2><div class='card'>" + (b.logs || []).map(function (l) {
        return "<div class='item-meta'>" + esc(l.by) + " · " + esc(R.STATUS_LABEL[l.to] || l.action) + " · " + esc(l.note || "") + "</div>";
      }).join("") + "</div>"
    );
  }

  function applicableLabel(c) {
    if (!c.applicableServiceIds || !c.applicableServiceIds.length) return "全部项目";
    return c.applicableServiceIds.map(function (id) { var s = service(id); return s ? s.name : id; }).join("、");
  }
  function ledgerList(list) {
    if (!list.length) return '<div class="empty">暂无流水</div>';
    return '<div class="card">' + list.map(function (l) {
      var typ = l.type === "issue" ? "发放" : l.type === "redeem" ? "核销扣次" : l.type;
      return "<div class='between' style='padding:6px 0;border-bottom:1px solid var(--line)'><div>" + typ + " · " + (l.delta > 0 ? "+" : "") + l.delta + '<div class="item-meta">' + esc(l.operator) + " · " + esc(l.note) + "</div></div><div class='muted'>余 " + l.remainingAfter + "</div></div>";
    }).join("") + "</div>";
  }
  function viewCMember() {
    var cards = cardsOf(actor().customerId);
    var ledgers = state.cardLedger.filter(function (l) {
      return cards.some(function (c) { return c.id === l.cardId; });
    }).slice().reverse();
    return (
      kicker("会员") +
      "<h1>会员与次卡</h1><p class='sub'>次卡按凭证管理。领取或发放会写流水；到店核销时检查余次、扣 1 次并记账。禁止无凭证直接改次数。</p>" +
      '<div class="list">' +
        (cards.length ? cards.map(function (c) {
          return '<div class="card"><div class="between"><div class="item-title">' + esc(c.name) + '</div><div class="price">余 ' + c.remaining + " / " + c.total + "</div></div><p class='item-meta'>适用：" + esc(applicableLabel(c)) + " · " + (c.status === "active" ? "有效" : "不可用") + "</p></div>";
        }).join("") : '<div class="empty">暂无次卡</div>') +
      "</div>" +
      '<div class="btn-row"><button type="button" class="btn" data-action="claim-card">领取演示次卡</button></div>' +
      "<h2 class='mt'>次卡流水</h2>" + ledgerList(ledgers)
    );
  }
  function viewCWarranties() {
    var list = state.warranties.filter(function (w) { return w.customerId === actor().customerId; });
    return kicker("质保") + backLink("/c/me") + "<h1>我的质保</h1>" + warrantyList(list);
  }
  function viewCOrders() {
    var list = state.consumptions.filter(function (c) { return c.customerId === actor().customerId; });
    return kicker("消费") + backLink("/c/me") + "<h1>消费记录</h1>" + consumptionList(list);
  }
  function noticeDisplay(n) {
    var title = n.title || "";
    var body = n.body || "";
    var b = n.bookingId ? byId(state.bookings, n.bookingId) : null;
    if (!b) return { title: title, body: body };
    var label = R.STATUS_LABEL[b.status] || b.status;
    var sv = service(b.serviceId);
    var svName = sv ? sv.name : "服务";
    var stalePending = /待确认/.test(title + body) && b.status !== "pending";
    var staleConfirmed = /已确认/.test(title) && b.status !== "confirmed" && b.status !== "pending";
    var staleDone = /已完成/.test(title) && b.status !== "completed";
    if (stalePending || staleConfirmed || staleDone) {
      if (n.role === "staff" || n.role === "all") {
        var cu = customer(b.customerId);
        title =
          b.status === "pending"
            ? "新预约待确认"
            : b.status === "confirmed"
            ? "预约已确认"
            : b.status === "completed"
            ? "预约已完成"
            : "预约状态更新：" + label;
        body = (cu ? cu.name : "顾客") + "的「" + svName + "」当前状态为「" + label + "」。";
      } else {
        title = "预约状态更新：" + label;
        body = "您的「" + svName + "」已更新为「" + label + "」。";
      }
    }
    return { title: title, body: body };
  }
  function noticeLine(n) {
    var d = noticeDisplay(n);
    return "<div class='item-meta'><b>" + esc(d.title) + "</b> · " + esc(d.body) + "</div>";
  }
  function viewCMe() {
    var c = customer(actor().customerId);
    var n = (state.notices || []).filter(function (x) { return x.role === "customer" && x.customerId === c.id; }).slice(0, 5);
    return (
      kicker("我的") +
      "<h1>" + esc(c.name) + "</h1><p class='sub'>演示身份 · " + esc(c.phone) + "<br>" + esc(state.demoLabel) + "</p>" +
      '<div class="list">' +
        '<a class="card clickable" href="#/c/vehicles">我的车辆<span class="right muted">' + vehiclesOf(c.id).length + " 台</span></a>" +
        '<a class="card clickable" href="#/c/bookings">我的预约</a>' +
        '<a class="card clickable" href="#/c/member">会员与次卡</a>' +
        '<a class="card clickable" href="#/c/warranties">质保记录</a>' +
        '<a class="card clickable" href="#/c/orders">消费记录</a>' +
        '<a class="card clickable" href="#/c/shop">门店介绍</a>' +
      "</div>" +
      (n.length ? "<h2 class='mt'>站内提醒（模拟）</h2><div class='card'>" + n.map(noticeLine).join("") + "</div>" : "")
    );
  }


  function occupyBlock(b, date) {
    var sv = service(b.serviceId);
    var cu = customer(b.customerId);
    var v = vehicle(b.vehicleId);
    var iv = (b.intervals || []).filter(function (i) { return i.date === date; })[0];
    var dayN = 1;
    if (b.spanDays > 1) {
      for (var i = 0; i < (b.intervals || []).length; i++) if (b.intervals[i].date === date) dayN = i + 1;
    }
    var cls = "occupy-block " + (b.spanDays > 1 ? "cross " : "") + (b.status === "pending" ? "pend " : "") + (b.status === "completed" ? "done" : "");
    return '<div class="' + cls + '" data-action="go" data-href="' + prefix() + "/booking/" + b.id + '">' +
      (iv ? iv.start + "–" + iv.end : "") + " · " + esc(sv ? sv.name : "") +
      (b.spanDays > 1 ? " · 跨日第 " + dayN + "/" + b.spanDays + " 天" : "") +
      "<div class='item-meta'>" + esc(cu ? cu.name : "") + " · " + esc(v ? v.plate : "") + " · " + esc(R.STATUS_LABEL[b.status]) + "</div></div>";
  }
  function bookingRow(b, date) {
    var sv = service(b.serviceId);
    var cu = customer(b.customerId);
    var v = vehicle(b.vehicleId);
    var ba = bay(b.bayId);
    var iv = (b.intervals || []).filter(function (i) { return i.date === date; })[0];
    return '<a class="card clickable" href="#' + prefix() + "/booking/" + b.id + '"><div class="between"><div class="item-title">' + (iv ? iv.start + "–" + iv.end : "") + " · " + esc(sv ? sv.name : "") + "</div>" + statusBadge(b.status) + "</div><div class='item-meta'>" +
      esc(cu ? cu.name : "") + " · " + esc(v ? v.plate : "") + " · " + esc(ba ? ba.name : "") + (b.spanDays > 1 ? " · 跨日" : "") + "</div></a>";
  }
  function viewToday() {
    var date = ui.boardDate || R.dateStr(new Date());
    ui.boardDate = date;
    var list = R.bookingsForDate(state, date).slice().sort(function (a, b) {
      var ia = (a.intervals || []).filter(function (i) { return i.date === date; })[0];
      var ib = (b.intervals || []).filter(function (i) { return i.date === date; })[0];
      return (ia ? ia.start : a.startTime).localeCompare(ib ? ib.start : b.startTime);
    });
    var mode = ui.boardMode;
    var body = "";
    if (mode === "bay") {
      body = state.bays.map(function (ba) {
        var items = list.filter(function (b) { return b.bayId === ba.id; });
        return '<div class="bay-col"><div class="bay-head">' + esc(ba.name) + (ba.enabled === false ? "（停用）" : "") + "</div>" +
          (items.length ? items.map(function (b) { return occupyBlock(b, date); }).join("") : '<p class="muted">本日空闲</p>') +
          "</div>";
      }).join("");
    } else {
      body = list.length ? '<div class="list">' + list.map(function (b) { return bookingRow(b, date); }).join("") + "</div>" : '<div class="empty">这一天暂无预约</div>';
    }
    return (
      kicker(meta.role === "boss" ? "预约与工位" : "今日看板") +
      "<h1>" + (meta.role === "boss" ? "预约与工位管理" : "今日看板") + "</h1>" +
      '<div class="date-bar">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="board-day" data-d="-1">前一天</button>' +
        '<div class="date-label">' + fmtDate(date) + "</div>" +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="board-day" data-d="1">后一天</button>' +
      "</div>" +
      '<div class="seg mb"><button type="button" class="' + (mode === "time" ? "active" : "") + '" data-action="board-mode" data-m="time">按时间</button><button type="button" class="' + (mode === "bay" ? "active" : "") + '" data-action="board-mode" data-m="bay">按工位</button></div>' +
      body
    );
  }

  function viewStaffCustomers() {
    var q = (ui.customerQuery || "").trim();
    var list = state.customers.filter(function (c) {
      if (!q) return true;
      var cars = vehiclesOf(c.id).map(function (v) { return v.plate; }).join(" ");
      return (c.name + c.phone + cars).indexOf(q) !== -1;
    });
    return (
      kicker("顾客") + "<h1>查询顾客与车辆</h1>" +
      '<form data-form="search-customer" class="mb"><input name="q" placeholder="姓名、手机或车牌" value="' + esc(q) + '"></form>' +
      '<div class="list">' + list.map(function (c) {
        var cars = vehiclesOf(c.id);
        return '<a class="card clickable" href="#' + prefix() + "/customer/" + c.id + '"><div class="item-title">' + esc(c.name) + " · " + esc(c.phone) + '</div><div class="item-meta">' + (cars.length ? cars.map(function (v) { return v.plate + " " + v.color + v.model; }).join("；") : "暂无车辆") + "</div></a>";
      }).join("") + "</div>"
    );
  }
  function staffVehicleForm(customerId) {
    return '<form data-form="add-vehicle" data-cid="' + customerId + '">' +
      '<label class="field"><span>车牌</span><input name="plate" required></label>' +
      '<label class="field"><span>车型</span><input name="model" required></label>' +
      '<label class="field"><span>颜色</span><input name="color" required></label>' +
      '<label class="field"><span>VIN（可选）</span><input name="vin"></label>' +
      '<label class="field"><span>里程（可选）</span><input name="mileage" type="number" min="0"></label>' +
      '<button class="btn" type="submit">建立档案</button></form>';
  }
  function viewCustomerFile(id) {
    var c = customer(id);
    if (!c) return "<p>未找到顾客</p>";
    if (meta.role === "customer") return "<p>无权查看。</p>";
    var cars = vehiclesOf(c.id);
    var cards = cardsOf(c.id);
    var bks = state.bookings.filter(function (b) { return b.customerId === c.id; });
    var ws = state.warranties.filter(function (w) { return w.customerId === c.id; });
    return (
      backLink(meta.role === "boss" ? "/b/customers" : "/s/customers") +
      "<h1>" + esc(c.name) + "</h1><p class='sub'>" + esc(c.phone) + " · " + esc(c.note || "") + "</p>" +
      "<h2>车辆</h2><div class='list'>" + cars.map(function (v) {
        return '<div class="card"><div class="item-title">' + esc(v.plate) + " · " + esc(v.color) + " " + esc(v.model) + '</div><div class="item-meta">' + (v.vin ? "VIN " + esc(v.vin) : "VIN 未填") + (v.mileage ? " · " + v.mileage + " 公里" : "") + "</div></div>";
      }).join("") + "</div>" +
      '<div class="card mt"><h3>为该顾客登记车辆</h3>' + staffVehicleForm(c.id) + "</div>" +
      "<h2 class='mt'>次卡</h2>" + (cards.length ? cards.map(function (card) {
        return '<div class="card"><div class="between"><div>' + esc(card.name) + "</div><div>余 " + card.remaining + " / " + card.total + "</div></div></div>";
      }).join("") : '<p class="muted">无次卡</p>') +
      (meta.role === "boss" ? '<div class="btn-row"><button type="button" class="btn" data-action="open-issue" data-cid="' + c.id + '">发放演示次卡</button></div>' : "") +
      "<h2 class='mt'>预约</h2>" + bookingMiniList(bks) +
      "<h2 class='mt'>质保</h2>" + warrantyList(ws)
    );
  }
  function viewStaffSchedule() {
    var today = R.dateStr(new Date());
    var week = [];
    for (var i = 0; i < 7; i++) week.push(R.addDays(today, i));
    var rows = state.technicians.map(function (t) {
      return "<tr><th>技师" + esc(t.name) + "</th>" + week.map(function (d) {
        var work = R.isTechWorking(state, t.id, d);
        var n = R.bookingsForDate(state, d).filter(function (b) { return b.technicianId === t.id && R.isOccupying(b.status); }).length;
        return "<td>" + (work ? "在班" : "休") + (n ? " · " + n + " 单" : "") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return (
      kicker("排班") +
      "<h1>我的工作安排</h1><p class='sub'>店员小陈为前台。下表为近 7 日技师排班与占用单量（只读）。改排班请用老板身份。</p>" +
      '<div class="card" style="overflow:auto"><table class="data"><tr><th></th>' + week.map(function (d) { return "<th>" + Number(d.split("-")[2]) + "日</th>"; }).join("") + "</tr>" + rows + "</table></div>" +
      "<h2 class='mt'>今日已接单</h2>" + bookingMiniList(R.bookingsForDate(state, today))
    );
  }
  function viewStaffMe() {
    var notices = (state.notices || []).filter(function (n) { return n.role === "staff" || n.role === "all"; }).slice(0, 8);
    return (
      kicker("店员") +
      "<h1>店员小陈</h1><p class='sub'>前台店员 · 演示身份<br>" + esc(state.demoLabel) + "</p>" +
      '<div class="card mb"><p>可以：确认与取消、到店、施工、照片、核销、登记质保、查询顾客车辆、查看排班。</p><p>不可以：改价格、改排班、无凭证改次数、看全店经营看板、给他人赋权。</p></div>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" data-action="try-unauth-price">演示：尝试改价</button>' +
        '<button type="button" class="btn btn-ghost" data-action="try-unauth-dash">演示：尝试打开经营看板</button>' +
        '<button type="button" class="btn btn-ghost" data-action="try-unauth-card">演示：尝试直接改次数</button>' +
      "</div>" +
      (notices.length ? "<h2 class='mt'>站内提醒（模拟）</h2><div class='card'>" + notices.map(noticeLine).join("") + "</div>" : "")
    );
  }

  function viewDashboard() {
    var today = R.dateStr(new Date());
    var todayList = R.bookingsForDate(state, today);
    var counts = {};
    Object.keys(R.STATUS_LABEL).forEach(function (k) { counts[k] = 0; });
    todayList.forEach(function (b) { counts[b.status] = (counts[b.status] || 0) + 1; });
    var cars = {};
    todayList.forEach(function (b) { cars[b.vehicleId] = 1; });
    var revenue = state.consumptions.filter(function (c) { return (c.at || "").slice(0, 10) === today; }).reduce(function (s, c) { return s + (c.amount || 0); }, 0);
    function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }
    return (
      kicker("经营看板") +
      "<h1>今日概览</h1><p class='sub'>" + fmtDate(today) + " · " + esc(state.demoLabel) + "</p>" +
      '<div class="grid-3 mb">' +
        stat(todayList.length, "今日预约（含跨日占用）") +
        stat(Object.keys(cars).length, "今日车次") +
        stat(counts.in_progress || 0, "施工中") +
        stat(counts.pending || 0, "待确认") +
        stat((counts.arrived || 0) + (counts.ready || 0), "已到店 / 待交车") +
        stat(fmtMoney(revenue), "今日已记录结算（演示）") +
      "</div>" +
      "<h2>各状态数量（今日）</h2>" +
      '<div class="card">' + Object.keys(R.STATUS_LABEL).map(function (k) {
        return '<span class="badge st-' + k + '" style="margin:0 8px 8px 0">' + R.STATUS_LABEL[k] + " " + (counts[k] || 0) + "</span>";
      }).join("") + "</div>" +
      "<h2 class='mt'>今日工单</h2>" + bookingMiniList(todayList)
    );
  }
  function viewOps() {
    return (
      kicker("经营") +
      "<h1>经营</h1><p class='sub'>消费、次卡、质保与顾客档案。</p>" +
      '<div class="list">' +
        '<a class="card clickable" href="#/b/orders">消费记录与统计</a>' +
        '<a class="card clickable" href="#/b/cards">会员与次卡</a>' +
        '<a class="card clickable" href="#/b/warranties">质保记录</a>' +
        '<a class="card clickable" href="#/b/customers">顾客与车辆档案</a>' +
      "</div>"
    );
  }
  function viewOrdersBoss() {
    var list = state.consumptions.slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
    var sum = list.reduce(function (s, c) { return s + (c.amount || 0); }, 0);
    var guests = {};
    list.forEach(function (c) { guests[c.customerId] = 1; });
    return kicker("消费") + backLink("/b/ops") + "<h1>消费记录与统计</h1><p class='sub'>累计已记录结算 " + fmtMoney(sum) + "（演示，非真实收款）· 有消费记录的顾客 " + Object.keys(guests).length + " 人</p>" + consumptionList(list);
  }
  function viewCardsBoss() {
    return (
      kicker("次卡") + backLink("/b/ops") +
      "<h1>会员与次卡</h1><p class='sub'>发放走凭证，核销走流水。没有「直接改余次」入口。</p>" +
      '<div class="list">' + state.cards.map(function (c) {
        var cu = customer(c.customerId);
        return '<div class="card"><div class="between"><div class="item-title">' + esc(cu ? cu.name : "") + " · " + esc(c.name) + "</div><div>余 " + c.remaining + " / " + c.total + "</div></div><div class='item-meta'>适用 " + esc(applicableLabel(c)) + " · " + esc(c.issuedBy) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="btn-row"><button type="button" class="btn" data-action="open-issue">发放演示次卡</button></div>' +
      "<h2 class='mt'>全部流水</h2>" + ledgerList(state.cardLedger.slice().reverse())
    );
  }
  function viewWarrantiesBoss() {
    return kicker("质保") + backLink("/b/ops") + "<h1>质保记录</h1>" + warrantyList(state.warranties.slice().reverse());
  }
  function viewSettings() {
    return (
      kicker("设置") +
      "<h1>设置</h1>" +
      '<div class="list">' +
        '<a class="card clickable" href="#/b/store">门店资料与规则</a>' +
        '<a class="card clickable" href="#/b/services">服务项目</a>' +
        '<a class="card clickable" href="#/b/staff">员工与排班</a>' +
        '<a class="card clickable" href="#/b/bays">工位管理</a>' +
        '<a class="card clickable" href="#/b/permissions">权限说明</a>' +
      "</div>"
    );
  }


  function viewStore() {
    var s = state.store;
    return (
      backLink("/b/settings") + "<h1>门店资料与规则</h1><p class='sub'>" + esc(state.visualNote) + "</p>" +
      '<form data-form="update-store" class="card">' +
        '<label class="field"><span>门店名称</span><input name="name" value="' + esc(s.name) + '"></label>' +
        '<label class="field"><span>地址</span><input name="address" value="' + esc(s.address) + '"></label>' +
        '<label class="field"><span>电话</span><input name="phone" value="' + esc(s.phone) + '"></label>' +
        '<label class="field"><span>介绍</span><textarea name="intro">' + esc(s.intro) + "</textarea></label>" +
        '<label class="field"><span>公告</span><textarea name="announcement">' + esc(s.announcement) + "</textarea></label>" +
        '<label class="field"><span>营业开始</span><input name="hoursStart" value="' + esc(s.hours.start) + '"></label>' +
        '<label class="field"><span>营业结束</span><input name="hoursEnd" value="' + esc(s.hours.end) + '"></label>' +
        '<label class="field"><span>已确认预约的取消提前量（小时）</span><input name="cancelLeadHours" type="number" min="0" max="72" value="' + esc(state.settings.cancelLeadHours) + '"></label>' +
        '<p class="muted">接单方式：' + esc(state.settings.confirmModeNote) + " 支付方式：先约后付。</p>" +
        '<button class="btn" type="submit">保存</button>' +
      "</form>"
    );
  }
  function viewServicesBoss() {
    return (
      backLink("/b/settings") + "<h1>服务项目</h1>" +
      state.services.map(function (s) {
        return '<form class="card mb" data-form="update-service" data-id="' + s.id + '">' +
          '<div class="between"><strong>' + esc(s.name) + "</strong><span class='badge'>" + (s.enabled === false ? "已下架" : "上架") + "</span></div>" +
          '<label class="field"><span>价格（元）</span><input name="price" type="number" min="0" value="' + s.price + '"></label>' +
          '<label class="field"><span>时长（分钟，短单）</span><input name="durationMinutes" type="number" min="0" value="' + (s.durationMinutes || 0) + '"></label>' +
          '<label class="field"><span>跨日天数（大于等于 2 视为跨日占用）</span><input name="durationDays" type="number" min="0" value="' + (s.durationDays || 0) + '"></label>' +
          '<label class="field"><span>介绍</span><textarea name="description">' + esc(s.description) + "</textarea></label>" +
          '<label class="field"><span><input type="checkbox" name="enabled"' + (s.enabled !== false ? " checked" : "") + "> 上架</span></label>" +
          '<button class="btn btn-sm" type="submit">保存</button></form>';
      }).join("")
    );
  }
  function viewStaffBoss() {
    var days = ["日", "一", "二", "三", "四", "五", "六"];
    return (
      backLink("/b/settings") + "<h1>员工与排班</h1><p class='sub'>店员小陈为前台（演示账号）。技师排班按星期循环。</p>" +
      state.technicians.map(function (t) {
        var cells = [0, 1, 2, 3, 4, 5, 6].map(function (w) {
          var item = (state.schedules || []).find(function (s) { return s.technicianId === t.id && s.weekday === w; });
          var on = !item || item.working !== false;
          return '<button type="button" class="opt' + (on ? " selected" : "") + '" data-action="toggle-sched" data-tid="' + t.id + '" data-w="' + w + '" data-on="' + (on ? "1" : "0") + '">周' + days[w] + (on ? " 在班" : " 休") + "</button>";
        }).join("");
        return '<div class="card mb"><div class="between"><div class="item-title">技师' + esc(t.name) + " · " + esc(t.title) + "</div>" +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-tech" data-id="' + t.id + '" data-on="' + (t.enabled === false ? "0" : "1") + '">' + (t.enabled === false ? "已停用 · 点此启用" : "停用") + "</button></div>" +
          '<div class="choice mt">' + cells + "</div></div>";
      }).join("")
    );
  }
  function viewBays() {
    return (
      backLink("/b/settings") +
      "<h1>工位管理</h1><p class='sub'>工位是可预约资源。跨日占用是连续多个营业日的工位与技师区间锁，不是把单日工位简单改个名字。</p>" +
      state.bays.map(function (b) {
        return '<form class="card mb" data-form="update-bay" data-id="' + b.id + '">' +
          '<label class="field"><span>名称</span><input name="name" value="' + esc(b.name) + '"></label>' +
          '<label class="field"><span>类型</span><select name="type"><option value="wash"' + (b.type === "wash" ? " selected" : "") + ">精洗</option><option value='wrap'" + (b.type === "wrap" ? " selected" : "") + ">贴膜</option></select></label>" +
          '<label class="field"><span><input type="checkbox" name="enabled"' + (b.enabled !== false ? " checked" : "") + "> 启用</span></label>" +
          '<button class="btn btn-sm" type="submit">保存</button></form>';
      }).join("") +
      '<form class="card" data-form="create-bay"><h3>新增工位</h3><label class="field"><span>名称</span><input name="name" required></label>' +
      '<label class="field"><span>类型</span><select name="type"><option value="wash">精洗</option><option value="wrap">贴膜</option></select></label>' +
      '<button class="btn" type="submit">添加</button></form>'
    );
  }
  function viewPermissions() {
    return (
      backLink("/b/settings") +
      "<h1>权限说明</h1>" +
      '<div class="card"><p>演示环境不做真实开通。管理员开通禁止空表自提。正式交付时由实施绑定老板身份或使用一次性开通码。</p>' +
      "<p>权限由业务规则校验，不只靠隐藏按钮。可用顶部「演示角色切换」体验三角色，并在对应页面尝试越权按钮，应被拒绝并给出原因。</p>" +
      "<ul><li>顾客：不可确认、改施工状态、核销、查看他人档案。</li><li>店员：不可改价、改排班、无凭证改次数、看经营看板、赋权。</li><li>老板：拥有店员全部操作，可配置项目、工位、排班、发放次卡、查看看板。</li></ul>" +
      '<button type="button" class="btn btn-ghost" data-action="try-grant">演示：尝试空表自提管理员</button></div>'
    );
  }

  function render() {
    closeModal();
    state = state || AFStore.loadState();
    meta = AFStore.loadMeta();
    var p = parseHash();
    var roleMap = { c: "customer", s: "staff", b: "boss" };
    if (p.root && roleMap[p.root] && roleMap[p.root] !== meta.role) {
      toast("已保持在" + state.actors[meta.role].label + "的界面。当前角色不能打开其他端页面（权限由规则校验）。", "err");
      location.hash = "#" + defaultPath(meta.role);
      return;
    }
    var html = "";
    try {
      html = route(p);
    } catch (err) {
      html = '<div class="callout danger">页面渲染出错：' + esc(err.message) + "</div>";
      console.error(err);
    }
    document.getElementById("root").innerHTML = shell(html, p.path);
    var pathSaved = p.path;
    if (location.hash.indexOf("?") !== -1) pathSaved = p.path + "?" + location.hash.split("?")[1];
    meta.lastPath[meta.role] = pathSaved;
    AFStore.saveMeta(meta);
    var sel = document.getElementById("roleSwitch");
    if (sel) sel.addEventListener("change", function () { setRole(sel.value); });
  }

  function route(p) {
    var r = p.root, page = p.page, id = p.id;
    if (r === "c") {
      if (!page || page === "home") return viewCHome();
      if (page === "shop") return viewCShop();
      if (page === "services") return viewCServices();
      if (page === "service") return viewCService(id);
      if (page === "technicians") return viewCTechs();
      if (page === "technician") return viewCTech(id);
      if (page === "vehicles") return viewCVehicles();
      if (page === "vehicle" && id === "new") return viewCVehicleNew();
      if (page === "vehicle") return viewCVehicle(id);
      if (page === "book") return viewCBook(p.q);
      if (page === "bookings") return viewCBookings();
      if (page === "booking") return viewBookingDetail(id, "customer");
      if (page === "member") return viewCMember();
      if (page === "warranties") return viewCWarranties();
      if (page === "warranty") return viewWarranty(id, "customer");
      if (page === "orders") return viewCOrders();
      if (page === "me") return viewCMe();
    }
    if (r === "s") {
      if (!page || page === "today") return viewToday();
      if (page === "booking") return viewBookingDetail(id, "staff");
      if (page === "customers") return viewStaffCustomers();
      if (page === "customer") return viewCustomerFile(id);
      if (page === "schedule") return viewStaffSchedule();
      if (page === "me") return viewStaffMe();
      if (page === "warranty") return viewWarranty(id, "staff");
    }
    if (r === "b") {
      if (!page || page === "dashboard") return viewDashboard();
      if (page === "bookings") return viewToday();
      if (page === "booking") return viewBookingDetail(id, "boss");
      if (page === "ops") return viewOps();
      if (page === "orders") return viewOrdersBoss();
      if (page === "cards") return viewCardsBoss();
      if (page === "warranties") return viewWarrantiesBoss();
      if (page === "warranty") return viewWarranty(id, "boss");
      if (page === "customers") return viewStaffCustomers();
      if (page === "customer") return viewCustomerFile(id);
      if (page === "settings") return viewSettings();
      if (page === "store") return viewStore();
      if (page === "services") return viewServicesBoss();
      if (page === "staff") return viewStaffBoss();
      if (page === "bays") return viewBays();
      if (page === "permissions") return viewPermissions();
    }
    return "<p>未找到页面</p><p><a href='#" + defaultPath() + "'>回首页</a></p>";
  }

  function setRole(role) {
    closeModal();
    meta.role = role;
    ui.book = {};
    AFStore.saveMeta(meta);
    var next = "#" + (meta.lastPath[role] || defaultPath(role));
    if (location.hash === next) render();
    else location.hash = next;
  }

  function resetDemo() {
    closeModal();
    if (!confirm("将清除本机演示操作，恢复为预置虚拟数据。确定重置？")) return;
    state = AFStore.resetState();
    ui.book = {};
    ui.boardDate = null;
    toast("已恢复预置演示数据。", "ok");
    render();
  }


  function onClick(e) {
    var t = e.target.closest("[data-action]");
    if (!t) return;
    var act = t.getAttribute("data-action");
    if (act === "toggle-frame") {
      meta.frame = meta.frame === "phone" ? "wide" : "phone";
      AFStore.saveMeta(meta);
      render();
      return;
    }
    if (act === "reset") { resetDemo(); return; }
    if (act === "open-guide") { openGuide(); return; }
    if (act === "go") { goto(t.getAttribute("data-href")); return; }
    if (act === "book-field") {
      ui.book[t.getAttribute("data-k")] = t.getAttribute("data-v");
      ui.book.touched = true;
      if (t.getAttribute("data-k") !== "startTime") { ui.book.startTime = ""; ui.book.bayId = ""; }
      render();
      return;
    }
    if (act === "pick-slot") {
      ui.book.startTime = t.getAttribute("data-start");
      ui.book.bayId = t.getAttribute("data-bay");
      ui.book.touched = true;
      render();
      return;
    }
    if (act === "submit-booking") { submitBooking(); return; }
    if (act === "transition") {
      var op = t.getAttribute("data-op");
      var id = t.getAttribute("data-id");
      if (op === "cancel" && !confirm("取消后将释放工位与技师占用，确定吗？")) return;
      if (op === "noshow" && !confirm("标记逾期未到将释放占位，确定吗？")) return;
      applyRes(R.applyTransition(state, actor(), id, op, {}, new Date()));
      return;
    }
    if (act === "try-unauth") {
      applyRes(R.applyTransition(state, actor(), t.getAttribute("data-id"), t.getAttribute("data-op"), { payMethod: "cash" }, new Date()));
      return;
    }
    if (act === "try-unauth-price") {
      applyRes(R.updateService(state, actor(), { id: "sv_detail", price: 1, field: "price" }));
      return;
    }
    if (act === "try-unauth-dash") {
      var d = R.can(actor(), "view_dashboard");
      toast(d.ok ? "可以查看" : d.message, d.ok ? "ok" : "err");
      return;
    }
    if (act === "try-unauth-card") {
      applyRes(R.changeCardTimesDirect());
      return;
    }
    if (act === "try-grant") {
      var g = R.can(actor(), "grant_role");
      toast(g.message, "err");
      return;
    }
    if (act === "claim-card") {
      applyRes(R.issueCard(state, actor(), {
        demoClaim: true,
        total: 5,
        name: "演示精洗次卡（5 次）",
        applicableServiceIds: ["sv_wash", "sv_detail"],
      }, new Date()));
      return;
    }
    if (act === "board-day") {
      ui.boardDate = R.addDays(ui.boardDate || R.dateStr(new Date()), Number(t.getAttribute("data-d")));
      render();
      return;
    }
    if (act === "board-mode") { ui.boardMode = t.getAttribute("data-m"); render(); return; }
    if (act === "open-checkout") { openCheckout(t.getAttribute("data-id"), t.getAttribute("data-merge") === "1"); return; }
    if (act === "open-photo") { openPhoto(t.getAttribute("data-id")); return; }
    if (act === "open-warranty") { openWarranty(t.getAttribute("data-id")); return; }
    if (act === "open-issue") { openIssue(t.getAttribute("data-cid")); return; }
    if (act === "toggle-sched") {
      var on = t.getAttribute("data-on") === "1";
      applyRes(R.updateSchedule(state, actor(), { technicianId: t.getAttribute("data-tid"), weekday: Number(t.getAttribute("data-w")), working: !on }));
      return;
    }
    if (act === "toggle-tech") {
      applyRes(R.updateTechnician(state, actor(), { id: t.getAttribute("data-id"), enabled: t.getAttribute("data-on") !== "1" }));
      return;
    }
    if (act === "close-modal") { closeModal(); return; }
    if (act === "pick-photo") {
      var res = R.uploadPhoto(state, actor(), {
        bookingId: t.getAttribute("data-id"),
        stage: t.getAttribute("data-stage"),
        src: t.getAttribute("data-src"),
        label: t.getAttribute("data-label"),
      }, new Date());
      if (applyRes(res, true)) { closeModal(); render(); }
    }
  }

  function submitBooking() {
    var d = ui.book;
    var sv = service(d.serviceId);
    if (sv && sv.durationDays >= 2 && !d.startTime) {
      var slots = R.listAvailableSlots(state, { serviceId: d.serviceId, technicianId: d.technicianId, date: d.startDate, now: new Date(), vehicleId: d.vehicleId });
      if (slots.ok && slots.slots[0]) {
        d.startTime = slots.slots[0].startTime;
        d.bayId = slots.slots[0].bayId;
      }
    }
    var res = R.submitBooking(state, actor(), {
      serviceId: d.serviceId,
      vehicleId: d.vehicleId,
      technicianId: d.technicianId,
      startDate: d.startDate,
      startTime: d.startTime,
      bayId: d.bayId,
    }, new Date());
    if (res.ok) {
      state = res.state;
      AFStore.saveState(state);
      toast(res.message, "ok");
      ui.book = {};
      goto("/c/booking/" + res.booking.id);
    } else toast(res.message, "err");
  }

  function onSubmit(e) {
    var form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    var fd = new FormData(form);
    var type = form.getAttribute("data-form");
    var res;
    if (type === "add-vehicle") {
      res = R.addVehicle(state, actor(), {
        customerId: form.getAttribute("data-cid") || actor().customerId,
        plate: fd.get("plate"),
        model: fd.get("model"),
        color: fd.get("color"),
        vin: fd.get("vin"),
        mileage: fd.get("mileage"),
      }, new Date());
      if (res.ok) {
        state = res.state;
        AFStore.saveState(state);
        toast(res.message, "ok");
        if (meta.role === "customer") goto("/c/vehicle/" + res.vehicle.id);
        else render();
      } else toast(res.message, "err");
      return;
    }
    if (type === "update-vehicle") {
      applyRes(R.updateVehicle(state, actor(), {
        id: form.getAttribute("data-id"),
        plate: fd.get("plate"),
        model: fd.get("model"),
        color: fd.get("color"),
        vin: fd.get("vin"),
        mileage: fd.get("mileage"),
      }));
      return;
    }
    if (type === "search-customer") {
      ui.customerQuery = fd.get("q") || "";
      render();
      return;
    }
    if (type === "update-store") {
      applyRes(R.updateStore(state, actor(), {
        name: fd.get("name"),
        address: fd.get("address"),
        phone: fd.get("phone"),
        intro: fd.get("intro"),
        announcement: fd.get("announcement"),
        hoursStart: fd.get("hoursStart"),
        hoursEnd: fd.get("hoursEnd"),
        cancelLeadHours: fd.get("cancelLeadHours"),
      }));
      return;
    }
    if (type === "update-service") {
      applyRes(R.updateService(state, actor(), {
        id: form.getAttribute("data-id"),
        price: fd.get("price"),
        durationMinutes: fd.get("durationMinutes"),
        durationDays: fd.get("durationDays"),
        description: fd.get("description"),
        enabled: form.querySelector('[name="enabled"]').checked,
        field: "price",
      }));
      return;
    }
    if (type === "update-bay") {
      applyRes(R.updateBay(state, actor(), {
        id: form.getAttribute("data-id"),
        name: fd.get("name"),
        type: fd.get("type"),
        enabled: form.querySelector('[name="enabled"]').checked,
      }));
      return;
    }
    if (type === "create-bay") {
      applyRes(R.updateBay(state, actor(), { create: true, name: fd.get("name"), type: fd.get("type") }));
      return;
    }
    if (type === "checkout") {
      var id = form.getAttribute("data-id");
      var merge = form.getAttribute("data-merge") === "1";
      var pay = fd.get("payMethod");
      var payload = { payMethod: pay, cardId: pay === "card" ? fd.get("cardId") : null };
      if (form.querySelector('[name="wantWarranty"]') && form.querySelector('[name="wantWarranty"]').checked) {
        payload.warranty = { startDate: fd.get("wStart"), endDate: fd.get("wEnd"), note: fd.get("wNote") };
      }
      res = R.applyTransition(state, actor(), id, merge ? "finish_and_checkout" : "checkout", payload, new Date());
      if (applyRes(res, true)) { closeModal(); render(); }
      return;
    }
    if (type === "warranty") {
      res = R.addWarrantyStandalone(state, actor(), {
        bookingId: form.getAttribute("data-id"),
        startDate: fd.get("wStart"),
        endDate: fd.get("wEnd"),
        note: fd.get("wNote"),
      }, new Date());
      if (applyRes(res, true)) { closeModal(); render(); }
      return;
    }
    if (type === "issue-card") {
      res = R.issueCard(state, actor(), {
        customerId: fd.get("customerId"),
        name: fd.get("name"),
        total: fd.get("total"),
        applicableServiceIds: fd.getAll("applicable"),
      }, new Date());
      if (applyRes(res, true)) { closeModal(); render(); }
    }
  }

  function closeModal() {
    var m = document.getElementById("modalBack");
    if (m) m.remove();
  }
  function openModal(html, modalClass) {
    closeModal();
    var d = document.createElement("div");
    d.id = "modalBack";
    d.className = "modal-back";
    d.innerHTML = '<div class="modal' + (modalClass ? " " + esc(modalClass) : "") + '">' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d) closeModal(); });
    document.body.appendChild(d);
  }
  function openGuide() {
    openModal(
      "<h2>体验指引</h2><p class='sub'>" + esc(state.demoLabel) + " · " + esc(state.visualNote) + "</p>" +
      '<div class="guide"><ol>' +
        "<li>顾客阿明：打开「我的车辆」可见两台车；到「预约」提交一笔精洗；查看已有待确认单；在「会员」看次卡余次；在「质保记录」点进太阳膜记录，可查看质保详情与该工单的完工照片。</li>" +
        "<li>店员小陈：今日看板可处理阿珍「已到店」精洗：开始施工 → 登记照片 → 完工并核销。核销后详情页仍显示「已核销、不可重复核销」。也可确认阿明后天的待确认单。</li>" +
        "<li>跨日冲突：顾客端预约「全车改色膜」，技师选小河，日期选今天的次日（小周隐形车衣占用中），应被拒绝并说明冲突的工位、技师与可执行的下一步（改期或更换技师）。贴膜单不会改分到精洗工位。</li>" +
        "<li>次卡：用店员身份把小周今日傍晚洗车走到核销，选择余次为 0 的次卡应被拒绝。阿明精洗可用其精洗次卡扣 1 次，重复核销应被拒绝。</li>" +
        "<li>越权：顾客详情页点「尝试确认 / 核销」；店员「我的」里尝试改价、看板、直接改次数，均应失败。</li>" +
        "<li>老板林：看经营看板、发放次卡、改项目价格、管理工位。取消小周跨日单后，原占用应释放，可再约同一技师与工位。</li>" +
      "</ol></div><button class='btn btn-block' data-action='close-modal'>关闭</button>"
    );
  }
  function openCheckout(id, merge) {
    var b = byId(state.bookings, id);
    var cards = cardsOf(b.customerId);
    var sv = service(b.serviceId);
    var defEnd = sv && sv.warrantyDays ? R.addDays(R.dateStr(new Date()), sv.warrantyDays) : R.addDays(R.dateStr(new Date()), 365);
    openModal(
      "<h2>" + (merge ? "完工并核销" : "交车并核销") + "</h2><p class='sub'>先约后付，此处只记录演示结算方式，不发生真实支付。</p>" +
      '<form data-form="checkout" data-id="' + id + '" data-merge="' + (merge ? "1" : "0") + '">' +
        '<div class="field-label">结算方式</div>' +
        R.PAY_METHODS.map(function (pm) {
          return '<label class="field" style="margin-bottom:6px"><input type="radio" name="payMethod" value="' + pm.id + '"' + (pm.id === "cash" ? " checked" : "") + "> " + esc(pm.label) + "</label>";
        }).join("") +
        '<label class="field"><span>若选次卡，请选择凭证</span><select name="cardId">' +
          (cards.length ? cards.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "（余 " + c.remaining + "）</option>"; }).join("") : "<option value=''>该顾客没有次卡</option>") +
        "</select></label>" +
        '<label class="field"><span><input type="checkbox" name="wantWarranty"' + (sv && sv.warrantyDays ? " checked" : "") + "> 同时登记简易店内质保</span></label>" +
        '<label class="field"><span>质保开始</span><input name="wStart" type="date" value="' + R.dateStr(new Date()) + '"></label>' +
        '<label class="field"><span>质保结束</span><input name="wEnd" type="date" value="' + defEnd + '"></label>' +
        '<label class="field"><span>说明</span><textarea name="wNote">门店简易质保记录，不对接膜厂官方质保系统。</textarea></label>' +
        '<div class="btn-row"><button class="btn" type="submit">确认核销</button><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button></div>' +
      "</form>"
    );
  }
  function openPhoto(id) {
    openModal(
      '<div class="modal-head"><div><h2>登记施工照片</h2><p class="sub">请选择阶段，再点一张本地演示占位图。不连接真实相册或外部图床。</p></div>' +
        '<button type="button" class="btn btn-ghost btn-sm modal-close" data-action="close-modal">关闭</button></div>' +
      '<div class="modal-scroll">' +
      R.PHOTO_STAGES.map(function (st) {
        var ph = (state.placeholders || AFData.PLACEHOLDERS).filter(function (p) { return p.stage === st.id; });
        if (!ph.length) return "";
        return "<h3>" + esc(st.label) + "</h3><div class='photos'>" + ph.map(function (pic) {
          return "<figure style='cursor:pointer' data-action='pick-photo' data-id='" + id + "' data-stage='" + st.id + "' data-src='" + esc(pic.src) + "' data-label='" + esc(pic.label) + "'><img src='" + esc(pic.src) + "' alt=''><figcaption>" + esc(pic.label) + "</figcaption></figure>";
        }).join("") + "</div>";
      }).join("") +
      "</div>" +
      '<div class="modal-foot"><button type="button" class="btn btn-ghost btn-block" data-action="close-modal">关闭</button></div>',
      "photo-picker"
    );
  }
  function openWarranty(id) {
    var b = byId(state.bookings, id);
    var sv = service(b.serviceId);
    var end = sv && sv.warrantyDays ? R.addDays(R.dateStr(new Date()), sv.warrantyDays) : R.addDays(R.dateStr(new Date()), 365);
    openModal(
      "<h2>登记简易质保</h2><p class='sub'>仅门店自有记录，不对接膜厂官方质保系统。</p>" +
      '<form data-form="warranty" data-id="' + id + '">' +
        '<label class="field"><span>开始日</span><input name="wStart" type="date" value="' + R.dateStr(new Date()) + '"></label>' +
        '<label class="field"><span>结束日</span><input name="wEnd" type="date" value="' + end + '"></label>' +
        '<label class="field"><span>说明</span><textarea name="wNote">门店简易质保记录，不对接膜厂官方质保系统。</textarea></label>' +
        '<div class="btn-row"><button class="btn" type="submit">保存</button><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button></div></form>'
    );
  }
  function openIssue(cid) {
    openModal(
      "<h2>发放次卡</h2><p class='sub'>这是凭证发放，会写入流水，不是直接改次数。</p>" +
      '<form data-form="issue-card">' +
        '<label class="field"><span>顾客</span><select name="customerId">' +
          state.customers.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cid ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") +
        "</select></label>" +
        '<label class="field"><span>名称</span><input name="name" value="演示次卡"></label>' +
        '<label class="field"><span>次数</span><input name="total" type="number" min="1" max="100" value="5"></label>' +
        '<div class="field-label">适用项目</div>' +
        state.services.map(function (s) {
          return '<label class="field" style="margin-bottom:4px"><input type="checkbox" name="applicable" value="' + s.id + '"' + (s.cardEligible ? " checked" : "") + "> " + esc(s.name) + "</label>";
        }).join("") +
        '<div class="btn-row"><button class="btn" type="submit">发放</button><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button></div></form>'
    );
  }

  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  window.addEventListener("hashchange", render);
  state = AFStore.loadState();
  meta = AFStore.loadMeta();
  if (!location.hash) location.hash = "#" + defaultPath(meta.role);
  else render();
})();
