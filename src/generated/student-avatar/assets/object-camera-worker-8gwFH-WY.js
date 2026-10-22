var _t = typeof self < "u" ? self : {};
function la(e, t) {
  e: {
    for (var r = ["CLOSURE_FLAGS"], n = _t, i = 0; i < r.length; i++) if ((n = n[r[i]]) == null) {
      r = null;
      break e;
    }
    r = n;
  }
  return (e = r && r[e]) != null ? e : t;
}
function D(e, t) {
  e = e.split(".");
  for (var r, n = _t; e.length && (r = e.shift()); ) e.length || t === void 0 ? n = n[r] && n[r] !== Object.prototype[r] ? n[r] : n[r] = {} : n[r] = t;
}
function ht() {
  throw Error("Invalid UTF8");
}
function qi(e, t) {
  return t = String.fromCharCode.apply(null, t), e == null ? t : e + t;
}
var mn, M2, yr = void 0, C2 = typeof TextDecoder < "u", x2 = typeof TextEncoder < "u";
function fa(e) {
  if (x2) e = (M2 || (M2 = new TextEncoder())).encode(e);
  else {
    let r = 0, n = new Uint8Array(3 * e.length);
    for (let i = 0; i < e.length; i++) {
      var t = e.charCodeAt(i);
      if (t < 128) n[r++] = t;
      else {
        if (t < 2048) n[r++] = t >> 6 | 192;
        else {
          if (t >= 55296 && t <= 57343) {
            if (t <= 56319 && i < e.length) {
              let s = e.charCodeAt(++i);
              if (s >= 56320 && s <= 57343) {
                t = 1024 * (t - 55296) + s - 56320 + 65536, n[r++] = t >> 18 | 240, n[r++] = t >> 12 & 63 | 128, n[r++] = t >> 6 & 63 | 128, n[r++] = 63 & t | 128;
                continue;
              }
              i--;
            }
            t = 65533;
          }
          n[r++] = t >> 12 | 224, n[r++] = t >> 6 & 63 | 128;
        }
        n[r++] = 63 & t | 128;
      }
    }
    e = r === n.length ? n : n.subarray(0, r);
  }
  return e;
}
function da(e) {
  _t.setTimeout(() => {
    throw e;
  }, 0);
}
var R2 = la(610401301, !1), Ji = la(748402147, !0);
function Zi() {
  var e = _t.navigator;
  return e && (e = e.userAgent) ? e : "";
}
var Ln, Qi = _t.navigator;
function Wr(e) {
  return Wr[" "](e), e;
}
Ln = Qi && Qi.userAgentData || null, Wr[" "] = function() {
};
var pa = {}, er = null;
function P2(e) {
  var t = e.length, r = 3 * t / 4;
  r % 3 ? r = Math.floor(r) : "=.".indexOf(e[t - 1]) != -1 && (r = "=.".indexOf(e[t - 2]) != -1 ? r - 2 : r - 1);
  var n = new Uint8Array(r), i = 0;
  return (function(s, a) {
    function o(f) {
      for (; h < s.length; ) {
        let u = s.charAt(h++), l = er[u];
        if (l != null) return l;
        if (!/^[\s\xa0]*$/.test(u)) throw Error("Unknown base64 encoding at char: " + u);
      }
      return f;
    }
    ma();
    for (var h = 0; ; ) {
      let f = o(-1), u = o(0), l = o(64), p = o(64);
      if (p === 64 && f === -1) break;
      a(f << 2 | u >> 4), l != 64 && (a(u << 4 & 240 | l >> 2), p != 64 && a(l << 6 & 192 | p));
    }
  })(e, function(s) {
    n[i++] = s;
  }), i !== r ? n.subarray(0, i) : n;
}
function ma() {
  if (!er) {
    er = {};
    var e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(""), t = ["+/=", "+/", "-_=", "-_.", "-_"];
    for (let r = 0; r < 5; r++) {
      let n = e.concat(t[r].split(""));
      pa[r] = n;
      for (let i = 0; i < n.length; i++) {
        let s = n[i];
        er[s] === void 0 && (er[s] = i);
      }
    }
  }
}
var $2 = typeof Uint8Array < "u", ga = !(!(R2 && Ln && Ln.brands.length > 0) && (Zi().indexOf("Trident") != -1 || Zi().indexOf("MSIE") != -1)) && typeof btoa == "function", es = /[-_.]/g, D2 = { "-": "+", _: "/", ".": "=" };
function B2(e) {
  return D2[e] || "";
}
function _a(e) {
  if (!ga) return P2(e);
  e = es.test(e) ? e.replace(es, B2) : e, e = atob(e);
  var t = new Uint8Array(e.length);
  for (let r = 0; r < e.length; r++) t[r] = e.charCodeAt(r);
  return t;
}
function Zn(e) {
  return $2 && e != null && e instanceof Uint8Array;
}
var Ct = {};
function vt() {
  return j2 || (j2 = new Ne(null, Ct));
}
function Qn(e) {
  va(Ct);
  var t = e.h;
  return (t = t == null || Zn(t) ? t : typeof t == "string" ? _a(t) : null) == null ? t : e.h = t;
}
var j2, Ne = class {
  i() {
    return new Uint8Array(Qn(this) || 0);
  }
  constructor(e, t) {
    if (va(t), this.h = e, e != null && e.length === 0) throw Error("ByteString should be constructed with non-empty values");
  }
};
function va(e) {
  if (e !== Ct) throw Error("illegal external caller");
}
function ya(e, t) {
  e.__closure__error__context__984382 || (e.__closure__error__context__984382 = {}), e.__closure__error__context__984382.severity = t;
}
var U2 = void 0;
function rr(e) {
  return ya(e = Error(e), "warning"), e;
}
function xt(e, t) {
  if (e != null) {
    var r = U2 ?? (U2 = {}), n = r[e] || 0;
    n >= t || (r[e] = n + 1, ya(e = Error(), "incident"), da(e));
  }
}
function At() {
  return typeof BigInt == "function";
}
var Gt = typeof Symbol == "function" && typeof Symbol() == "symbol";
function Re(e, t, r = !1) {
  return typeof Symbol == "function" && typeof Symbol() == "symbol" ? r && Symbol.for && e ? Symbol.for(e) : e != null ? Symbol(e) : Symbol() : t;
}
var st, G2 = Re("jas", void 0, !0), ts = Re(void 0, "0di"), Jt = Re(void 0, "1oa"), de = Re(void 0, Symbol()), V2 = Re(void 0, "0ub"), H2 = Re(void 0, "0ubs"), Tn = Re(void 0, "0ubsb"), K2 = Re(void 0, "0actk"), Aa = Re("m_m", "lb", !0), rs = Re(), wa = { Wa: { value: 0, configurable: !0, writable: !0, enumerable: !1 } }, Ea = Object.defineProperties, _ = Gt ? G2 : "Wa", ns = [];
function or(e, t) {
  Gt || _ in e || Ea(e, wa), e[_] |= t;
}
function X(e, t) {
  Gt || _ in e || Ea(e, wa), e[_] = t;
}
function hr(e) {
  return or(e, 34), e;
}
function nr(e) {
  return or(e, 8192), e;
}
X(ns, 7), st = Object.freeze(ns);
var ba = {};
function Rt(e) {
  return e != null && e[Aa] === ba;
}
function he(e, t) {
  return t === void 0 ? e.i !== yt && !!(2 & e.B[_]) : !!(2 & t) && e.i !== yt;
}
var yt = {};
function zr(e, t) {
  if (e != null) {
    if (typeof e == "string") e = e ? new Ne(e, Ct) : vt();
    else if (e.constructor !== Ne) if (Zn(e)) e = e.length ? new Ne(new Uint8Array(e), Ct) : vt();
    else {
      if (!t) throw Error();
      e = void 0;
    }
  }
  return e;
}
class is {
  constructor(t, r, n) {
    this.h = t, this.i = r, this.l = n;
  }
  next() {
    var t = this.h.next();
    return t.done || (t.value = this.i.call(this.l, t.value)), t;
  }
  [Symbol.iterator]() {
    return this;
  }
}
function ka(e, t, r) {
  var n, i = 128 & t ? 0 : -1, s = e.length;
  (n = !!s) && (n = (n = e[s - 1]) != null && typeof n == "object" && n.constructor === Object);
  var a = s + (n ? -1 : 0);
  for (t = 128 & t ? 1 : 0; t < a; t++) r(t - i, e[t]);
  if (n) {
    e = e[s - 1];
    for (let o in e) !isNaN(o) && r(+o, e[o]);
  }
}
var Sa = {};
function Vt(e) {
  return 128 & e ? Sa : void 0;
}
function Yr(e) {
  return e.jb = !0, e;
}
var W2 = Yr((e) => typeof e == "number"), ss = Yr((e) => typeof e == "string"), z2 = Yr((e) => typeof e == "boolean"), Xr = typeof _t.BigInt == "function" && typeof _t.BigInt(0) == "bigint";
function Y(e) {
  var t = e;
  if (ss(t)) {
    if (!/^\s*(?:-?[1-9]\d*|0)?\s*$/.test(t)) throw Error(String(t));
  } else if (W2(t) && !Number.isSafeInteger(t)) throw Error(String(t));
  return Xr ? BigInt(e) : e = z2(e) ? e ? "1" : "0" : ss(e) ? e.trim() || "0" : String(e);
}
var Fn = Yr((e) => Xr ? e >= X2 && e <= J2 : e[0] === "-" ? as(e, Y2) : as(e, q2)), Y2 = Number.MIN_SAFE_INTEGER.toString(), X2 = Xr ? BigInt(Number.MIN_SAFE_INTEGER) : void 0, q2 = Number.MAX_SAFE_INTEGER.toString(), J2 = Xr ? BigInt(Number.MAX_SAFE_INTEGER) : void 0;
function as(e, t) {
  if (e.length > t.length) return !1;
  if (e.length < t.length || e === t) return !0;
  for (let r = 0; r < e.length; r++) {
    let n = e[r], i = t[r];
    if (n > i) return !1;
    if (n < i) return !0;
  }
}
var La, Z2 = typeof Uint8Array.prototype.slice == "function", I = 0, x = 0;
function In(e) {
  var t = e >>> 0;
  I = t, x = (e - t) / 4294967296 >>> 0;
}
function wt(e) {
  if (e < 0) {
    In(-e);
    let [t, r] = ri(I, x);
    I = t >>> 0, x = r >>> 0;
  } else In(e);
}
function ei(e) {
  var t = La || (La = new DataView(new ArrayBuffer(8)));
  t.setFloat32(0, +e, !0), x = 0, I = t.getUint32(0, !0);
}
function Ta(e, t) {
  var r = 4294967296 * t + (e >>> 0);
  return Number.isSafeInteger(r) ? r : Pt(e, t);
}
function Q2(e, t) {
  return Y(At() ? BigInt.asUintN(64, (BigInt(t >>> 0) << BigInt(32)) + BigInt(e >>> 0)) : Pt(e, t));
}
function Fa(e, t) {
  return At() ? Y(BigInt.asIntN(64, (BigInt.asUintN(32, BigInt(t)) << BigInt(32)) + BigInt.asUintN(32, BigInt(e)))) : Y(ti(e, t));
}
function Pt(e, t) {
  if (e >>>= 0, (t >>>= 0) <= 2097151) var r = "" + (4294967296 * t + e);
  else At() ? r = "" + (BigInt(t) << BigInt(32) | BigInt(e)) : (e = (16777215 & e) + 6777216 * (r = 16777215 & (e >>> 24 | t << 8)) + 6710656 * (t = t >> 16 & 65535), r += 8147497 * t, t *= 2, e >= 1e7 && (r += e / 1e7 >>> 0, e %= 1e7), r >= 1e7 && (t += r / 1e7 >>> 0, r %= 1e7), r = t + os(r) + os(e));
  return r;
}
function os(e) {
  return e = String(e), "0000000".slice(e.length) + e;
}
function ti(e, t) {
  if (2147483648 & t) if (At()) e = "" + (BigInt(0 | t) << BigInt(32) | BigInt(e >>> 0));
  else {
    let [r, n] = ri(e, t);
    e = "-" + Pt(r, n);
  }
  else e = Pt(e, t);
  return e;
}
function ur(e) {
  if (e.length < 16) wt(Number(e));
  else if (At()) e = BigInt(e), I = Number(e & BigInt(4294967295)) >>> 0, x = Number(e >> BigInt(32) & BigInt(4294967295));
  else {
    let t = +(e[0] === "-");
    x = I = 0;
    let r = e.length;
    for (let n = t, i = (r - t) % 6 + t; i <= r; n = i, i += 6) {
      let s = Number(e.slice(n, i));
      x *= 1e6, (I = 1e6 * I + s) >= 4294967296 && (x += Math.trunc(I / 4294967296), x >>>= 0, I >>>= 0);
    }
    if (t) {
      let [n, i] = ri(I, x);
      I = n, x = i;
    }
  }
}
function ri(e, t) {
  return t = ~t, e ? e = 1 + ~e : t += 1, [e, t];
}
function we(e) {
  return Array.prototype.slice.call(e);
}
var pt = typeof BigInt == "function" ? BigInt.asIntN : void 0, Nn = typeof BigInt == "function" ? BigInt.asUintN : void 0, Oe = Number.isSafeInteger, cr = Number.isFinite, nt = Math.trunc, e1 = Y(0);
function Ia(e) {
  if (typeof e != "number") throw Error(`Value of float/double field must be a number, found ${typeof e}: ${e}`);
  return e;
}
function fe(e) {
  return e == null || typeof e == "number" ? e : e === "NaN" || e === "Infinity" || e === "-Infinity" ? Number(e) : void 0;
}
function Nr(e) {
  if (typeof e != "boolean") {
    var t = typeof e;
    throw Error(`Expected boolean but got ${t != "object" ? t : e ? Array.isArray(e) ? "array" : t : "null"}: ${e}`);
  }
  return e;
}
var t1 = /^-?([1-9][0-9]*|0)(\.[0-9]+)?$/;
function Ht(e) {
  switch (typeof e) {
    case "bigint":
      return !0;
    case "number":
      return cr(e);
    case "string":
      return t1.test(e);
    default:
      return !1;
  }
}
function Ke(e) {
  if (e != null) {
    if (!cr(e)) throw rr("enum");
    e |= 0;
  }
  return e;
}
function Et(e) {
  if (e == null) return e;
  if (typeof e == "string" && e) e = +e;
  else if (typeof e != "number") return;
  return cr(e) ? 0 | e : void 0;
}
function Na(e) {
  if (e == null) return e;
  if (typeof e == "string" && e) e = +e;
  else if (typeof e != "number") return;
  return cr(e) ? e >>> 0 : void 0;
}
function Oa(e, t) {
  if (t ?? (t = 1024), !Ht(e)) throw rr("int64");
  var r = typeof e;
  switch (t) {
    case 512:
      switch (r) {
        case "string":
          return Or(e);
        case "bigint":
          return String(pt(64, e));
        default:
          return Ra(e);
      }
    case 1024:
      switch (r) {
        case "string":
          return Pa(e);
        case "bigint":
          return Y(pt(64, e));
        default:
          return $a(e);
      }
    case 0:
      switch (r) {
        case "string":
          return Or(e);
        case "bigint":
          return Y(pt(64, e));
        default:
          return qr(e);
      }
    default:
      return (function(n, i = `unexpected value ${n}!`) {
        throw Error(i);
      })(t, "Unknown format requested type for int64");
  }
}
function Ma(e) {
  var t = e.length;
  return (e[0] === "-" ? t < 20 || t === 20 && e <= "-9223372036854775808" : t < 19 || t === 19 && e <= "9223372036854775807") ? e : (ur(e), ti(I, x));
}
function Ca(e) {
  if (e[0] === "-") var t = !1;
  else t = (t = e.length) < 20 || t === 20 && e <= "18446744073709551615";
  return t ? e : (ur(e), Pt(I, x));
}
function qr(e) {
  if (e = nt(e), !Oe(e)) {
    wt(e);
    var t = I, r = x;
    (e = 2147483648 & r) && (r = ~r >>> 0, (t = 1 + ~t >>> 0) == 0 && (r = r + 1 >>> 0)), e = typeof (t = Ta(t, r)) == "number" ? e ? -t : t : e ? "-" + t : t;
  }
  return e;
}
function xa(e) {
  return (e = nt(e)) >= 0 && Oe(e) || (wt(e), e = Ta(I, x)), e;
}
function Ra(e) {
  return e = nt(e), Oe(e) ? e = String(e) : (wt(e), e = ti(I, x)), e;
}
function Or(e) {
  var t = nt(Number(e));
  return Oe(t) ? String(t) : ((t = e.indexOf(".")) !== -1 && (e = e.substring(0, t)), Ma(e));
}
function Pa(e) {
  var t = nt(Number(e));
  return Oe(t) ? Y(t) : ((t = e.indexOf(".")) !== -1 && (e = e.substring(0, t)), At() ? Y(pt(64, BigInt(e))) : Y(Ma(e)));
}
function $a(e) {
  return Oe(e) ? Y(qr(e)) : Y(Ra(e));
}
function Mr(e) {
  var t = typeof e;
  return e == null ? e : t === "bigint" ? Y(pt(64, e)) : Ht(e) ? t === "string" ? Pa(e) : $a(e) : void 0;
}
function ni(e) {
  if (e == null) return e;
  var t = typeof e;
  if (t === "bigint") return String(pt(64, e));
  if (Ht(e)) {
    if (t === "string") return Or(e);
    if (t === "number") return qr(e);
  }
}
function Da(e) {
  if (e == null || typeof e == "string" || e instanceof Ne) return e;
}
function Ba(e) {
  if (typeof e != "string") throw Error();
  return e;
}
function Ve(e) {
  if (e != null && typeof e != "string") throw Error();
  return e;
}
function ee(e) {
  return e == null || typeof e == "string" ? e : void 0;
}
function ii(e, t, r, n) {
  return Rt(e) ? e : Array.isArray(e) ? ((n = (r = 0 | e[_]) | 32 & n | 2 & n) !== r && X(e, n), new t(e)) : (r ? 2 & n ? ((e = t[ts]) || (hr((e = new t()).B), e = t[ts] = e), t = e) : t = new t() : t = void 0, t);
}
function r1(e, t, r) {
  return (e = t ? Oa(e, 1024) : Mr(e)) == null ? r ? e1 : void 0 : e;
}
function n1(e) {
  return e;
}
var i1 = {}, s1 = (function() {
  try {
    return Wr(new class extends Map {
      constructor() {
        super();
      }
    }()), !1;
  } catch {
    return !0;
  }
})();
class gn {
  constructor() {
    this.h = /* @__PURE__ */ new Map();
  }
  get(t) {
    return this.h.get(t);
  }
  set(t, r) {
    return this.h.set(t, r), this.size = this.h.size, this;
  }
  delete(t) {
    return t = this.h.delete(t), this.size = this.h.size, t;
  }
  clear() {
    this.h.clear(), this.size = this.h.size;
  }
  has(t) {
    return this.h.has(t);
  }
  entries() {
    return this.h.entries();
  }
  keys() {
    return this.h.keys();
  }
  values() {
    return this.h.values();
  }
  forEach(t, r) {
    return this.h.forEach(t, r);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}
var a1 = s1 ? (Object.setPrototypeOf(gn.prototype, Map.prototype), Object.defineProperties(gn.prototype, { size: { value: 0, configurable: !0, enumerable: !0, writable: !0 } }), gn) : class extends Map {
  constructor() {
    super();
  }
};
function hs(e) {
  return e;
}
function _n(e) {
  if (2 & e.N) throw Error("Cannot mutate an immutable Map");
}
var o1, ze = class extends a1 {
  constructor(e, t, r = hs, n = hs) {
    super(), this.N = 0 | e[_], this.O = t, this.ca = r, this.oa = this.O ? h1 : n;
    for (let i = 0; i < e.length; i++) {
      let s = e[i], a = r(s[0], !1, !0), o = s[1];
      t ? o === void 0 && (o = null) : o = n(s[1], !1, !0, void 0, void 0, this.N), super.set(a, o);
    }
  }
  fa(e) {
    return nr(Array.from(super.entries(), e));
  }
  clear() {
    _n(this), super.clear();
  }
  delete(e) {
    return _n(this), super.delete(this.ca(e, !0, !1));
  }
  entries() {
    if (this.O) {
      var e = super.keys();
      e = new is(e, u1, this);
    } else e = super.entries();
    return e;
  }
  values() {
    if (this.O) {
      var e = super.keys();
      e = new is(e, ze.prototype.get, this);
    } else e = super.values();
    return e;
  }
  forEach(e, t) {
    this.O ? super.forEach((r, n, i) => {
      e.call(t, i.get(n), n, i);
    }) : super.forEach(e, t);
  }
  set(e, t) {
    return _n(this), (e = this.ca(e, !0, !1)) == null ? this : t == null ? (super.delete(e), this) : super.set(e, this.oa(t, !0, !0, this.O, !1, this.N));
  }
  hb(e) {
    var t = this.ca(e[0], !1, !0);
    e = e[1], e = this.O ? e === void 0 ? null : e : this.oa(e, !1, !0, void 0, !1, this.N), super.set(t, e);
  }
  has(e) {
    return super.has(this.ca(e, !1, !1));
  }
  get(e) {
    e = this.ca(e, !1, !1);
    var t = super.get(e);
    if (t !== void 0) {
      var r = this.O;
      return r ? ((r = this.oa(t, !1, !0, r, this.Ga, this.N)) !== t && super.set(e, r), r) : t;
    }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
function h1(e, t, r, n, i, s) {
  return e = ii(e, n, r, s), i && (e = ai(e)), e;
}
function u1(e) {
  return [e, this.get(e)];
}
function us() {
  return o1 || (o1 = new ze(hr([]), void 0, void 0, void 0, i1));
}
function Jr(e) {
  return de ? e[de] : void 0;
}
function Cr(e, t) {
  for (let r in e) !isNaN(r) && t(e, +r, e[r]);
}
ze.prototype.toJSON = void 0;
var c1, l1, On = class {
}, f1 = { eb: !0 };
function d1(e, t) {
  t < 100 || xt(H2, 1);
}
function Zr(e, t, r, n) {
  var i = n !== void 0;
  n = !!n;
  var s, a = de;
  !i && Gt && a && (s = e[a]) && Cr(s, d1), a = [];
  var o = e.length;
  s = 4294967295;
  var h = !1, f = !!(64 & t), u = f ? 128 & t ? 0 : -1 : void 0;
  if (!(1 & t)) {
    var l = o && e[o - 1];
    l != null && typeof l == "object" && l.constructor === Object ? s = --o : l = void 0, !f || 128 & t || i || (h = !0, s = n1(s - u, u, e, l, void 0) + u);
  }
  t = void 0;
  for (var p = 0; p < o; p++) {
    let A = e[p];
    if (A != null && (A = r(A, n)) != null) if (f && p >= s) {
      let E = p - u;
      (t ?? (t = {}))[E] = A;
    } else a[p] = A;
  }
  if (l) for (let A in l) {
    if ((o = l[A]) == null || (o = r(o, n)) == null) continue;
    let E;
    p = +A, f && !Number.isNaN(p) && (E = p + u) < s ? a[E] = o : (t ?? (t = {}))[A] = o;
  }
  return t && (h ? a.push(t) : a[s] = t), i && de && (e = Jr(e)) && e instanceof On && (a[de] = (function(A) {
    var E = new On();
    return Cr(A, (R, U, Be) => {
      E[U] = we(Be);
    }), E.la = A.la, E;
  })(e)), a;
}
function p1(e) {
  return e[0] = ir(e[0]), e[1] = ir(e[1]), e;
}
function ir(e) {
  switch (typeof e) {
    case "number":
      return Number.isFinite(e) ? e : "" + e;
    case "bigint":
      return Fn(e) ? Number(e) : "" + e;
    case "boolean":
      return e ? 1 : 0;
    case "object":
      if (Array.isArray(e)) {
        var t = 0 | e[_];
        return e.length === 0 && 1 & t ? void 0 : Zr(e, t, ir);
      }
      if (Rt(e)) return ja(e);
      if (e instanceof Ne) {
        if ((t = e.h) == null) e = "";
        else if (typeof t == "string") e = t;
        else {
          if (ga) {
            for (var r = "", n = 0, i = t.length - 10240; n < i; ) r += String.fromCharCode.apply(null, t.subarray(n, n += 10240));
            r += String.fromCharCode.apply(null, n ? t.subarray(n) : t), t = btoa(r);
          } else {
            r === void 0 && (r = 0), ma(), r = pa[r], n = Array(Math.floor(t.length / 3)), i = r[64] || "";
            let f = 0, u = 0;
            for (; f < t.length - 2; f += 3) {
              var s = t[f], a = t[f + 1], o = t[f + 2], h = r[s >> 2];
              s = r[(3 & s) << 4 | a >> 4], a = r[(15 & a) << 2 | o >> 6], o = r[63 & o], n[u++] = h + s + a + o;
            }
            switch (h = 0, o = i, t.length - f) {
              case 2:
                o = r[(15 & (h = t[f + 1])) << 2] || i;
              case 1:
                t = t[f], n[u] = r[t >> 2] + r[(3 & t) << 4 | h >> 4] + o + i;
            }
            t = n.join("");
          }
          e = e.h = t;
        }
        return e;
      }
      return e instanceof ze ? e = e.size !== 0 ? e.fa(p1) : void 0 : void 0;
  }
  return e;
}
function ja(e) {
  return Zr(e = e.B, 0 | e[_], ir);
}
function mt(e, t) {
  return Ua(e, t[0], t[1]);
}
function Ua(e, t, r, n = 0) {
  if (e == null) {
    var i = 32;
    r ? (e = [r], i |= 128) : e = [], t && (i = -16760833 & i | (1023 & t) << 14);
  } else {
    if (!Array.isArray(e)) throw Error("narr");
    if (i = 0 | e[_], Ji && 1 & i) throw Error("rfarr");
    if (2048 & i && !(2 & i) && (function() {
      if (Ji) throw Error("carr");
      xt(K2, 5);
    })(), 256 & i) throw Error("farr");
    if (64 & i) return (i | n) !== i && X(e, i | n), e;
    if (r && (i |= 128, r !== e[0])) throw Error("mid");
    e: {
      i |= 64;
      var s = (r = e).length;
      if (s) {
        var a = s - 1;
        let h = r[a];
        if (h != null && typeof h == "object" && h.constructor === Object) {
          if ((a -= t = 128 & i ? 0 : -1) >= 1024) throw Error("pvtlmt");
          for (var o in h) (s = +o) < a && (r[s + t] = h[o], delete h[o]);
          i = -16760833 & i | (1023 & a) << 14;
          break e;
        }
      }
      if (t) {
        if ((o = Math.max(t, s - (128 & i ? 0 : -1))) > 1024) throw Error("spvt");
        i = -16760833 & i | (1023 & o) << 14;
      }
    }
  }
  return X(e, 64 | i | n), e;
}
function m1(e, t) {
  if (typeof e != "object") return e;
  if (Array.isArray(e)) {
    var r = 0 | e[_];
    return e.length === 0 && 1 & r ? void 0 : cs(e, r, t);
  }
  if (Rt(e)) return ls(e);
  if (e instanceof ze) {
    if (2 & (t = e.N)) return e;
    if (!e.size) return;
    if (r = hr(e.fa()), e.O) for (e = 0; e < r.length; e++) {
      let n = r[e], i = n[1];
      i = i == null || typeof i != "object" ? void 0 : Rt(i) ? ls(i) : Array.isArray(i) ? cs(i, 0 | i[_], !!(32 & t)) : void 0, n[1] = i;
    }
    return r;
  }
  return e instanceof Ne ? e : void 0;
}
function cs(e, t, r) {
  return 2 & t || (!r || 4096 & t || 16 & t ? e = Kt(e, t, !1, r && !(16 & t)) : (or(e, 34), 4 & t && Object.freeze(e))), e;
}
function si(e, t, r) {
  return e = new e.constructor(t), r && (e.i = yt), e.o = yt, e;
}
function ls(e) {
  var t = e.B, r = 0 | t[_];
  return he(e, r) ? e : oi(e, t, r) ? si(e, t) : Kt(t, r);
}
function Kt(e, t, r, n) {
  return n ?? (n = !!(34 & t)), e = Zr(e, t, m1, n), n = 32, r && (n |= 2), X(e, t = 16769217 & t | n), e;
}
function ai(e) {
  var t = e.B, r = 0 | t[_];
  return he(e, r) ? oi(e, t, r) ? si(e, t, !0) : new e.constructor(Kt(t, r, !1)) : e;
}
function Wt(e) {
  if (e.i !== yt) return !1;
  var t = e.B;
  return or(t = Kt(t, 0 | t[_]), 2048), e.B = t, e.i = void 0, e.o = void 0, !0;
}
function bt(e) {
  if (!Wt(e) && he(e, 0 | e.B[_])) throw Error();
}
function it(e, t) {
  t === void 0 && (t = 0 | e[_]), 32 & t && !(4096 & t) && X(e, 4096 | t);
}
function oi(e, t, r) {
  return !!(2 & r) || !(!(32 & r) || 4096 & r) && (X(t, 2 | r), e.i = yt, !0);
}
var Ga = Y(0), Je = {};
function B(e, t, r, n) {
  if ((t = Me(e.B, t, void 0, n)) !== null || r && e.o !== yt) return t;
}
function Me(e, t, r, n) {
  if (t === -1) return null;
  var i = t + (r ? 0 : -1), s = e.length - 1;
  if (!(s < 1 + (r ? 0 : -1))) {
    if (i >= s) {
      var a = e[s];
      if (a != null && typeof a == "object" && a.constructor === Object) {
        r = a[t];
        var o = !0;
      } else {
        if (i !== s) return;
        r = a;
      }
    } else r = e[i];
    if (n && r != null) {
      if ((n = n(r)) == null) return n;
      if (!Object.is(n, r)) return o ? a[t] = n : e[i] = n, n;
    }
    return r;
  }
}
function k(e, t, r, n) {
  bt(e);
  var i = e.B;
  return K(i, 0 | i[_], t, r, n), e;
}
function K(e, t, r, n, i) {
  var s = r + (i ? 0 : -1), a = e.length - 1;
  if (a >= 1 + (i ? 0 : -1) && s >= a) {
    let o = e[a];
    if (o != null && typeof o == "object" && o.constructor === Object) return o[r] = n, t;
  }
  return s <= a ? (e[s] = n, t) : (n !== void 0 && (r >= (a = (t ?? (t = 0 | e[_])) >> 14 & 1023 || 536870912) ? n != null && (e[a + (i ? 0 : -1)] = { [r]: n }) : e[s] = n), t);
}
function Va(e, t) {
  return Rt(e = Me(e.B, t)) || Array.isArray(e);
}
function Ha(e, t, r) {
  return Va(e, t = Ya(e, r) === t ? t : -1);
}
function ft(e, t, r, n, i) {
  var s = e.B, a = 0 | s[_];
  n = he(e, a) ? 1 : n || 4, i = !!i || n === 3, n === 2 && Wt(e) && (a = 0 | (s = e.B)[_]);
  var o = (e = hi(s, t)) === st ? 7 : 0 | e[_], h = ui(o, a), f = !(4 & h);
  if (f) {
    4 & h && (e = we(e), o = 0, h = et(h, a), a = K(s, a, t, e));
    let u = 0, l = 0;
    for (; u < e.length; u++) {
      let p = r(e[u]);
      p != null && (e[l++] = p);
    }
    l < u && (e.length = l), r = -513 & h | 4, h = r &= -1025, h &= -4097;
  }
  return h !== o && (X(e, h), 2 & h && Object.freeze(e)), Ka(e, h, s, a, t, n, f, i);
}
function Ka(e, t, r, n, i, s, a, o) {
  var h = t;
  return s === 1 || s === 4 && (2 & t || !(16 & t) && 32 & n) ? Qe(t) || ((t |= !e.length || a && !(4096 & t) || 32 & n && !(4096 & t || 16 & t) ? 2 : 256) !== h && X(e, t), Object.freeze(e)) : (s === 2 && Qe(t) && (e = we(e), h = 0, t = et(t, n), n = K(r, n, i, e)), Qe(t) || (o || (t |= 16), t !== h && X(e, t))), 2 & t || !(4096 & t || 16 & t) || it(r, n), e;
}
function hi(e, t, r) {
  return e = Me(e, t, r), Array.isArray(e) ? e : st;
}
function ui(e, t) {
  return 2 & t && (e |= 2), 1 | e;
}
function Qe(e) {
  return !!(2 & e) && !!(4 & e) || !!(256 & e);
}
function Wa(e) {
  return zr(e, !0);
}
function za(e) {
  e = we(e);
  for (let t = 0; t < e.length; t++) {
    let r = e[t] = we(e[t]);
    Array.isArray(r[1]) && (r[1] = hr(r[1]));
  }
  return nr(e);
}
function lr(e, t, r, n) {
  bt(e), K(e = e.B, 0 | e[_], t, (n === "0" ? Number(r) === 0 : r === n) ? void 0 : r);
}
function at(e, t, r) {
  if (2 & t) throw Error();
  var n = Vt(t), i = hi(e, r, n), s = i === st ? 7 : 0 | i[_], a = ui(s, t);
  return (2 & a || Qe(a) || 16 & a) && (a === s || Qe(a) || X(i, a), i = we(i), s = 0, a = et(a, t), K(e, t, r, i, n)), (a &= -13) !== s && X(i, a), i;
}
function Ya(e, t) {
  return li(ci(e = e.B), e, void 0, t);
}
function ci(e) {
  if (Gt) return e[Jt] ?? (e[Jt] = /* @__PURE__ */ new Map());
  if (Jt in e) return e[Jt];
  var t = /* @__PURE__ */ new Map();
  return Object.defineProperty(e, Jt, { value: t }), t;
}
function Xa(e, t, r, n, i) {
  var s = ci(e), a = li(s, e, t, r, i);
  return a !== n && (a && (t = K(e, t, a, void 0, i)), s.set(r, n)), t;
}
function li(e, t, r, n, i) {
  var s = e.get(n);
  if (s != null) return s;
  s = 0;
  for (let a = 0; a < n.length; a++) {
    let o = n[a];
    Me(t, o, i) != null && (s !== 0 && (r = K(t, r, s, void 0, i)), s = o);
  }
  return e.set(n, s), s;
}
function fi(e, t, r) {
  var n = 0 | e[_], i = Vt(n), s = Me(e, r, i);
  if (Rt(s)) {
    if (!he(s)) return Wt(s), s.B;
    var a = s.B;
  } else Array.isArray(s) && (a = s);
  if (a) {
    let o = 0 | a[_];
    2 & o && (a = Kt(a, o));
  }
  return (a = mt(a, t)) !== s && K(e, n, r, a, i), a;
}
function M(e, t, r, n) {
  var i = e.B, s = 0 | i[_];
  if (t = (function(a, o, h, f, u) {
    var l = !1;
    if ((f = Me(a, f, u, (p) => {
      var A = ii(p, h, !1, o);
      return l = A !== p && A != null, A;
    })) != null) return l && !he(f) && it(a, o), f;
  })(i, s, t, r, n), t == null) return t;
  if (!he(e, s = 0 | i[_])) {
    let a = ai(t);
    a !== t && (Wt(e) && (s = 0 | (i = e.B)[_]), it(i, s = K(i, s, r, t = a, n)));
  }
  return t;
}
function qa(e, t, r, n, i, s, a, o) {
  var h = he(e, r);
  s = h ? 1 : s || 4, a = !!a || s === 3, h = o && !h, (s === 2 || h) && Wt(e) && (r = 0 | (t = e.B)[_]);
  var f = (e = hi(t, i)) === st ? 7 : 0 | e[_], u = ui(f, r);
  if (o = !(4 & u)) {
    var l = e, p = r;
    let A = !!(2 & u);
    A && (p |= 2);
    let E = !A, R = !0, U = 0, Be = 0;
    for (; U < l.length; U++) {
      let qt = ii(l[U], n, !1, p);
      if (qt instanceof n) {
        if (!A) {
          let Lt = he(qt);
          E && (E = !Lt), R && (R = Lt);
        }
        l[Be++] = qt;
      }
    }
    Be < U && (l.length = Be), u |= 4, u = R ? -4097 & u : 4096 | u, u = E ? 8 | u : -9 & u;
  }
  if (u !== f && (X(e, u), 2 & u && Object.freeze(e)), h && !(8 & u || !e.length && (s === 1 || s === 4 && (2 & u || !(16 & u) && 32 & r)))) {
    for (Qe(u) && (e = we(e), u = et(u, r), r = K(t, r, i, e)), n = e, h = u, f = 0; f < n.length; f++) (l = n[f]) !== (u = ai(l)) && (n[f] = u);
    h |= 8, X(e, u = h = n.length ? 4096 | h : -4097 & h);
  }
  return Ka(e, u, t, r, i, s, o, a);
}
function kt(e, t, r) {
  var n = e.B;
  return qa(e, n, 0 | n[_], t, r, void 0, !1, !0);
}
function Ja(e) {
  return e == null && (e = void 0), e;
}
function y(e, t, r, n, i) {
  return k(e, r, n = Ja(n), i), n && !he(n) && it(e.B), e;
}
function ke(e, t, r, n) {
  e: {
    var i = n = Ja(n);
    bt(e);
    let s = e.B, a = 0 | s[_];
    if (i == null) {
      let o = ci(s);
      if (li(o, s, a, r) !== t) break e;
      o.set(r, 0);
    } else a = Xa(s, a, r, t);
    K(s, a, t, i);
  }
  return n && !he(n) && it(e.B), e;
}
function Mn(e, t, r) {
  bt(e);
  var n = e.B, i = 0 | n[_];
  if (r == null) return K(n, i, t), e;
  var s = r === st ? 7 : 0 | r[_], a = s, o = Qe(s), h = o || Object.isFrozen(r), f = !0, u = !0;
  for (let p = 0; p < r.length; p++) {
    var l = r[p];
    o || (l = he(l), f && (f = !l), u && (u = l));
  }
  return o || (s = f ? 13 : 5, s = u ? -4097 & s : 4096 | s), h && s === a || (r = we(r), a = 0, s = et(s, i)), s !== a && X(r, s), i = K(n, i, t, r), 2 & s || !(4096 & s || 16 & s) || it(n, i), e;
}
function et(e, t) {
  return -273 & (2 & t ? 2 | e : -3 & e);
}
function sr(e, t, r, n) {
  var i = n;
  bt(e), e = qa(e, n = e.B, 0 | n[_], r, t, 2, !0), i = i ?? new r(), e.push(i), t = r = e === st ? 7 : 0 | e[_], (i = he(i)) ? (r &= -9, e.length === 1 && (r &= -4097)) : r |= 4096, r !== t && X(e, r), i || it(n);
}
function Ae(e, t, r) {
  return Et(B(e, t, r));
}
function te(e, t) {
  return B(e, t, void 0, fe) ?? 0;
}
function Cn(e, t, r, n) {
  return M(e, t, r = Ya(e, n) === r ? r : -1, void 0);
}
function xn(e, t) {
  lr(e, 3, t == null ? t : Nr(t), !1);
}
function Ce(e, t, r) {
  if (r != null) {
    if (typeof r != "number" || !cr(r)) throw rr("int32");
    r |= 0;
  }
  k(e, t, r);
}
function vn(e, t, r) {
  return k(e, t, r == null ? r : Oa(r));
}
function kr(e, t, r) {
  return k(e, t, r == null ? r : (function(n) {
    if (!Ht(n)) throw rr("uint64");
    switch (typeof n) {
      case "string":
        var i = nt(Number(n));
        return Oe(i) && i >= 0 ? n = Y(i) : ((i = n.indexOf(".")) !== -1 && (n = n.substring(0, i)), n = At() ? Y(Nn(64, BigInt(n))) : Y(Ca(n))), n;
      case "bigint":
        return Y(Nn(64, n));
      default:
        return Oe(n) ? n = Y(xa(n)) : ((n = nt(n)) >= 0 && Oe(n) ? n = String(n) : (wt(n), n = Pt(I, x)), n = Y(n)), n;
    }
  })(r));
}
function w(e, t, r) {
  k(e, t, r == null ? r : Ia(r));
}
function It(e, t, r) {
  lr(e, t, r == null ? r : Ia(r), 0);
}
function pe(e, t, r) {
  lr(e, t, Ve(r), "");
}
function xr(e, t, r) {
  {
    bt(e);
    let a = e.B, o = 0 | a[_];
    if (r == null) K(a, o, t);
    else {
      var n = e = r === st ? 7 : 0 | r[_], i = Qe(e), s = i || Object.isFrozen(r);
      for (i || (e = 0), s || (r = we(r), n = 0, e = et(e, o), s = !1), e |= 5, e |= (4 & e ? 512 & e ? 512 : 1024 & e ? 1024 : 0 : void 0) ?? 1024, i = 0; i < r.length; i++) {
        let h = r[i], f = Ba(h);
        Object.is(h, f) || (s && (r = we(r), n = 0, e = et(e, o), s = !1), r[i] = f);
      }
      e !== n && (s && (r = we(r), e = et(e, o)), X(r, e)), K(a, o, t, r);
    }
  }
}
function Qr(e, t, r) {
  bt(e), ft(e, t, ee, 2, !0).push(Ba(r));
}
var Tt = class {
  constructor(e, t, r) {
    if (this.buffer = e, r && !t) throw Error();
    this.h = t;
  }
};
function en(e, t) {
  if (typeof e == "string") return new Tt(_a(e), t);
  if (Array.isArray(e)) return new Tt(new Uint8Array(e), t);
  if (e.constructor === Uint8Array) return new Tt(e, !1);
  if (e.constructor === ArrayBuffer) return e = new Uint8Array(e), new Tt(e, !1);
  if (e.constructor === Ne) return t = Qn(e) || new Uint8Array(0), new Tt(t, !0, e);
  if (e instanceof Uint8Array) return e = e.constructor === Uint8Array ? e : new Uint8Array(e.buffer, e.byteOffset, e.byteLength), new Tt(e, !1);
  throw Error();
}
function di(e, t) {
  var r = 0, n = 0, i = 0, s = e.i, a = e.h;
  do {
    var o = s[a++];
    r |= (127 & o) << i, i += 7;
  } while (i < 32 && 128 & o);
  if (i > 32) for (n |= (127 & o) >> 4, i = 3; i < 32 && 128 & o; i += 7) n |= (127 & (o = s[a++])) << i;
  if (gt(e, a), !(128 & o)) return t(r >>> 0, n >>> 0);
  throw Error();
}
function pi(e) {
  for (var t = 0, r = e.h, n = r + 10, i = e.i; r < n; ) {
    let s = i[r++];
    if (t |= s, !(128 & s)) return gt(e, r), !!(127 & t);
  }
  throw Error();
}
function Ye(e) {
  var t = e.i, r = e.h, n = t[r++], i = 127 & n;
  if (128 & n && (i |= (127 & (n = t[r++])) << 7, 128 & n && (i |= (127 & (n = t[r++])) << 14, 128 & n && (i |= (127 & (n = t[r++])) << 21, 128 & n && (i |= (n = t[r++]) << 28, 128 & n && 128 & t[r++] && 128 & t[r++] && 128 & t[r++] && 128 & t[r++] && 128 & t[r++]))))) throw Error();
  return gt(e, r), i;
}
function xe(e) {
  return Ye(e) >>> 0;
}
function Rr(e) {
  return di(e, Fa);
}
function Rn(e) {
  var t = e.i, r = e.h, n = t[r], i = t[r + 1], s = t[r + 2];
  return t = t[r + 3], gt(e, e.h + 4), (n | i << 8 | s << 16 | t << 24) >>> 0;
}
function Pr(e) {
  var t = Rn(e);
  e = 2 * (t >> 31) + 1;
  var r = t >>> 23 & 255;
  return t &= 8388607, r == 255 ? t ? NaN : e * (1 / 0) : r == 0 ? 1401298464324817e-60 * e * t : e * Math.pow(2, r - 150) * (t + 8388608);
}
function g1(e) {
  return Ye(e);
}
function gt(e, t) {
  if (e.h = t, t > e.l) throw Error();
}
function Za(e, t) {
  if (t < 0) throw Error();
  var r = e.h;
  if ((t = r + t) > e.l) throw Error();
  return e.h = t, r;
}
function Qa(e, t) {
  if (t == 0) return vt();
  var r = Za(e, t);
  return e.ga && e.u ? r = e.i.subarray(r, r + t) : (e = e.i, r = r === (t = r + t) ? new Uint8Array(0) : Z2 ? e.slice(r, t) : new Uint8Array(e.subarray(r, t))), r.length == 0 ? vt() : new Ne(r, Ct);
}
var _1 = class {
  constructor(e, t, r, n) {
    this.i = null, this.u = !1, this.h = this.l = this.o = 0, this.init(e, t, r, n);
  }
  init(e, t, r, { ga: n = !1, na: i = !1 } = {}) {
    this.ga = n, this.na = i, e && (e = en(e, this.na), this.i = e.buffer, this.u = e.h, this.o = t || 0, this.l = r !== void 0 ? this.o + r : this.i.length, this.h = this.o);
  }
  clear() {
    this.i = null, this.u = !1, this.h = this.l = this.o = 0, this.ga = !1;
  }
}, fs = [], $t = 0;
function eo(e, t, r, n) {
  if ($r.length) {
    let i = $r.pop();
    return i.A(n), i.h.init(e, t, r, n), i;
  }
  return new v1(e, t, r, n);
}
function to(e) {
  e.h.clear(), e.l = -1, e.i = -1, $r.length < 100 && $r.push(e);
}
function ro(e) {
  var t = e.h;
  if (t.h == t.l) return !1;
  e.o = e.h.h;
  var r = xe(e.h);
  if (t = r >>> 3, !((r &= 7) >= 0 && r <= 5) || t < 1) throw Error();
  return e.l = t, e.i = r, !0;
}
function Sr(e) {
  try {
    switch (e.i) {
      case 0:
        e.i != 0 ? Sr(e) : pi(e.h);
        break;
      case 1:
        var t = e.h;
        gt(t, t.h + 8);
        break;
      case 2:
        if (e.i != 2) Sr(e);
        else {
          var r = xe(e.h), n = e.h;
          gt(n, n.h + r);
        }
        break;
      case 5:
        var i = e.h;
        gt(i, i.h + 4);
        break;
      case 3:
        no();
        let s = e.l;
        try {
          for (; ; ) {
            if (!ro(e)) throw Error();
            if (e.i == 4) {
              if (e.l != s) throw Error();
              break;
            }
            Sr(e);
          }
        } catch (a) {
          throw a instanceof RangeError ? new SyntaxError() : a;
        } finally {
          $t > 0 && $t--;
        }
        break;
      default:
        throw Error();
    }
  } catch (s) {
    throw s instanceof RangeError ? new SyntaxError() : s;
  }
}
function no() {
  if ($t >= 100) throw new SyntaxError();
  $t++;
}
function fr(e, t, r) {
  var n = e.h.l, i = xe(e.h), s = (i = e.h.h + i) - n;
  if (s <= 0 && (e.h.l = i, r(t, e, void 0, void 0, void 0), s = i - e.h.h), s) throw Error();
  return e.h.h = i, e.h.l = n, t;
}
function mi(e) {
  var t = xe(e.h), r = Za(e = e.h, t);
  if (e = e.i, C2) {
    var n, i = e;
    (n = mn) || (n = mn = new TextDecoder("utf-8", { fatal: !0 })), t = r + t, i = r === 0 && t === i.length ? i : i.subarray(r, t);
    try {
      var s = n.decode(i);
    } catch (o) {
      if (yr === void 0) {
        try {
          n.decode(new Uint8Array([128]));
        } catch {
        }
        try {
          n.decode(new Uint8Array([97])), yr = !0;
        } catch {
          yr = !1;
        }
      }
      throw !yr && (mn = void 0), o;
    }
  } else {
    t = (s = r) + t, r = [];
    let o, h = null;
    for (; s < t; ) {
      var a = e[s++];
      a < 128 ? r.push(a) : a < 224 ? s >= t ? ht() : (o = e[s++], a < 194 || (192 & o) != 128 ? (s--, ht()) : r.push((31 & a) << 6 | 63 & o)) : a < 240 ? s >= t - 1 ? ht() : (o = e[s++], (192 & o) != 128 || a === 224 && o < 160 || a === 237 && o >= 160 || (192 & (n = e[s++])) != 128 ? (s--, ht()) : r.push((15 & a) << 12 | (63 & o) << 6 | 63 & n)) : a <= 244 ? s >= t - 2 ? ht() : (o = e[s++], (192 & o) != 128 || o - 144 + (a << 28) >> 30 || (192 & (n = e[s++])) != 128 || (192 & (i = e[s++])) != 128 ? (s--, ht()) : (a = (7 & a) << 18 | (63 & o) << 12 | (63 & n) << 6 | 63 & i, a -= 65536, r.push(55296 + (a >> 10 & 1023), 56320 + (1023 & a)))) : ht(), r.length >= 8192 && (h = qi(h, r), r.length = 0);
    }
    s = qi(h, r);
  }
  return s;
}
function gi(e) {
  var t = xe(e.h);
  return Qa(e.h, t);
}
function dr(e, t, r) {
  var n = xe(e.h);
  for (n = e.h.h + n; e.h.h < n; ) r.push(t(e.h));
}
var v1 = class {
  constructor(e, t, r, n) {
    if (fs.length) {
      let i = fs.pop();
      i.init(e, t, r, n), e = i;
    } else e = new _1(e, t, r, n);
    this.h = e, this.o = this.h.h, this.i = this.l = -1, this.A(n);
  }
  A({ sa: e = !1 } = {}) {
    this.sa = e;
  }
}, $r = [];
function y1(e) {
  return new Dr(4294967295 & e, Math.floor(e / 4294967296));
}
function ds(e) {
  return e ? /^\d+$/.test(e) ? (ur(e), new Dr(I, x)) : null : A1 || (A1 = new Dr(0, 0));
}
var A1, Dr = class {
  constructor(e, t) {
    this.i = e >>> 0, this.h = t >>> 0;
  }
};
function w1(e) {
  return new Br(4294967295 & e, Math.floor(e / 4294967296));
}
function io(e) {
  return e ? /^-?\d+$/.test(e) ? (ur(e), new Br(I, x)) : null : E1 || (E1 = new Br(0, 0));
}
var E1, ps, ms, gs, yn, _s, Zt, Ar, Br = class {
  constructor(e, t) {
    this.i = e >>> 0, this.h = t >>> 0;
  }
};
function so(e, t, r) {
  return typeof BigInt64Array < "u" ? (Zt || (Zt = new BigInt64Array(1), Ar = new Uint32Array(Zt.buffer), Zt[0] = BigInt(1), _s = Ar[0] === 1), Zt[0] = e, new t(Ar[e = _s ? 0 : 1], Ar[1 - e])) : (yn || (ps = BigInt(Number.MIN_SAFE_INTEGER), ms = BigInt(Number.MAX_SAFE_INTEGER), gs = BigInt(4294967295), yn = BigInt(32)), e >= ps && e <= ms ? r(Number(e)) : (e = BigInt.asUintN(64, e), new t(Number(e & gs), Number(e >> yn))));
}
function We(e, t, r) {
  for (; r > 0 || t > 127; ) e.h.push(127 & t | 128), t = (t >>> 7 | r << 25) >>> 0, r >>>= 7;
  e.h.push(t);
}
function zt(e, t) {
  for (; t > 127; ) e.h.push(127 & t | 128), t >>>= 7;
  e.h.push(t);
}
function pr(e, t) {
  if (t >= 0) zt(e, t);
  else {
    for (let r = 0; r < 9; r++) e.h.push(127 & t | 128), t >>= 7;
    e.h.push(1);
  }
}
function b1(e, t) {
  ur(t), (function(r) {
    var n = x >> 31;
    r(I << 1 ^ n, (x << 1 | I >>> 31) ^ n);
  })((r, n) => {
    We(e, r >>> 0, n >>> 0);
  });
}
function ar(e, t) {
  e.h.push(t >>> 0 & 255), e.h.push(t >>> 8 & 255), e.h.push(t >>> 16 & 255), e.h.push(t >>> 24 & 255);
}
var k1 = class {
  constructor() {
    this.h = [];
  }
  length() {
    return this.h.length;
  }
  end() {
    var e = this.h;
    return this.h = [], e;
  }
};
function Dt(e, t) {
  t.length !== 0 && (e.l.push(t), e.i += t.length);
}
function re(e, t, r) {
  zt(e.h, 8 * t + r);
}
function _i(e, t) {
  return re(e, t, 2), t = e.h.end(), Dt(e, t), t.push(e.i), t;
}
function vi(e, t) {
  var r = t.pop();
  for (r = e.i + e.h.length() - r; r > 127; ) t.push(127 & r | 128), r >>>= 7, e.i++;
  t.push(r), e.i++;
}
function ao(e, t, r) {
  if (r != null) switch (re(e, t, 0), typeof r) {
    case "number":
      e = e.h, wt(r), We(e, I, x);
      break;
    case "bigint":
      r = so(r, Br, w1), We(e.h, r.i, r.h);
      break;
    default:
      r = io(r), We(e.h, r.i, r.h);
  }
}
function mr(e, t, r) {
  re(e, t, 2), zt(e.h, r.length), Dt(e, e.h.end()), Dt(e, r);
}
function jr(e, t, r, n) {
  r != null && (t = _i(e, t), n(r, e), vi(e, t));
}
var S1 = class {
  constructor() {
    this.l = [], this.i = 0, this.h = new k1();
  }
};
function oo(e) {
  typeof e == "string" && io(e);
}
function Ee() {
  var e = class {
    constructor() {
      throw Error();
    }
  };
  return Object.setPrototypeOf(e, e.prototype), e;
}
var yi = Ee(), ho = Ee(), Ai = Ee(), tn = Ee(), wi = Ee(), rn = Ee(), L1 = Ee(), T1 = Ee(), nn = Ee(), F1 = Ee(), sn = Ee(), Ei = Ee();
function Pe(e, t, r) {
  var n = e.B;
  de && de in n && (n = n[de]) && delete n[t.h], t.i ? t.u(e, t.i, t.h, r, t.l) : t.u(e, t.h, r, t.l);
}
var d = class {
  constructor(e, t) {
    this.B = Ua(e, t, void 0, 2048);
  }
  toJSON() {
    return ja(this);
  }
  u() {
    var i;
    var e = yh, t = this.B, r = e.h, n = de;
    if (Gt && n && ((i = t[n]) == null ? void 0 : i[r]) != null && xt(V2, 3), t = e.h, rs && de && rs === void 0 && (n = (r = this.B)[de]) && (n = n.la)) try {
      n(r, t, f1);
    } catch (s) {
      da(s);
    }
    return e.i ? e.o(this, e.i, e.h, e.l) : e.o(this, e.h, e.defaultValue, e.l);
  }
  clone() {
    var e = this.B, t = 0 | e[_];
    return oi(this, e, t) ? si(this, e, !0) : new this.constructor(Kt(e, t, !1));
  }
};
d.prototype[Aa] = ba, d.prototype.toString = function() {
  return this.B.toString();
};
var Yt = class {
  constructor(e, t, r) {
    this.h = e, this.i = t, e = yi, this.l = !!e && r === e || !1;
  }
};
function an(e, t) {
  return new Yt(e, t, yi);
}
function uo(e, t, r, n, i) {
  jr(e, r, po(t, n), i);
}
var co, lo, I1 = an(function(e, t, r, n, i) {
  return e.i === 2 && (fr(e, fi(t, n, r), i), !0);
}, uo), N1 = an(function(e, t, r, n, i) {
  return e.i === 2 && (fr(e, fi(t, n, r), i), !0);
}, uo), on = Symbol(), hn = Symbol(), Pn = Symbol(), vs = Symbol(), ys = Symbol();
function St(e, t, r, n) {
  var i = n[e];
  if (i) return i;
  (i = {}).Fa = n, i.da = (function(l) {
    switch (typeof l) {
      case "boolean":
        return c1 || (c1 = [0, void 0, !0]);
      case "number":
        return l > 0 ? void 0 : l === 0 ? l1 || (l1 = [0, void 0]) : [-l, void 0];
      case "string":
        return [0, l];
      case "object":
        return l;
    }
  })(n[0]);
  var s = n[1], a = 1;
  s && s.constructor === Object && (i.ja = s, typeof (s = n[++a]) == "function" && (i.xa = !0, co ?? (co = s), lo ?? (lo = n[a + 1]), s = n[a += 2]));
  for (var o = {}; s && Array.isArray(s) && s.length && typeof s[0] == "number" && s[0] > 0; ) {
    for (var h = 0; h < s.length; h++) o[s[h]] = s;
    s = n[++a];
  }
  for (h = 1; s !== void 0; ) {
    let l;
    typeof s == "number" && (h += s, s = n[++a]);
    var f = void 0;
    if (s instanceof Yt ? l = s : (l = I1, a--), l == null ? void 0 : l.l) {
      s = n[++a], f = n;
      var u = a;
      typeof s == "function" && (s = s(), f[u] = s), f = s;
    }
    for (u = h + 1, typeof (s = n[++a]) == "number" && s < 0 && (u -= s, s = n[++a]); h < u; h++) {
      let p = o[h];
      f ? r(i, h, l, f, p) : t(i, h, l, p);
    }
  }
  return n[e] = i;
}
function fo(e) {
  return Array.isArray(e) ? e[0] instanceof Yt ? e : [N1, e] : [e, void 0];
}
function po(e, t) {
  return e instanceof d ? e.B : Array.isArray(e) ? mt(e, t) : void 0;
}
function bi(e, t, r, n) {
  var i = r.h;
  e[t] = n ? (s, a, o) => i(s, a, o, n) : i;
}
function ki(e, t, r, n, i) {
  var s, a, o = r.h;
  e[t] = (h, f, u) => o(h, f, u, a || (a = St(hn, bi, ki, n).da), s || (s = Si(n)), i);
}
function Si(e) {
  var t = e[Pn];
  if (t != null) return t;
  var r = St(hn, bi, ki, e);
  return t = r.xa ? (n, i) => co(n, i, r) : (n, i) => {
    e: {
      no();
      try {
        for (; ro(i) && i.i != 4; ) {
          let p = i.l, A = r[p];
          if (A == null) {
            let E = r.ja;
            if (E) {
              let R = E[p];
              if (R) {
                let U = M1(R);
                U != null && (A = r[p] = U);
              }
            }
          }
          if (A == null || !A(i, n, p)) {
            var s = i;
            let E = s.o;
            if (Sr(s), s.sa) var a = void 0;
            else {
              let R = s.h.h - E;
              s.h.h = E, a = Qa(s.h, R);
            }
            s = void 0;
            var o = n, h = p, f = a;
            f && ((s = o[de] ?? (o[de] = new On()))[h] ?? (s[h] = [])).push(f);
          }
        }
        let l = Jr(n);
        l && (l.la = r.Fa[ys]);
        var u = !0;
        break e;
      } catch (l) {
        throw l instanceof RangeError ? new SyntaxError() : l;
      } finally {
        $t > 0 && $t--;
      }
      u = void 0;
    }
    return u;
  }, e[Pn] = t, e[ys] = O1.bind(e), t;
}
function O1(e, t, r, n) {
  var i = this[hn], s = this[Pn], a = mt(void 0, i.da), o = Jr(e);
  if (o) {
    var h = !1, f = i.ja;
    if (f) {
      if (i = (u, l, p) => {
        if (p.length !== 0) if (f[l]) for (let A of p) {
          u = eo(A);
          try {
            h = !0, s(a, u);
          } finally {
            to(u);
          }
        }
        else n == null || n(e, l, p);
      }, t == null) Cr(o, i);
      else if (o != null) {
        let u = o[t];
        u && i(o, t, u);
      }
      if (h) {
        let u = 0 | e[_];
        if (2 & u && 2048 & u && !(r != null && r.eb)) throw Error();
        let l = Vt(u), p = (A, E) => {
          if (Me(e, A, l) != null) {
            if ((r == null ? void 0 : r.mb) === 1) return;
            throw Error();
          }
          E != null && (u = K(e, u, A, E, l)), delete o[A];
        };
        t == null ? ka(a, 0 | a[_], (A, E) => {
          p(A, E);
        }) : p(t, Me(a, t, l));
      }
    }
  }
}
function M1(e) {
  var t = (e = fo(e))[0].h;
  if (e = e[1]) {
    let r = Si(e), n = St(hn, bi, ki, e).da;
    return (i, s, a) => t(i, s, a, n, r);
  }
  return t;
}
function un(e, t, r) {
  e[t] = r.i;
}
function cn(e, t, r, n) {
  var i, s, a = r.i;
  e[t] = (o, h, f) => a(o, h, f, s || (s = St(on, un, cn, n).da), i || (i = mo(n)));
}
function mo(e) {
  var t = e[vs];
  if (!t) {
    let r = St(on, un, cn, e);
    t = (n, i) => go(n, i, r), e[vs] = t;
  }
  return t;
}
function go(e, t, r) {
  ka(e, 0 | e[_], (n, i) => {
    if (i != null) {
      var s = (function(a, o) {
        var h = a[o];
        if (h) return h;
        if ((h = a.ja) && (h = h[o])) {
          var f = (h = fo(h))[0].i;
          if (h = h[1]) {
            let u = mo(h), l = St(on, un, cn, h).da;
            h = a.xa ? lo(l, u) : (p, A, E) => f(p, A, E, l, u);
          } else h = f;
          return a[o] = h;
        }
      })(r, n);
      s ? s(t, i, n) : n < 500 || xt(Tn, 3);
    }
  }), (e = Jr(e)) && Cr(e, (n, i, s) => {
    for (Dt(t, t.h.end()), n = 0; n < s.length; n++) Dt(t, Qn(s[n]) || new Uint8Array(0));
  });
}
var C1 = Y(0);
function Xe(e, t, r) {
  if (Array.isArray(t)) {
    var n = 0 | t[_];
    if (4 & n) return t;
    for (var i = 0, s = 0; i < t.length; i++) {
      let a = e(t[i]);
      a != null && (t[s++] = a);
    }
    return s < i && (t.length = s), e = 1 | n, r && (e = -1537 & e | 4), e !== n && X(t, e), r && 2 & e && Object.freeze(t), t;
  }
}
var _o = (e, t) => {
  var r = new S1();
  go(e.B, r, St(on, un, cn, t)), Dt(r, r.h.end()), e = new Uint8Array(r.i);
  var n = (t = r.l).length, i = 0;
  for (let s = 0; s < n; s++) {
    let a = t[s];
    e.set(a, i), i += a.length;
  }
  return r.l = [e], e;
};
function z(e, t, r) {
  return new Yt(e, t, r);
}
function qe(e, t, r) {
  return new Yt(e, t, r);
}
function Z(e, t, r) {
  K(e, 0 | e[_], t, r, Vt(0 | e[_]));
}
var x1 = an(function(e, t, r, n, i) {
  if (e.i !== 2) return !1;
  if (e = we(e = fr(e, mt([void 0, void 0], n), i)), i = Vt(n = 0 | t[_]), 2 & n) throw Error();
  var s = Me(t, r, i);
  if (s instanceof ze) 2 & s.N ? ((s = s.fa()).push(e), K(t, n, r, s, i)) : s.hb(e);
  else if (Array.isArray(s)) {
    var a = 0 | s[_];
    8192 & a || X(s, a |= 8192), 2 & a && K(t, n, r, s = za(s), i), s.push(e);
  } else K(t, n, r, nr([e]), i);
  return !0;
}, function(e, t, r, n, i) {
  if (t instanceof ze) t.forEach((s, a) => {
    jr(e, r, mt([a, s], n), i);
  });
  else if (Array.isArray(t)) {
    for (let s = 0; s < t.length; s++) {
      let a = t[s];
      Array.isArray(a) && jr(e, r, mt(a, n), i);
    }
    nr(t);
  }
});
function vo(e, t, r) {
  (t = fe(t)) != null && (re(e, r, 5), e = e.h, ei(t), ar(e, I));
}
function Li(e, t, r) {
  (t = ni(t)) != null && (oo(t), ao(e, r, t));
}
function yo(e, t, r) {
  (t = Et(t)) != null && t != null && (re(e, r, 0), pr(e.h, t));
}
function Ao(e, t, r) {
  (t = t == null || typeof t == "boolean" ? t : typeof t == "number" ? !!t : void 0) != null && (re(e, r, 0), e.h.h.push(t ? 1 : 0));
}
function wo(e, t, r) {
  (t = ee(t)) != null && mr(e, r, fa(t));
}
function Eo(e, t, r, n, i) {
  jr(e, r, po(t, n), i);
}
function Ti(e, t, r) {
  (t = Da(t)) != null && mr(e, r, en(t, !0).buffer);
}
function bo(e, t, r) {
  (t = Na(t)) != null && t != null && (re(e, r, 0), zt(e.h, t));
}
function ko(e, t, r) {
  (t = Et(t)) != null && (t = parseInt(t, 10), re(e, r, 0), pr(e.h, t));
}
function So(e, t, r) {
  return (e.i === 5 || e.i === 2) && (t = at(t, 0 | t[_], r), e.i == 2 ? dr(e, Pr, t) : t.push(Pr(e.h)), !0);
}
function Lo(e, t, r) {
  return e.i === 0 && (Z(t, r, Rr(e.h)), !0);
}
function To(e, t, r) {
  return (e.i === 0 || e.i === 2) && (t = at(t, 0 | t[_], r), e.i == 2 ? dr(e, Ye, t) : t.push(Ye(e.h)), !0);
}
function Fo(e, t, r) {
  return e.i === 2 && (Z(t, r, (e = gi(e)) === vt() ? void 0 : e), !0);
}
var As = z(function(e, t, r) {
  if (e.i !== 1) return !1;
  var n = e.h;
  e = Rn(n);
  var i = Rn(n);
  n = 2 * (i >> 31) + 1;
  var s = i >>> 20 & 2047;
  return e = 4294967296 * (1048575 & i) + e, Z(t, r, s == 2047 ? e ? NaN : n * (1 / 0) : s == 0 ? 5e-324 * n * e : n * Math.pow(2, s - 1075) * (e + 4503599627370496)), !0;
}, function(e, t, r) {
  (t = fe(t)) != null && (re(e, r, 1), e = e.h, (r = La || (La = new DataView(new ArrayBuffer(8)))).setFloat64(0, +t, !0), I = r.getUint32(0, !0), x = r.getUint32(4, !0), ar(e, I), ar(e, x));
}, F1), H = z(function(e, t, r) {
  return e.i === 5 && (Z(t, r, Pr(e.h)), !0);
}, vo, nn), R1 = qe(So, function(e, t, r) {
  if ((t = Xe(fe, t, !0)) != null) for (let a = 0; a < t.length; a++) {
    var n = e, i = r, s = t[a];
    s != null && (re(n, i, 5), n = n.h, ei(s), ar(n, I));
  }
}, nn), Fi = qe(So, function(e, t, r) {
  if ((t = Xe(fe, t, !0)) != null && t.length) {
    re(e, r, 2), zt(e.h, 4 * t.length);
    for (let n = 0; n < t.length; n++) r = e.h, ei(t[n]), ar(r, I);
  }
}, nn), Io = z(function(e, t, r) {
  return e.i === 5 && (Z(t, r, (e = Pr(e.h)) === 0 ? void 0 : e), !0);
}, vo, nn), Qt = z(function(e, t, r) {
  return Lo(e, t, r);
}, Li, rn), $ = z(function(e, t, r) {
  return Lo(e, t, r);
}, Li, rn), P1 = qe(function(e, t, r) {
  return e.i !== 0 && e.i !== 2 ? e = !1 : (t = at(t, 0 | t[_], r), e.i == 2 ? dr(e, Rr, t) : t.push(Rr(e.h)), e = !0), e;
}, function(e, t, r) {
  if ((t = Xe(ni, t, !1)) != null) for (let n = 0; n < t.length; n++) ao(e, r, t[n]);
}, rn), Lr = z(function(e, t, r) {
  return e.i !== 0 ? t = !1 : (Z(t, r, (e = Rr(e.h)) === C1 ? void 0 : e), t = !0), t;
}, Li, rn), Ur = z(function(e, t, r) {
  return e.i !== 0 ? e = !1 : (Z(t, r, di(e.h, Q2)), e = !0), e;
}, function(e, t, r) {
  if (t = (function(n) {
    if (n == null) return n;
    var i = typeof n;
    if (i === "bigint") return String(Nn(64, n));
    if (Ht(n)) {
      if (i === "string") return i = nt(Number(n)), Oe(i) && i >= 0 ? n = String(i) : ((i = n.indexOf(".")) !== -1 && (n = n.substring(0, i)), n = Ca(n)), n;
      if (i === "number") return xa(n);
    }
  })(t), t != null && (typeof t == "string" && ds(t), t != null))
    switch (re(e, r, 0), typeof t) {
      case "number":
        e = e.h, wt(t), We(e, I, x);
        break;
      case "bigint":
        r = so(t, Dr, y1), We(e.h, r.i, r.h);
        break;
      default:
        r = ds(t), We(e.h, r.i, r.h);
    }
}, L1), T = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, Ye(e.h)), !0);
}, yo, tn), ws = qe(To, function(e, t, r) {
  if ((t = Xe(Et, t, !0)) != null) for (let a = 0; a < t.length; a++) {
    var n = e, i = r, s = t[a];
    s != null && (re(n, i, 0), pr(n.h, s));
  }
}, tn), Xt = qe(To, function(e, t, r) {
  if ((t = Xe(Et, t, !0)) != null && t.length) {
    r = _i(e, r);
    for (let n = 0; n < t.length; n++) pr(e.h, t[n]);
    vi(e, r);
  }
}, tn), dt = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, (e = Ye(e.h)) === 0 ? void 0 : e), !0);
}, yo, tn), b = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, pi(e.h)), !0);
}, Ao, ho), tt = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, (e = pi(e.h)) === !1 ? void 0 : e), !0);
}, Ao, ho), Q = qe(function(e, t, r) {
  return e.i === 2 && (e = mi(e), at(t, 0 | t[_], r).push(e), !0);
}, function(e, t, r) {
  if ((t = Xe(ee, t, !0)) != null) for (let a = 0; a < t.length; a++) {
    var n = e, i = r, s = t[a];
    s != null && mr(n, i, fa(s));
  }
}, Ai), Ue = z(function(e, t, r) {
  return e.i === 2 && (Z(t, r, (e = mi(e)) === "" ? void 0 : e), !0);
}, wo, Ai), c = z(function(e, t, r) {
  return e.i === 2 && (Z(t, r, mi(e)), !0);
}, wo, Ai), P = (function(e, t, r = yi) {
  return new Yt(e, t, r);
})(function(e, t, r, n, i) {
  return e.i === 2 && (n = mt(void 0, n), at(t, 0 | t[_], r).push(n), fr(e, n, i), !0);
}, function(e, t, r, n, i) {
  if (Array.isArray(t)) {
    for (let s = 0; s < t.length; s++) Eo(e, t[s], r, n, i);
    1 & (e = 0 | t[_]) || X(t, 1 | e);
  }
}), L = an(function(e, t, r, n, i, s) {
  if (e.i !== 2) return !1;
  var a = 0 | t[_];
  return Xa(t, a, s, r, Vt(a)), fr(e, t = fi(t, n, r), i), !0;
}, Eo), Nt = z(function(e, t, r) {
  return e.i === 2 && (Z(t, r, gi(e)), !0);
}, Ti, sn), No = qe(function(e, t, r) {
  return e.i === 2 && (e = gi(e), at(t, 0 | t[_], r).push(e), !0);
}, function(e, t, r) {
  if ((t = Xe(Da, t, !1)) != null) for (let a = 0; a < t.length; a++) {
    var n = e, i = r, s = t[a];
    s != null && mr(n, i, en(s, !0).buffer);
  }
}, sn), Oo = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, xe(e.h)), !0);
}, bo, wi), $1 = qe(function(e, t, r) {
  return (e.i === 0 || e.i === 2) && (t = at(t, 0 | t[_], r), e.i == 2 ? dr(e, xe, t) : t.push(xe(e.h)), !0);
}, function(e, t, r) {
  if ((t = Xe(Na, t, !0)) != null) for (let a = 0; a < t.length; a++) {
    var n = e, i = r, s = t[a];
    s != null && (re(n, i, 0), zt(n.h, s));
  }
}, wi), D1 = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, (e = xe(e.h)) === 0 ? void 0 : e), !0);
}, bo, wi), g = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, Ye(e.h)), !0);
}, ko, Ei), Tr = z(function(e, t, r) {
  return e.i === 0 && (Z(t, r, (e = Ye(e.h)) === 0 ? void 0 : e), !0);
}, ko, Ei), B1 = z(function(e, t, r) {
  return e.i !== 0 ? e = !1 : (Z(t, r, (function(n) {
    return di(n, (i, s) => {
      var a = -(1 & i);
      return Fa(i = (i >>> 1 | s << 31) ^ a, s >>> 1 ^ a);
    });
  })(e.h)), e = !0), e;
}, function(e, t, r) {
  if ((t = ni(t)) != null && (oo(t), t != null)) switch (re(e, r, 0), typeof t) {
    case "number":
      e = e.h, t = (r = t) < 0, In(r = 2 * Math.abs(r)), r = I;
      let n = x;
      t && (r == 0 ? n == 0 ? n = r = 4294967295 : (n--, r = 4294967295) : r--), We(e, I = r, x = n);
      break;
    case "bigint":
      e = e.h, t = t << BigInt(1) ^ t >> BigInt(63), I = Number(BigInt.asUintN(32, t)), x = Number(BigInt.asUintN(32, t >> BigInt(32))), We(e, I, x);
      break;
    default:
      b1(e.h, t);
  }
}, T1);
class j1 {
  constructor(t, r) {
    var n = ge;
    this.h = t, this.i = r, this.o = M, this.u = y, this.defaultValue = void 0, this.l = n.kb != null ? Sa : void 0;
  }
  register() {
    Wr(this);
  }
}
function $e(e, t) {
  return new j1(e, t);
}
function ot(e, t) {
  return (r, n) => {
    e: {
      let s = { na: !0 };
      n && Object.assign(s, n), r = eo(r, void 0, void 0, s);
      try {
        let a = new e(), o = a.B;
        Si(t)(o, r);
        var i = a;
        break e;
      } catch (a) {
        throw a instanceof RangeError ? new SyntaxError() : a;
      } finally {
        to(r);
      }
      i = void 0;
    }
    return i;
  };
}
function Ii(e) {
  return (t) => _o(t, e);
}
function gr(e) {
  return function() {
    return _o(this, e);
  };
}
var U1 = [0, Nt, No, b, c], G1 = [0, Ue, [0, Tr, [0, Lr, dt], Tr, -1, [0, g], Tr, -1], z(Fo, Ti, sn)], An, Es = class extends d {
  constructor(e) {
    super(e);
  }
}, bs = [0, Ue, z(Fo, function(e, t, r) {
  if (t != null) {
    if (t instanceof d) {
      let n = t.nb;
      return void (n ? (t = n(t), t != null && mr(e, r, en(t, !0).buffer)) : xt(Tn, 3));
    }
    if (Array.isArray(t)) return void xt(Tn, 3);
  }
  Ti(e, t, r);
}, sn)], V1 = [0, 1, [0, 12, T, 10, b], [0, 7, [0, T, -1]]], ks = globalThis.trustedTypes, H1 = class {
  constructor(e) {
    this.h = e;
  }
  toString() {
    return this.h + "";
  }
};
function Ss(e) {
  var t;
  return An === void 0 && (An = (function() {
    var r = null;
    if (!ks) return r;
    try {
      let n = (i) => i;
      r = ks.createPolicy("goog#html", { createHTML: n, createScript: n, createScriptURL: n });
    } catch {
    }
    return r;
  })()), e = (t = An) ? t.createScriptURL(e) : e, new H1(e);
}
function ut(e, ...t) {
  if (t.length === 0) return Ss(e[0]);
  var r = e[0];
  for (let n = 0; n < t.length; n++) r += encodeURIComponent(t[n]) + e[n + 1];
  return Ss(r);
}
var Mo = [0, T, g, b, -1, Xt, g, -1, b, -1], Co = [0, g, -1, b], xo = class extends d {
  constructor(e) {
    super(e);
  }
}, Ro = [0, b, c, b, g, -1, qe(function(e, t, r) {
  return (e.i === 0 || e.i === 2) && (t = at(t, 0 | t[_], r), e.i == 2 ? dr(e, g1, t) : t.push(Ye(e.h)), !0);
}, function(e, t, r) {
  if ((t = Xe(Et, t, !0)) != null && t.length) {
    r = _i(e, r);
    for (let n = 0; n < t.length; n++) pr(e.h, t[n]);
    vi(e, r);
  }
}, Ei), c, -1, [0, b, -1], g, b, -1, Co], K1 = class extends d {
  constructor(e) {
    super(e);
  }
}, W1 = class extends d {
  constructor(e) {
    super(e);
  }
}, Po = class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    return Va(this, 9);
  }
}, $o = [0, 3, b, -1, 2, [0, [2], T, L, [0, Oo]], [0, g, b, g, b, g, 4, [0, b, c, -1, b], g, b, -1], [0, [3, 4], c, -1, L, [0, T], L, [0, g, -1]], [0], c, b], Do = [0, c, -2], Ls = class extends d {
  constructor(e) {
    super(e);
  }
}, Bo = [0], z1 = class extends d {
  constructor(e) {
    super(e);
  }
}, jo = [0, T, b, 1, b, -4], ge = class extends d {
  constructor(e) {
    super(e, 2);
  }
}, J = {};
J[336783863] = [0, c, b, -1, T, [0, [1, 2, 3, 4, 5, 6, 7, 8, 9], L, Bo, L, Ro, L, Do, L, jo, L, Mo, L, [0, c, -2], L, [0, c, g], L, $o, L, Co], [0, c], b, [0, [1, 3], [2, 4], L, [0, Xt], -1, L, [0, Q], -1, P, [0, c, -1]], c];
var Ts = [0, Lr, -1, tt, -3, Lr, Xt, Ue, dt, Lr, -1, tt, dt, tt, -2, Ue];
function j(e, t) {
  Qr(e, 3, t);
}
function F(e, t) {
  Qr(e, 4, t);
}
var ue = class extends d {
  constructor(e) {
    super(e, 500);
  }
  A(e) {
    return y(this, 0, 7, e);
  }
}, tr = [-1, {}], Fs = [0, c, 1, tr], Is = [0, c, Q, tr];
function be(e, t) {
  sr(e, 1, ue, t);
}
function G(e, t) {
  Qr(e, 10, t);
}
function C(e, t) {
  Qr(e, 15, t);
}
var _e = class extends d {
  constructor(e) {
    super(e, 500);
  }
  A(e) {
    return y(this, 0, 1001, e);
  }
}, Uo = [-500, P, [-500, Ue, -1, Q, -3, [-2, J, b], P, bs, dt, -1, Fs, Is, P, [0, Ue, tt], Ue, Ts, dt, Q, 987, Q], 4, P, [-500, c, -1, [-1, {}], 998, c], P, [-500, c, Q, -1, [-2, {}, b], 997, Q, -1], dt, P, [-500, c, Q, tr, 998, Q], Q, dt, Fs, Is, P, [0, Ue, -1, tr], Q, -2, Ts, Ue, -1, tt, [0, tt, D1], 978, tr, P, bs];
_e.prototype.h = gr(Uo);
var Y1 = ot(_e, Uo), X1 = class extends d {
  constructor(e) {
    super(e);
  }
}, Go = class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    return kt(this, X1, 1);
  }
}, Vo = [0, P, [0, T, H, c, -1]], ln = ot(Go, Vo), q1 = class extends d {
  constructor(e) {
    super(e);
  }
}, J1 = class extends d {
  constructor(e) {
    super(e);
  }
}, wn = class extends d {
  constructor(e) {
    super(e);
  }
  l() {
    return M(this, q1, 2);
  }
  h() {
    return kt(this, J1, 5);
  }
}, Ho = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, Q, Xt, Fi, [0, g, [0, T, -3], [0, H, -3], [0, T, -1, [0, P, [0, T, -2]]], P, [0, H, -1, c, H]], c, -1, $, P, [0, T, H], Q, $]), Z1 = class extends d {
  constructor(e) {
    super(e);
  }
}, Ot = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, P, [0, H, -4]]), Q1 = class extends d {
  constructor(e) {
    super(e);
  }
}, _r = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, P, [0, H, -4]]), eh = class extends d {
  constructor(e) {
    super(e);
  }
}, th = [0, T, -1, Fi, g], Ko = class extends d {
  constructor(e) {
    super(e);
  }
};
Ko.prototype.h = gr([0, H, -4, $]);
var rh = class extends d {
  constructor(e) {
    super(e);
  }
}, nh = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, P, [0, 1, T, c, Vo], $]), ih = class extends d {
  constructor(e) {
    super(e);
  }
}, sh = class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    var e = B(this, 1, void 0, Wa);
    return e ?? vt();
  }
}, ah = class extends d {
  constructor(e) {
    super(e);
  }
}, Fr = [1, 2], oh = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, P, [0, Fr, L, [0, Fi], L, [0, Nt], T, c], $]), Ni = class extends d {
  constructor(e) {
    super(e);
  }
}, Wo = [0, c, T, H, Q, -1], Ns = class extends d {
  constructor(e) {
    super(e);
  }
}, hh = [0, b, -1], Gr = class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    return Ha(this, 2, He);
  }
  l() {
    return Cn(this, Po, 6, He);
  }
}, He = [1, 2, 3, 4, 5, 6], Vr = class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    return B(this, 1, void 0, Wa) != null;
  }
  l() {
    return ee(B(this, 2)) != null;
  }
}, V = class extends d {
  constructor(e) {
    super(e);
  }
}, zo = [0, Nt, c, [0, T, $, -1], [0, Ur, $]], W = [0, zo, b, [0, He, L, jo, L, Ro, L, Mo, L, Bo, L, Do, L, $o], g], uh = Ii(W), fn = class extends d {
  constructor(e) {
    super(e);
  }
}, Oi = [0, W, H, -1, T], ch = $e(502141897, fn);
J[502141897] = Oi;
var lh = ot(class extends d {
  constructor(e) {
    super(e);
  }
}, [0, [0, g, -1, R1, $1], th]), Yo = class extends d {
  constructor(e) {
    super(e);
  }
}, Xo = class extends d {
  constructor(e) {
    super(e);
  }
}, $n = [0, W, H, [0, W], b], fh = $e(508968150, Xo);
J[508968150] = [0, W, Oi, $n, H, [0, [0, zo]]], J[508968149] = $n;
var Ft = class extends d {
  constructor(e) {
    super(e);
  }
  l() {
    return M(this, Ni, 2);
  }
  h() {
    k(this, 2);
  }
}, qo = [0, W, Wo];
J[478825465] = qo;
var dh = class extends d {
  constructor(e) {
    super(e);
  }
}, Jo = class extends d {
  constructor(e) {
    super(e);
  }
}, Mi = class extends d {
  constructor(e) {
    super(e);
  }
}, Ci = class extends d {
  constructor(e) {
    super(e);
  }
}, Zo = class extends d {
  constructor(e) {
    super(e);
  }
}, Os = [0, W, [0, W], qo, -1], Qo = [0, W, H, T], xi = [0, W, H], e2 = [0, W, Qo, xi, H], ph = $e(479097054, Zo);
J[479097054] = [0, W, e2, Os], J[463370452] = Os, J[464864288] = Qo;
var mh = $e(462713202, Ci);
J[462713202] = e2, J[474472470] = xi;
var gh = class extends d {
  constructor(e) {
    super(e);
  }
}, t2 = class extends d {
  constructor(e) {
    super(e);
  }
}, r2 = class extends d {
  constructor(e) {
    super(e);
  }
}, n2 = class extends d {
  constructor(e) {
    super(e);
  }
}, Ri = [0, W, H, -1, T], Dn = [0, W, H, b];
n2.prototype.h = gr([0, W, xi, [0, W], Oi, $n, Ri, Dn]);
var i2 = class extends d {
  constructor(e) {
    super(e);
  }
}, _h = $e(456383383, i2);
J[456383383] = [0, W, Wo];
var s2 = class extends d {
  constructor(e) {
    super(e);
  }
}, vh = $e(476348187, s2);
J[476348187] = [0, W, hh];
var a2 = class extends d {
  constructor(e) {
    super(e);
  }
}, Ms = class extends d {
  constructor(e) {
    super(e);
  }
}, o2 = [0, g, -1], yh = $e(458105876, class extends d {
  constructor(e) {
    super(e);
  }
  h() {
    var e = this.B, t = 0 | e[_], r = he(this, t);
    return e = (function(n, i, s, a) {
      var o = Ms;
      !a && Wt(n) && (s = 0 | (i = n.B)[_]);
      var h = Me(i, 2);
      if (n = !1, h == null) {
        if (a) return us();
        h = [];
      } else if (h.constructor === ze) {
        if (!(2 & h.N) || a) return h;
        h = h.fa();
      } else Array.isArray(h) ? n = !!(2 & h[_]) : h = [];
      if (a) {
        if (!h.length) return us();
        n || (n = !0, hr(h));
      } else n && (n = !1, nr(h), h = za(h));
      return !n && 32 & s && or(h, 32), s = K(i, s, 2, a = new ze(h, o, r1, void 0)), n || it(i, s), a;
    })(this, e, t, r), !r && Ms && (e.Ga = !0), e;
  }
});
J[458105876] = [0, o2, x1, [!0, $, [0, c, -1, Q]], [0, Xt, b, g], b];
var Pi = class extends d {
  constructor(e) {
    super(e);
  }
}, h2 = $e(458105758, Pi);
J[458105758] = [0, W, c, o2];
var Ah = class extends d {
  constructor(e) {
    super(e);
  }
}, wh = class extends d {
  constructor(e) {
    super(e);
  }
}, Eh = class extends d {
  constructor(e) {
    super(e);
  }
}, bh = Ii([0, P, [0, Tr, P, [0, Io, -1], tt]]), En = class extends d {
  constructor(e) {
    super(e);
  }
}, Cs = [0, Io, -1, tt], kh = class extends d {
  constructor(e) {
    super(e);
  }
}, u2 = class extends d {
  constructor(e) {
    super(e);
  }
}, Bn = [1, 2];
u2.prototype.h = gr([0, Bn, L, Cs, L, [0, P, Cs]]);
var c2 = class extends d {
  constructor(e) {
    super(e);
  }
}, Sh = $e(443442058, c2);
J[443442058] = [0, W, c, T, H, Q, -1, b, H], J[514774813] = Ri;
var l2 = class extends d {
  constructor(e) {
    super(e);
  }
}, Lh = $e(516587230, l2);
function jn(e, t) {
  return t = t ? t.clone() : new Ni(), e.displayNamesLocale !== void 0 ? k(t, 1, Ve(e.displayNamesLocale)) : e.displayNamesLocale === void 0 && k(t, 1), e.maxResults !== void 0 ? Ce(t, 2, e.maxResults) : "maxResults" in e && k(t, 2), e.scoreThreshold !== void 0 ? w(t, 3, e.scoreThreshold) : "scoreThreshold" in e && k(t, 3), e.categoryAllowlist !== void 0 ? xr(t, 4, e.categoryAllowlist) : "categoryAllowlist" in e && k(t, 4), e.categoryDenylist !== void 0 ? xr(t, 5, e.categoryDenylist) : "categoryDenylist" in e && k(t, 5), t;
}
function f2(e) {
  var t = Number(e);
  return Number.isSafeInteger(t) ? t : String(e);
}
function $i(e, t = -1, r = "") {
  return { categories: e.map((n) => ({ index: Ae(n, 1) ?? 0 ?? -1, score: te(n, 2) ?? 0, categoryName: ee(B(n, 3)) ?? "" ?? "", displayName: ee(B(n, 4)) ?? "" ?? "" })), headIndex: t, headName: r };
}
function Th(e) {
  var t = { classifications: kt(e, rh, 1).map((r) => {
    var n;
    return $i(((n = M(r, Go, 4)) == null ? void 0 : n.h()) ?? [], Ae(r, 2) ?? 0, ee(B(r, 3)) ?? "");
  }) };
  return (function(r) {
    return r == null ? r : typeof r == "bigint" ? (Fn(r) ? r = Number(r) : (r = pt(64, r), r = Fn(r) ? Number(r) : String(r)), r) : Ht(r) ? typeof r == "number" ? qr(r) : Or(r) : void 0;
  })(B(e, 2, void 0, Mr)) != null && (t.timestampMs = f2(B(e, 2, void 0, Mr) ?? Ga)), t;
}
function d2(e) {
  var a, o;
  var t = ft(e, 3, fe), r = ft(e, 2, Et), n = ft(e, 1, ee), i = ft(e, 9, ee), s = { categories: [], keypoints: [] };
  for (let h = 0; h < t.length; h++) s.categories.push({ score: t[h], index: r[h] ?? -1, categoryName: n[h] ?? "", displayName: i[h] ?? "" });
  if ((t = (a = M(e, wn, 4)) == null ? void 0 : a.l()) && (s.boundingBox = { originX: Ae(t, 1, Je) ?? 0, originY: Ae(t, 2, Je) ?? 0, width: Ae(t, 3, Je) ?? 0, height: Ae(t, 4, Je) ?? 0, angle: 0 }), (o = M(e, wn, 4)) == null ? void 0 : o.h().length) for (let h of M(e, wn, 4).h()) s.keypoints.push({ x: B(h, 1, Je, fe) ?? 0, y: B(h, 2, Je, fe) ?? 0, score: B(h, 4, Je, fe) ?? 0, label: ee(B(h, 3, Je)) ?? "" });
  return s;
}
function vr(e) {
  var t = [];
  for (let r of kt(e, Q1, 1)) e = { x: te(r, 1) ?? 0, y: te(r, 2) ?? 0, z: te(r, 3) ?? 0, visibility: te(r, 4) ?? 0 }, B(r, 5, void 0, fe) != null && (e.presence = te(r, 5) ?? 0), t.push(e);
  return t;
}
function Mt(e) {
  var t = [];
  for (let r of kt(e, Z1, 1)) e = { x: te(r, 1) ?? 0, y: te(r, 2) ?? 0, z: te(r, 3) ?? 0, visibility: te(r, 4) ?? 0 }, B(r, 5, void 0, fe) != null && (e.presence = te(r, 5) ?? 0), t.push(e);
  return t;
}
function xs(e) {
  return Array.from(e, (t) => t > 127 ? t - 256 : t);
}
function Rs(e, t) {
  if (e.length !== t.length) throw Error(`Cannot compute cosine similarity between embeddings of different sizes (${e.length} vs. ${t.length}).`);
  var r = 0, n = 0, i = 0;
  for (let s = 0; s < e.length; s++) r += e[s] * t[s], n += e[s] * e[s], i += t[s] * t[s];
  if (n <= 0 || i <= 0) throw Error("Cannot compute cosine similarity on embedding with 0 norm.");
  return r / Math.sqrt(n * i);
}
J[516587230] = [0, W, Ri, Dn, H], J[518928384] = Dn;
var wr, Fh = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
async function p2(e) {
  if (e) return !0;
  if (wr === void 0) try {
    await WebAssembly.instantiate(Fh), wr = !0;
  } catch {
    wr = !1;
  }
  return wr;
}
async function ct(e, t, r) {
  return { wasmLoaderPath: `${t}/${e}_${r = `wasm${r ? "_module" : ""}${await p2(r) ? "" : "_nosimd"}_internal`}.js`, wasmBinaryPath: `${t}/${e}_${r}.wasm` };
}
var je = class {
};
function Ps(e) {
  return k(new Un(), 1, Ke(e));
}
je.forVisionTasks = function(e, t = !1) {
  return ct("vision", e ?? ut``, t);
}, je.forLiteRtLmTextTasks = function(e, t = !1) {
  return ct("litertlm_text", e ?? ut``, t);
}, je.forTextTasks = function(e, t = !1) {
  return ct("text", e ?? ut``, t);
}, je.forRetrievalTasks = function(e, t = !1) {
  return ct("retrieval", e ?? ut``, t);
}, je.forGenAiTasks = function(e, t = !1) {
  return ct("genai", e ?? ut``, t);
}, je.forDecisionTasks = function(e, t = !1) {
  return ct("decision", e ?? ut``, t);
}, je.forAudioTasks = function(e, t = !1) {
  return ct("audio", e ?? ut``, t);
}, je.isSimdSupported = function(e = !1) {
  return p2(e);
};
var Un = class extends d {
  constructor(e) {
    super(e);
  }
}, Ih = class extends d {
  constructor(e) {
    super(e);
  }
}, $s = [0, g, 2, Ur, -2, $, P, [0, g, $]], Nh = class extends d {
  constructor(e) {
    super(e);
  }
}, Oh = class extends d {
  constructor(e) {
    super(e);
  }
};
function Gn(e, t) {
  return k(e, 1, Ke(t));
}
function Vn(e, t) {
  return k(e, 2, Ke(t));
}
var Hn = class extends d {
  constructor(e) {
    super(e);
  }
}, Hr = [3, 4, 5, 6, 7], Mh = class extends d {
  constructor(e) {
    super(e);
  }
}, m2 = class extends d {
  constructor(e) {
    super(e);
  }
};
m2.prototype.h = gr([0, [0, g, c, -3, g], [0, Hr, g, -1, L, [0, g, c, Ur], L, $s, L, [0, 1, $s], L, [0, g], L, [0, g, c, Ur]]]);
var Ch = class {
  constructor() {
    this.h = typeof AbortController < "u";
  }
  async send(e, t, r) {
    var n = this.h ? new AbortController() : void 0, i = n && e.ma > 0 ? setTimeout(() => {
      n.abort();
    }, e.ma) : void 0;
    try {
      let s = await fetch(e.url, { method: e.cb, headers: { ...e.bb }, ...e.body && { body: e.body }, ...e.withCredentials && { credentials: "include" }, signal: e.ma && n ? n.signal : null });
      s.status === 200 ? t == null || t(await s.text()) : r == null || r(s.status);
    } catch (s) {
      (s == null ? void 0 : s.name) === "AbortError" ? r == null || r(408) : r == null || r(400);
    } finally {
      clearTimeout(i);
    }
  }
}, xh = class extends d {
  constructor(e) {
    super(e, 37);
  }
}, Ds = [-4, {}, V1, g, G1], Bs = [0, c, g, 1, c, -1, g, 1, g, 1, $], js = [0, g, c, -2], Us = [0, c, g], Gs = [0, c, g], Vs = [0, b, -3], Hs = [0, g, c, -1, $, T, -1, c, -5, P, [0, c, -4], -1, b, [0, b, -3], g], Rh = class extends d {
  constructor(e) {
    super(e, 19);
  }
}, Ph = Ii([-19, {}, [0, g, 1, [0, c, -6, $, T, c, -1, $], 1, [0, c, 1, c, -5], c, -1, [0, g, c, -8], [0, c, -3], [0, c, g, c, -2], [0, c, -1, g, c, -1, g, c, -1, [0, P, [0, c, -1], b, c, -5], [0, g, b, T, -2]], $, [0, c, -3, $, T, c, -1], [0, g, c, -1], [0, c, -9], [0, c, -6, g, c, 1, c, b, g, -1, b, c, -2, g, c, g, c, T, -1], 1, [0, g], 1, [0, c, -4], 1, Bs, [0, [1, 2, 3, 4, 5, 6], L, Bs, L, Us, L, Gs, L, [0, g], L, Hs, L, js], Us, Gs, Hs, [0, [0, g, c, -1, $, T, -1, c, -4, P, [0, c, -4], -1, 1, Vs], [0, g, c, -1, $, T, -1, c, -4, Vs]], js, [0, c, [0, T, -3, g], g, -2, [0, T, -1], b], 4, [0, c, g, c, -1, $, g, c, -1, g, T, -1]], g, P, [-37, {}, Qt, c, P, [0, c, -1], Nt, 1, Nt, [0, Q, -1, ws, P1, -1], c, [0, T, c, -1], b, T, $, c, -1, B1, U1, Qt, Nt, g, ws, $, -1, [0, g, -1], c, b, c, Xt, c, -1, As, 1, As, Ds, b, [0, g, [0, H, T, -2], [0, H]], [0, g, $]], Qt, No, c, -1, Qt, g, -1, [0, b, -1, g, b], [0, $, -1, c], [0, Qt, b, $], $, 1, Oo, 1, Ds]), $h = class {
  constructor(e) {
    this.i = [], this.o = new Ch(), this.l = e ?? "", this.h = setInterval(() => {
      this.flush();
    }, 6e4);
  }
  close() {
    this.h !== void 0 && (clearInterval(this.h), this.h = void 0), this.flush();
  }
  flush(e, t) {
    if (this.error) t == null || t("net-send-failed");
    else if (this.i.length === 0) e == null || e();
    else {
      var r = this.i;
      this.i = [], r = (function(n) {
        var i = new Rh();
        return Mn(i = k(i, 2, Ke(1786)), 3, n);
      })(r), r = Ph(r), this.o.send({ url: "https://odml.pa.googleapis.com/v1/log", cb: "POST", ma: 1e4, body: r, ib: 2, bb: { "Content-Type": "application/x-protobuf", "x-goog-api-key": this.l }, withCredentials: !1 }, () => {
        e == null || e();
      }, (n) => {
        this.error = Error(`Logging failed with HTTP error: ${n}`), this.i = [], this.h !== void 0 && (clearInterval(this.h), this.h = void 0), t == null || t("net-send-failed", n);
      });
    }
  }
};
class Ks {
  constructor() {
    this.ba = this.V = this.Y = this.S = this.W = this.U = this.R = 0;
  }
}
function Kn(e, t) {
  var r = new m2();
  r = y(r, 0, 1, e.C), r = y(r, 0, 2, t), t = k(t = new xh(), 6, zr(r = r.h(), !1)), (e = e.m).error || e.i.push(t);
}
function Ws(e, t) {
  var r = { R: t.R - e.l.R, U: t.U - e.l.U, W: t.W - e.l.W, S: t.S - e.l.S, Y: t.Y - e.l.Y, V: t.V, ba: t.ba }, n = Vn(Gn(new Hn(), e.D), 1);
  r = g2(e, r), Kn(e, n = ke(n, 4, Hr, r)), e.l = t;
}
function g2(e, t) {
  var r = new Ih();
  return e = kr(e = vn(e = k(r, 1, Ke(e.F)), 7, t.S), 5, t.V), e = kr(e, 6, t.ba), t.W > 0 && kr(e, 4, t.Y / t.W), t.R !== 0 && (r = vn(r = Ps(3), 2, t.R), sr(e, 8, Un, r)), t.U !== 0 && (t = vn(r = Ps(4), 2, t.U), sr(e, 8, Un, t)), e;
}
var Dh = class {
  constructor(e, t, r) {
    this.v = performance.now(), this.o = performance.now(), this.i = /* @__PURE__ */ new Map(), this.u = 0, this.h = new Ks(), this.l = new Ks(), this.m = new $h(r), this.D = (function(n) {
      switch (n) {
        case "AudioClassifier":
          return 4;
        case "AudioEmbedder":
          return 5;
        case "TextClassifier":
          return 6;
        case "TextEmbedder":
          return 7;
        case "GestureRecognizer":
          return 8;
        case "HandDetector":
          return 9;
        case "HandLandmarker":
          return 10;
        case "ImageClassifier":
          return 11;
        case "ImageEmbedder":
          return 12;
        case "ImageSegmenter":
          return 13;
        case "ObjectDetector":
          return 14;
        case "FaceDetector":
          return 15;
        case "FaceLandmarker":
          return 16;
        case "InteractiveSegmenter":
        case "InteractiveSegmenterLegacy":
          return 18;
        case "HolisticLandmarker":
          return 20;
        case "LlmInference":
          return 21;
        case "LanguageDetector":
          return 22;
        case "PoseLandmarker":
          return 23;
        case "UniversalEmbedder":
          return 28;
        case "SemanticRetriever":
          return 29;
        case "DecisionMaker":
          return 30;
        case "TextSummarizer":
          return 26;
        case "TextProofreader":
          return 27;
        case "AudioTranscriber":
          return 31;
        default:
          return 0;
      }
    })(e), this.F = (function(n) {
      switch (n) {
        case "IMAGE":
          return 11;
        case "VIDEO":
          return 12;
        case "LIVE_STREAM":
          return 13;
        case "AUDIO_CLIPS":
          return 14;
        case "AUDIO_STREAM":
          return 15;
        default:
          return 10;
      }
    })(t), e = new Mh(), typeof window > "u" ? t = 0 : (t = navigator.userAgent, t = /Android/i.test(t) ? 1 : /iPhone|iPad|iPod/i.test(t) ? 2 : /Windows/i.test(t) ? 5 : /Macintosh/i.test(t) ? 4 : /Linux/i.test(t) ? 3 : 0), e = k(e, 1, Ke(t)), e = k(e, 2, Ve("")), e = k(e, 3, Ve("")), e = k(e, 4, Ve("1.1.1")), e = k(e, 5, Ve("")), this.C = k(e, 6, Ke(4));
  }
  za() {
    var e = new Oh();
    e = kr(e = k(e, 1, Ke(this.F)), 3, performance.now() - this.v), Kn(this, e = ke(Vn(Gn(new Hn(), this.D), 0), 3, Hr, e)), this.o = performance.now();
  }
  Aa(e) {
    var t = this.i.get(e);
    if (t !== void 0 && (this.i.delete(e), e = performance.now() - t, ++this.h.W, this.h.Y += e, this.h.V = Math.max(this.h.V, e), this.u = Math.max(this.u, e), performance.now() > this.o + 3e4)) {
      for (let [r, n] of this.i.entries()) e = r, n < t && (this.h.S++, this.i.delete(e));
      t = { ...this.h, ba: performance.now() - this.o }, this.h.V = 0, this.o = performance.now(), Ws(this, t);
    }
  }
  ya() {
    var e = { ...this.h, S: this.h.S + this.i.size, V: this.u, ba: performance.now() - this.v };
    Ws(this, e);
    var t = new Nh();
    t = y(t, 0, 2, e = g2(this, e)), Kn(this, t = ke(e = Vn(Gn(new Hn(), this.D), 2), 5, Hr, t));
  }
  close() {
    var e = this.m;
    typeof e.close == "function" ? e.close() : e.flush();
  }
};
function Di() {
  var e = navigator;
  return typeof OffscreenCanvas < "u" && (!(function(t = navigator) {
    return (t = t.userAgent).includes("Safari") && !t.includes("Chrome");
  })(e) || !!((e = e.userAgent.match(/Version\/([\d]+).*Safari/)) && e.length >= 1 && Number(e[1]) >= 17));
}
async function zs(e) {
  if (typeof importScripts != "function") {
    let t = document.createElement("script");
    return t.src = e.toString(), t.crossOrigin = "anonymous", new Promise((r, n) => {
      t.addEventListener("load", () => {
        r();
      }, !1), t.addEventListener("error", (i) => {
        n(i);
      }, !1), document.body.appendChild(t);
    });
  }
  try {
    importScripts(e.toString());
  } catch (t) {
    if (!(t instanceof TypeError)) throw t;
    {
      let r = self.import;
      r ? await r(e.toString()) : await import(e.toString());
    }
  }
}
function Bi(e) {
  return e.videoWidth !== void 0 ? [e.videoWidth, e.videoHeight] : e.naturalWidth !== void 0 ? [e.naturalWidth, e.naturalHeight] : e.displayWidth !== void 0 ? [e.displayWidth, e.displayHeight] : [e.width, e.height];
}
function v(e, t, r) {
  e.o || console.error("No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target"), r(t = e.j.stringToNewUTF8(t)), e.j._free(t);
}
function _2(e, t, r) {
  if (!e.j.canvas) throw Error("No OpenGL canvas configured.");
  if (r ? e.j._bindTextureToStream(r) : e.j._bindTextureToCanvas(), !(r = e.j.canvas.getContext("webgl2") || e.j.canvas.getContext("webgl"))) throw Error("Failed to obtain WebGL context from the provided canvas. `getContext()` should only be invoked with `webgl` or `webgl2`.");
  e.j.gpuOriginForWebTexturesIsBottomLeft && r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL, !0), r.texImage2D(r.TEXTURE_2D, 0, r.RGBA, r.RGBA, r.UNSIGNED_BYTE, t), e.j.gpuOriginForWebTexturesIsBottomLeft && r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL, !1);
  var [n, i] = Bi(t);
  return !e.l || n === e.j.canvas.width && i === e.j.canvas.height || (e.j.canvas.width = n, e.j.canvas.height = i), [n, i];
}
function Ys(e, t, r) {
  e.o || console.error("No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target");
  var n = new Uint32Array(t.length);
  for (let i = 0; i < t.length; i++) n[i] = e.j.stringToNewUTF8(t[i]);
  t = e.j._malloc(4 * n.length), e.j.HEAPU32.set(n, t >> 2), r(t);
  for (let i of n) e.j._free(i);
  e.j._free(t);
}
function Ie(e, t, r) {
  e.j.simpleListeners = e.j.simpleListeners || {}, e.j.simpleListeners[t] = r;
}
function Ze(e, t, r) {
  var n = [];
  e.j.simpleListeners = e.j.simpleListeners || {}, e.j.simpleListeners[t] = (i, s, a) => {
    s ? (r(n, a), n = []) : n.push(i);
  };
}
var v2 = class {
  constructor(e, t) {
    this.l = !0, this.j = e, this.h = null, this.i = 0, this.o = typeof this.j._addIntToInputStream == "function", t !== void 0 ? this.j.canvas = t : Di() ? this.j.canvas = new OffscreenCanvas(1, 1) : (console.warn("OffscreenCanvas not supported and GraphRunner constructor glCanvas parameter is undefined. Creating backup canvas."), this.j.canvas = document.createElement("canvas"));
  }
  async initializeGraph(e) {
    var t = await (await fetch(e)).arrayBuffer();
    e = !(e.endsWith(".pbtxt") || e.endsWith(".textproto")), this.setGraph(new Uint8Array(t), e);
  }
  setGraphFromString(e) {
    this.setGraph(new TextEncoder().encode(e), !1);
  }
  setGraph(e, t) {
    var r = e.length, n = this.j._malloc(r);
    this.j.HEAPU8.set(e, n), t ? this.j._changeBinaryGraph(r, n) : this.j._changeTextGraph(r, n), this.j._free(n);
  }
  configureAudio(e, t, r, n, i) {
    this.j._configureAudio || console.warn('Attempting to use configureAudio without support for input audio. Is build dep ":gl_graph_runner_audio" missing?'), v(this, n || "input_audio", (s) => {
      v(this, i = i || "audio_header", (a) => {
        this.j._configureAudio(s, a, e, t ?? 0, r);
      });
    });
  }
  setAutoResizeCanvas(e) {
    this.l = e;
  }
  setAutoRenderToScreen(e) {
    this.j._setAutoRenderToScreen(e);
  }
  setGpuBufferVerticalFlip(e) {
    this.j.gpuOriginForWebTexturesIsBottomLeft = e;
  }
  ka(e) {
    Ie(this, "__graph_config__", (t) => {
      e(t);
    }), v(this, "__graph_config__", (t) => {
      this.j._getGraphConfig(t, void 0);
    }), delete this.j.simpleListeners.__graph_config__;
  }
  attachErrorListener(e) {
    this.j.errorListener = e;
  }
  attachEmptyPacketListener(e, t) {
    this.j.emptyPacketListeners = this.j.emptyPacketListeners || {}, this.j.emptyPacketListeners[e] = t;
  }
  addAudioToStream(e, t, r) {
    this.addAudioToStreamWithShape(e, 0, 0, t, r);
  }
  addAudioToStreamWithShape(e, t, r, n, i) {
    var s = 4 * e.length;
    this.i !== s && (this.h && this.j._free(this.h), this.h = this.j._malloc(s), this.i = s), this.j.HEAPF32.set(e, this.h / 4), v(this, n, (a) => {
      this.j._addAudioToInputStream(this.h, t, r, a, i);
    });
  }
  addGpuBufferToStream(e, t, r) {
    v(this, t, (n) => {
      var [i, s] = _2(this, e, n);
      this.j._addBoundTextureToStream(n, i, s, r);
    });
  }
  addBoolToStream(e, t, r) {
    v(this, t, (n) => {
      this.j._addBoolToInputStream(e, n, r);
    });
  }
  addDoubleToStream(e, t, r) {
    v(this, t, (n) => {
      this.j._addDoubleToInputStream(e, n, r);
    });
  }
  addFloatToStream(e, t, r) {
    v(this, t, (n) => {
      this.j._addFloatToInputStream(e, n, r);
    });
  }
  addIntToStream(e, t, r) {
    v(this, t, (n) => {
      this.j._addIntToInputStream(e, n, r);
    });
  }
  addUintToStream(e, t, r) {
    v(this, t, (n) => {
      this.j._addUintToInputStream(e, n, r);
    });
  }
  addStringToStream(e, t, r) {
    v(this, t, (n) => {
      v(this, e, (i) => {
        this.j._addStringToInputStream(i, n, r);
      });
    });
  }
  addStringRecordToStream(e, t, r) {
    v(this, t, (n) => {
      Ys(this, Object.keys(e), (i) => {
        Ys(this, Object.values(e), (s) => {
          this.j._addFlatHashMapToInputStream(i, s, Object.keys(e).length, n, r);
        });
      });
    });
  }
  addProtoToStream(e, t, r, n) {
    v(this, r, (i) => {
      v(this, t, (s) => {
        var a = this.j._malloc(e.length);
        this.j.HEAPU8.set(e, a), this.j._addProtoToInputStream(a, e.length, s, i, n), this.j._free(a);
      });
    });
  }
  addEmptyPacketToStream(e, t) {
    v(this, e, (r) => {
      this.j._addEmptyPacketToInputStream(r, t);
    });
  }
  addBoolVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateBoolVector(e.length);
      if (!i) throw Error("Unable to allocate new bool vector on heap.");
      for (let s of e) this.j._addBoolVectorEntry(i, s);
      this.j._addBoolVectorToInputStream(i, n, r);
    });
  }
  addDoubleVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateDoubleVector(e.length);
      if (!i) throw Error("Unable to allocate new double vector on heap.");
      for (let s of e) this.j._addDoubleVectorEntry(i, s);
      this.j._addDoubleVectorToInputStream(i, n, r);
    });
  }
  addFloatVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateFloatVector(e.length);
      if (!i) throw Error("Unable to allocate new float vector on heap.");
      for (let s of e) this.j._addFloatVectorEntry(i, s);
      this.j._addFloatVectorToInputStream(i, n, r);
    });
  }
  addIntVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateIntVector(e.length);
      if (!i) throw Error("Unable to allocate new int vector on heap.");
      for (let s of e) this.j._addIntVectorEntry(i, s);
      this.j._addIntVectorToInputStream(i, n, r);
    });
  }
  addUintVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateUintVector(e.length);
      if (!i) throw Error("Unable to allocate new unsigned int vector on heap.");
      for (let s of e) this.j._addUintVectorEntry(i, s);
      this.j._addUintVectorToInputStream(i, n, r);
    });
  }
  addStringVectorToStream(e, t, r) {
    v(this, t, (n) => {
      var i = this.j._allocateStringVector(e.length);
      if (!i) throw Error("Unable to allocate new string vector on heap.");
      for (let s of e) v(this, s, (a) => {
        this.j._addStringVectorEntry(i, a);
      });
      this.j._addStringVectorToInputStream(i, n, r);
    });
  }
  addBoolToInputSidePacket(e, t) {
    v(this, t, (r) => {
      this.j._addBoolToInputSidePacket(e, r);
    });
  }
  addDoubleToInputSidePacket(e, t) {
    v(this, t, (r) => {
      this.j._addDoubleToInputSidePacket(e, r);
    });
  }
  addFloatToInputSidePacket(e, t) {
    v(this, t, (r) => {
      this.j._addFloatToInputSidePacket(e, r);
    });
  }
  addIntToInputSidePacket(e, t) {
    v(this, t, (r) => {
      this.j._addIntToInputSidePacket(e, r);
    });
  }
  addUintToInputSidePacket(e, t) {
    v(this, t, (r) => {
      this.j._addUintToInputSidePacket(e, r);
    });
  }
  addStringToInputSidePacket(e, t) {
    v(this, t, (r) => {
      v(this, e, (n) => {
        this.j._addStringToInputSidePacket(n, r);
      });
    });
  }
  addProtoToInputSidePacket(e, t, r) {
    v(this, r, (n) => {
      v(this, t, (i) => {
        var s = this.j._malloc(e.length);
        this.j.HEAPU8.set(e, s), this.j._addProtoToInputSidePacket(s, e.length, i, n), this.j._free(s);
      });
    });
  }
  addBoolVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateBoolVector(e.length);
      if (!n) throw Error("Unable to allocate new bool vector on heap.");
      for (let i of e) this.j._addBoolVectorEntry(n, i);
      this.j._addBoolVectorToInputSidePacket(n, r);
    });
  }
  addDoubleVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateDoubleVector(e.length);
      if (!n) throw Error("Unable to allocate new double vector on heap.");
      for (let i of e) this.j._addDoubleVectorEntry(n, i);
      this.j._addDoubleVectorToInputSidePacket(n, r);
    });
  }
  addFloatVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateFloatVector(e.length);
      if (!n) throw Error("Unable to allocate new float vector on heap.");
      for (let i of e) this.j._addFloatVectorEntry(n, i);
      this.j._addFloatVectorToInputSidePacket(n, r);
    });
  }
  addIntVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateIntVector(e.length);
      if (!n) throw Error("Unable to allocate new int vector on heap.");
      for (let i of e) this.j._addIntVectorEntry(n, i);
      this.j._addIntVectorToInputSidePacket(n, r);
    });
  }
  addUintVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateUintVector(e.length);
      if (!n) throw Error("Unable to allocate new unsigned int vector on heap.");
      for (let i of e) this.j._addUintVectorEntry(n, i);
      this.j._addUintVectorToInputSidePacket(n, r);
    });
  }
  addStringVectorToInputSidePacket(e, t) {
    v(this, t, (r) => {
      var n = this.j._allocateStringVector(e.length);
      if (!n) throw Error("Unable to allocate new string vector on heap.");
      for (let i of e) v(this, i, (s) => {
        this.j._addStringVectorEntry(n, s);
      });
      this.j._addStringVectorToInputSidePacket(n, r);
    });
  }
  attachBoolListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachBoolListener(r);
    });
  }
  attachBoolVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachBoolVectorListener(r);
    });
  }
  attachIntListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachIntListener(r);
    });
  }
  attachIntVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachIntVectorListener(r);
    });
  }
  attachUintListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachUintListener(r);
    });
  }
  attachUintVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachUintVectorListener(r);
    });
  }
  attachDoubleListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachDoubleListener(r);
    });
  }
  attachDoubleVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachDoubleVectorListener(r);
    });
  }
  attachFloatListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachFloatListener(r);
    });
  }
  attachFloatVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachFloatVectorListener(r);
    });
  }
  attachStringListener(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.j._attachStringListener(r);
    });
  }
  attachStringVectorListener(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.j._attachStringVectorListener(r);
    });
  }
  attachProtoListener(e, t, r) {
    Ie(this, e, t), v(this, e, (n) => {
      this.j._attachProtoListener(n, r || !1);
    });
  }
  attachProtoVectorListener(e, t, r) {
    Ze(this, e, t), v(this, e, (n) => {
      this.j._attachProtoVectorListener(n, r || !1);
    });
  }
  attachAudioListener(e, t, r) {
    this.j._attachAudioListener || console.warn('Attempting to use attachAudioListener without support for output audio. Is build dep ":gl_graph_runner_audio_out" missing?'), Ie(this, e, (n, i) => {
      n = new Float32Array(n.buffer, n.byteOffset, n.length / 4), t(n, i);
    }), v(this, e, (n) => {
      this.j._attachAudioListener(n, r || !1);
    });
  }
  finishProcessing() {
    this.j._waitUntilIdle();
  }
  closeGraph() {
    this.j._closeGraph(), this.j.simpleListeners = void 0, this.j.emptyPacketListeners = void 0;
  }
};
function y2(e) {
  return class extends e {
    get qa() {
      return this.j;
    }
    Ta() {
      if (typeof this.qa._mediapipeLoggerGetEncodedApiKey == "function") {
        let t = this.qa._mediapipeLoggerGetEncodedApiKey();
        return this.qa._decodeBase64(t);
      }
    }
  };
}
function A2(e) {
  return class extends e {
    ab() {
      this.j._registerModelResourcesGraphService();
    }
  };
}
var Bh = y2(A2(v2)), jh = class extends Bh {
};
async function Uh(e, t, r, n) {
  return e = await (async (i, s, a, o, h) => {
    if (s && await zs(s), !self.ModuleFactory || a && (await zs(a), !self.ModuleFactory)) throw Error("ModuleFactory not set.");
    return self.Module && h && ((s = self.Module).locateFile = h.locateFile, h.mainScriptUrlOrBlob && (s.mainScriptUrlOrBlob = h.mainScriptUrlOrBlob)), h = await self.ModuleFactory(self.Module || h), self.ModuleFactory = self.Module = void 0, new i(h, o);
  })(e, r.wasmLoaderPath, r.assetLoaderPath, t, { locateFile: (i) => i.endsWith(".wasm") ? r.wasmBinaryPath.toString() : r.assetBinaryPath && i.endsWith(".data") ? r.assetBinaryPath.toString() : i }), (function(i, s) {
    s = s.runningMode ?? "";
    var a = i.h.Ta();
    i.o = new Dh(i.D(), s, a);
  })(e, n), await e.A(n), e;
}
async function Ir(e, t, r, n) {
  return Uh(e, t, r, n);
}
function bn(e, t, r) {
  try {
    e.h.j.FS_unlink(`/${r}`);
  } catch {
  }
  e.h.j.FS_createDataFile("/", r, t, !0, !1, !1), Wn(e, `/${r}`);
}
function Wn(e, t) {
  var r = M(e.baseOptions, Vr, 1) || new Vr();
  typeof t == "string" ? (k(r, 2, Ve(t)), k(r, 1)) : t instanceof Uint8Array && (k(r, 1, zr(t, !1)), k(r, 2)), y(e.baseOptions, 0, 1, r);
}
function Xs(e) {
  try {
    let t = e.L.length;
    if (t === 1) throw Error(e.L[0].message);
    if (t > 1) throw Error("Encountered multiple errors: " + e.L.map((r) => r.message).join(", "));
  } finally {
    e.L = [];
  }
}
function m(e, t) {
  e.J = Math.max(e.J, t);
}
function dn(e, t) {
  e.F = new ue(), pe(e.F, 2, "PassThroughCalculator"), j(e.F, "free_memory"), F(e.F, "free_memory_unused_out"), G(t, "free_memory"), be(t, e.F);
}
function Bt(e, t) {
  j(e.F, t), F(e.F, t + "_unused_out");
}
function pn(e) {
  e.h.addBoolToStream(!0, "free_memory", e.J);
}
var Kr = class {
  constructor(e) {
    this.h = e, this.L = [], this.J = 0, this.h.setAutoRenderToScreen(!1);
  }
  l(e, t = !0, r = !1, n = !1) {
    var i, s, a, o, h, f;
    if (t) {
      let u = e.baseOptions || {};
      if ((i = e.baseOptions) != null && i.modelAssetBuffer && ((s = e.baseOptions) != null && s.modelAssetPath)) throw Error("Cannot set both baseOptions.modelAssetPath and baseOptions.modelAssetBuffer");
      if (!((a = M(this.baseOptions, Vr, 1)) != null && a.h() || (o = M(this.baseOptions, Vr, 1)) != null && o.l() || (h = e.baseOptions) != null && h.modelAssetBuffer || (f = e.baseOptions) != null && f.modelAssetPath)) throw Error("Either baseOptions.modelAssetPath or baseOptions.modelAssetBuffer must be set");
      (function(p, A, E = !1) {
        var R = M(p.baseOptions, Gr, 3);
        if (!R) {
          var U = R = new Gr(), Be = new Ls();
          ke(U, 4, He, Be);
        }
        "delegate" in A && (A.delegate === "GPU" ? (A = R, U = new xo(), ke(A, 2, He, U)) : (A = R, U = new Ls(), ke(A, 4, He, U))), E && (E = R.l(), A = R.h() || (E == null ? void 0 : E.h()) === !0, E = new Po(), A ? y(E, 0, 9, A = new W1()) : y(E, 0, 8, A = new K1()), ke(R, 6, He, E)), y(p.baseOptions, 0, 3, R);
      })(this, u, n);
      let l = r ? "model.litertlm" : "model.dat";
      if (u.modelAssetPath) return fetch(u.modelAssetPath.toString()).then((p) => {
        if (p.ok) return p.arrayBuffer();
        throw Error(`Failed to fetch model: ${u.modelAssetPath} (${p.status})`);
      }).then((p) => {
        bn(this, new Uint8Array(p), l), this.u(), this.M();
      });
      if (u.modelAssetBuffer instanceof Uint8Array) r ? bn(this, u.modelAssetBuffer, l) : Wn(this, u.modelAssetBuffer);
      else if (u.modelAssetBuffer) return (async function(p) {
        for (var A = [], E = 0; ; ) {
          let { done: R, value: U } = await p.read();
          if (R) break;
          A.push(U), E += U.length;
        }
        if (A.length === 0) return new Uint8Array(0);
        if (A.length === 1) return A[0];
        p = new Uint8Array(E), E = 0;
        for (let R of A) p.set(R, E), E += R.length;
        return p;
      })(u.modelAssetBuffer).then((p) => {
        r ? bn(this, p, l) : Wn(this, p), this.u(), this.M();
      });
    }
    return this.u(), this.M(), Promise.resolve();
  }
  M() {
  }
  ka() {
    var e;
    if (this.h.ka((t) => {
      e = Y1(t);
    }), !e) throw Error("Failed to retrieve CalculatorGraphConfig");
    return e;
  }
  setGraph(e, t) {
    var r;
    this.h.attachErrorListener((n, i) => {
      this.L.push(Error(i));
    }), this.h.ab(), this.h.setGraph(e, t), (r = this.o) == null || r.za(), this.F = void 0, Xs(this);
  }
  finishProcessing(e) {
    this.h.finishProcessing(), Xs(this), this.o && e !== void 0 && this.o.Aa(e);
  }
  close() {
    var e, t;
    this.F = void 0, (e = this.o) == null || e.ya(), (t = this.o) == null || t.close(), this.h.closeGraph();
  }
};
function rt(e, t) {
  if (!e) throw Error(`Unable to obtain required WebGL resource: ${t}`);
  return e;
}
Kr.prototype.close = Kr.prototype.close;
class Gh {
  constructor(t, r, n, i) {
    this.h = t, this.i = r, this.o = n, this.l = i;
  }
  bind() {
    this.h.bindVertexArray(this.i);
  }
  close() {
    this.h.deleteVertexArray(this.i), this.h.deleteBuffer(this.o), this.h.deleteBuffer(this.l);
  }
}
function qs(e, t, r) {
  var n = e.h;
  if (r = rt(n.createShader(r), "Failed to create WebGL shader"), n.shaderSource(r, t), n.compileShader(r), !n.getShaderParameter(r, n.COMPILE_STATUS)) throw Error(`Could not compile WebGL shader: ${n.getShaderInfoLog(r)}`);
  return n.attachShader(e.i, r), r;
}
function Js(e, t) {
  var r = e.h, n = rt(r.createVertexArray(), "Failed to create vertex array");
  r.bindVertexArray(n);
  var i = rt(r.createBuffer(), "Failed to create buffer");
  r.bindBuffer(r.ARRAY_BUFFER, i), r.enableVertexAttribArray(e.G), r.vertexAttribPointer(e.G, 2, r.FLOAT, !1, 0, 0), r.bufferData(r.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), r.STATIC_DRAW);
  var s = rt(r.createBuffer(), "Failed to create buffer");
  return r.bindBuffer(r.ARRAY_BUFFER, s), r.enableVertexAttribArray(e.L), r.vertexAttribPointer(e.L, 2, r.FLOAT, !1, 0, 0), r.bufferData(r.ARRAY_BUFFER, new Float32Array(t ? [0, 1, 0, 0, 1, 0, 1, 1] : [0, 0, 0, 1, 1, 1, 1, 0]), r.STATIC_DRAW), r.bindBuffer(r.ARRAY_BUFFER, null), r.bindVertexArray(null), new Gh(r, n, i, s);
}
function ji(e, t) {
  if (e.h) {
    if (t !== e.h) throw Error("Cannot change GL context once initialized");
  } else e.h = t;
}
function Vh(e, t, r, n) {
  return ji(e, t), e.i || (e.o(), e.J()), r ? (e.m || (e.m = Js(e, !0)), r = e.m) : (e.F || (e.F = Js(e, !1)), r = e.F), t.useProgram(e.i), r.bind(), e.l(), e = n(), r.h.bindVertexArray(null), e;
}
function w2(e, t, r) {
  return ji(e, t), e = rt(t.createTexture(), "Failed to create texture"), t.bindTexture(t.TEXTURE_2D, e), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_S, t.CLAMP_TO_EDGE), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_T, t.CLAMP_TO_EDGE), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MIN_FILTER, r ?? t.LINEAR), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MAG_FILTER, r ?? t.LINEAR), t.bindTexture(t.TEXTURE_2D, null), e;
}
function E2(e, t, r) {
  ji(e, t), e.D || (e.D = rt(t.createFramebuffer(), "Failed to create framebuffe.")), t.bindFramebuffer(t.FRAMEBUFFER, e.D), t.framebufferTexture2D(t.FRAMEBUFFER, t.COLOR_ATTACHMENT0, t.TEXTURE_2D, r, 0);
}
function Hh(e) {
  var t;
  (t = e.h) == null || t.bindFramebuffer(e.h.FRAMEBUFFER, null);
}
var Ui = class {
  C() {
    return `
  precision mediump float;
  varying vec2 vTex;
  uniform sampler2D inputTexture;
  void main() {
    gl_FragColor = texture2D(inputTexture, vTex);
  }
 `;
  }
  o() {
    var e = this.h;
    if (this.i = rt(e.createProgram(), "Failed to create WebGL program"), this.ea = qs(this, `
  attribute vec2 aVertex;
  attribute vec2 aTex;
  varying vec2 vTex;
  void main(void) {
    gl_Position = vec4(aVertex, 0.0, 1.0);
    vTex = aTex;
  }`, e.VERTEX_SHADER), this.aa = qs(this, this.C(), e.FRAGMENT_SHADER), e.linkProgram(this.i), !e.getProgramParameter(this.i, e.LINK_STATUS)) throw Error(`Error during program linking: ${e.getProgramInfoLog(this.i)}`);
    this.G = e.getAttribLocation(this.i, "aVertex"), this.L = e.getAttribLocation(this.i, "aTex");
  }
  J() {
  }
  l() {
  }
  close() {
    if (this.i) {
      let e = this.h;
      e.deleteProgram(this.i), e.deleteShader(this.ea), e.deleteShader(this.aa);
    }
    this.D && this.h.deleteFramebuffer(this.D), this.F && this.F.close(), this.m && this.m.close();
  }
};
function Ge(e, t) {
  switch (t) {
    case 0:
      return e.h.find((r) => r instanceof Uint8Array);
    case 1:
      return e.h.find((r) => r instanceof Float32Array);
    case 2:
      return e.h.find((r) => typeof WebGLTexture < "u" && r instanceof WebGLTexture);
    default:
      throw Error(`Type is not supported: ${t}`);
  }
}
function zn(e) {
  var t = Ge(e, 1);
  if (!t) {
    if (t = Ge(e, 0)) t = new Float32Array(t).map((n) => n / 255);
    else {
      t = new Float32Array(e.width * e.height);
      let n = jt(e);
      var r = Gi(e);
      if (E2(r, n, b2(e)), "iPad Simulator;iPhone Simulator;iPod Simulator;iPad;iPhone;iPod".split(";").includes(navigator.platform) || navigator.userAgent.includes("Mac") && "document" in self && "ontouchend" in self.document) {
        r = new Float32Array(e.width * e.height * 4), n.readPixels(0, 0, e.width, e.height, n.RGBA, n.FLOAT, r);
        for (let i = 0, s = 0; i < t.length; ++i, s += 4) t[i] = r[s];
      } else n.readPixels(0, 0, e.width, e.height, n.RED, n.FLOAT, t);
    }
    e.h.push(t);
  }
  return t;
}
function b2(e) {
  var t = Ge(e, 2);
  if (!t) {
    let r = jt(e);
    t = S2(e);
    let n = zn(e), i = k2(e);
    r.texImage2D(r.TEXTURE_2D, 0, i, e.width, e.height, 0, r.RED, r.FLOAT, n), Yn(e);
  }
  return t;
}
function jt(e) {
  if (!e.canvas) throw Error("Conversion to different image formats require that a canvas is passed when initializing the image.");
  return e.i || (e.i = rt(e.canvas.getContext("webgl2"), "You cannot use a canvas that is already bound to a different type of rendering context.")), e.i;
}
function k2(e) {
  if (e = jt(e), !Er) if (e.getExtension("EXT_color_buffer_float") && e.getExtension("OES_texture_float_linear") && e.getExtension("EXT_float_blend")) Er = e.R32F;
  else {
    if (!e.getExtension("EXT_color_buffer_half_float")) throw Error("GPU does not fully support 4-channel float32 or float16 formats");
    Er = e.R16F;
  }
  return Er;
}
function Gi(e) {
  return e.l || (e.l = new Ui()), e.l;
}
function S2(e) {
  var t = jt(e);
  t.viewport(0, 0, e.width, e.height), t.activeTexture(t.TEXTURE0);
  var r = Ge(e, 2);
  return r || (r = w2(Gi(e), t, e.o ? t.LINEAR : t.NEAREST), e.h.push(r), e.u = !0), t.bindTexture(t.TEXTURE_2D, r), r;
}
function Yn(e) {
  e.i.bindTexture(e.i.TEXTURE_2D, null);
}
var Er, q = class {
  constructor(e, t, r, n, i, s, a) {
    this.h = e, this.o = t, this.u = r, this.canvas = n, this.l = i, this.width = s, this.height = a, this.u && --Zs === 0 && console.error("You seem to be creating MPMask instances without invoking .close(). This leaks resources.");
  }
  Va() {
    return !!Ge(this, 0);
  }
  va() {
    return !!Ge(this, 1);
  }
  X() {
    return !!Ge(this, 2);
  }
  ua() {
    return (t = Ge(e = this, 0)) || (t = zn(e), t = new Uint8Array(t.map((r) => Math.round(255 * r))), e.h.push(t)), t;
    var e, t;
  }
  ta() {
    return zn(this);
  }
  T() {
    return b2(this);
  }
  clone() {
    var e = [];
    for (let t of this.h) {
      let r;
      if (t instanceof Uint8Array) r = new Uint8Array(t);
      else if (t instanceof Float32Array) r = new Float32Array(t);
      else {
        if (!(t instanceof WebGLTexture)) throw Error(`Type is not supported: ${t}`);
        {
          let n = jt(this), i = Gi(this);
          n.activeTexture(n.TEXTURE1), r = w2(i, n, this.o ? n.LINEAR : n.NEAREST), n.bindTexture(n.TEXTURE_2D, r);
          let s = k2(this);
          n.texImage2D(n.TEXTURE_2D, 0, s, this.width, this.height, 0, n.RED, n.FLOAT, null), n.bindTexture(n.TEXTURE_2D, null), E2(i, n, r), Vh(i, n, !1, () => {
            S2(this), n.clearColor(0, 0, 0, 0), n.clear(n.COLOR_BUFFER_BIT), n.drawArrays(n.TRIANGLE_FAN, 0, 4), Yn(this);
          }), Hh(i), Yn(this);
        }
      }
      e.push(r);
    }
    return new q(e, this.o, this.X(), this.canvas, this.l, this.width, this.height);
  }
  close() {
    this.u && jt(this).deleteTexture(Ge(this, 2)), Zs = -1;
  }
};
q.prototype.close = q.prototype.close, q.prototype.clone = q.prototype.clone, q.prototype.getAsWebGLTexture = q.prototype.T, q.prototype.getAsFloat32Array = q.prototype.ta, q.prototype.getAsUint8Array = q.prototype.ua, q.prototype.hasWebGLTexture = q.prototype.X, q.prototype.hasFloat32Array = q.prototype.va, q.prototype.hasUint8Array = q.prototype.Va;
var Zs = 250;
function Se(...e) {
  return e.map(([t, r]) => ({ start: t, end: r }));
}
var Qs, Kh = A2((Qs = y2(v2), class extends Qs {
  get pa() {
    return this.j;
  }
  Ea(e, t, r) {
    v(this, t, (n) => {
      var [i, s] = _2(this, e, n);
      this.pa._addBoundTextureAsImageToStream(n, i, s, r);
    });
  }
  ha(e, t) {
    Ie(this, e, t), v(this, e, (r) => {
      this.pa._attachImageListener(r);
    });
  }
  ia(e, t) {
    Ze(this, e, t), v(this, e, (r) => {
      this.pa._attachImageVectorListener(r);
    });
  }
})), Le = class extends Kh {
};
async function N(e, t, r) {
  return Ir(e, r.canvas ?? (Di() ? void 0 : document.createElement("canvas")), t, r);
}
function L2(e, t, r, n) {
  var a;
  if (e.o && n !== void 0) {
    var i = M(e.baseOptions, Gr, 3);
    i != null && i.h() || (a = i == null ? void 0 : i.l()) != null && a.h() ? (++(i = e.o).h.U, i.i.set(n, performance.now())) : (++(i = e.o).h.R, i.i.set(n, performance.now()));
  }
  if (e.ra) {
    if (i = new Ko(), r == null ? void 0 : r.regionOfInterest) {
      if (!e.Da) throw Error("This task doesn't support region-of-interest.");
      var s = r.regionOfInterest;
      if (s.left >= s.right || s.top >= s.bottom) throw Error("Expected RectF with left < right and top < bottom.");
      if (s.left < 0 || s.top < 0 || s.right > 1 || s.bottom > 1) throw Error("Expected RectF values to be in [0,1].");
      w(i, 1, (s.left + s.right) / 2), w(i, 2, (s.top + s.bottom) / 2), w(i, 4, s.right - s.left), w(i, 3, s.bottom - s.top);
    } else w(i, 1, 0.5), w(i, 2, 0.5), w(i, 4, 1), w(i, 3, 1);
    if (r != null && r.rotationDegrees) {
      if ((r == null ? void 0 : r.rotationDegrees) % 90 != 0) throw Error("Expected rotation to be a multiple of 90°.");
      if (w(i, 5, -Math.PI * r.rotationDegrees / 180), (r == null ? void 0 : r.rotationDegrees) % 180 != 0) {
        let [o, h] = Bi(t);
        r = te(i, 3) * h / o, s = te(i, 4) * o / h, w(i, 4, r), w(i, 3, s);
      }
    }
    e.h.addProtoToStream(i.h(), "mediapipe.NormalizedRect", e.ra, n);
  }
  e.h.Ea(t, e.Ca, n ?? performance.now()), e.finishProcessing(n);
}
function Te(e, t, r) {
  if (e.K) throw Error("Task is not initialized with image mode. 'runningMode' must be set to 'IMAGE'.");
  L2(e, t, r, e.J + 1);
}
function De(e, t, r, n) {
  if (!e.K) throw Error("Task is not initialized with video mode. 'runningMode' must be set to 'VIDEO'.");
  L2(e, t, r, n);
}
function Ut(e, t, r, n) {
  var i = t.data, s = t.width, a = s * (t = t.height);
  if ((i instanceof Uint8Array || i instanceof Float32Array) && i.length !== a) throw Error("Unsupported channel count: " + i.length / a);
  return e = new q([i], r, !1, e.h.j.canvas, e.ea, s, t), n ? e.clone() : e;
}
var me = class extends Kr {
  constructor(e, t, r, n) {
    super(e), this.h = e, this.Ca = t, this.ra = r, this.Da = n, this.ea = new Ui(), this.K = !1;
  }
  l(e, t = !0, r = !1, n = !1) {
    if ("runningMode" in e) {
      var i = this.K = !!e.runningMode && e.runningMode !== "IMAGE";
      k(this.baseOptions, 2, i == null ? i : Nr(i));
    }
    if (e.canvas !== void 0 && this.h.j.canvas !== e.canvas) throw Error("You must create a new task to reset the canvas.");
    return super.l(e, t, r, n);
  }
  close() {
    this.ea.close(), super.close();
  }
};
me.prototype.close = me.prototype.close;
var ve = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect_in", !1), this.m = { detections: [] }, y(e = this.i = new fn(), 0, 1, t = new V()), w(this.i, 2, 0.5), w(this.i, 3, 0.3);
  }
  D() {
    return "FaceDetector";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return "minDetectionConfidence" in e && w(this.i, 2, e.minDetectionConfidence ?? 0.5), "minSuppressionThreshold" in e && w(this.i, 3, e.minSuppressionThreshold ?? 0.3), this.l(e);
  }
  H(e, t) {
    return this.m = { detections: [] }, Te(this, e, t), this.m;
  }
  I(e, t, r) {
    return this.m = { detections: [] }, De(this, e, r, t), this.m;
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect_in"), C(e, "detections");
    var t = new ge();
    Pe(t, ch, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.face_detector.FaceDetectorGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect_in"), F(r, "DETECTIONS:detections"), r.A(t), be(e, r), this.h.attachProtoVectorListener("detections", (n, i) => {
      for (let s of n) n = Ho(s), this.m.detections.push(d2(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("detections", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
ve.prototype.detectForVideo = ve.prototype.I, ve.prototype.detect = ve.prototype.H, ve.prototype.setOptions = ve.prototype.A, ve.createFromModelPath = async function(e, t) {
  return N(ve, e, { baseOptions: { modelAssetPath: t } });
}, ve.createFromModelBuffer = function(e, t) {
  return N(ve, e, { baseOptions: { modelAssetBuffer: t } });
}, ve.createFromOptions = function(e, t) {
  return N(ve, e, t);
};
var Vi = Se([61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405], [405, 321], [321, 375], [375, 291], [61, 185], [185, 40], [40, 39], [39, 37], [37, 0], [0, 267], [267, 269], [269, 270], [270, 409], [409, 291], [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317], [317, 402], [402, 318], [318, 324], [324, 308], [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415], [415, 308]), Hi = Se([263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381], [381, 382], [382, 362], [263, 466], [466, 388], [388, 387], [387, 386], [386, 385], [385, 384], [384, 398], [398, 362]), Ki = Se([276, 283], [283, 282], [282, 295], [295, 285], [300, 293], [293, 334], [334, 296], [296, 336]), T2 = Se([474, 475], [475, 476], [476, 477], [477, 474]), Wi = Se([33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133], [33, 246], [246, 161], [161, 160], [160, 159], [159, 158], [158, 157], [157, 173], [173, 133]), zi = Se([46, 53], [53, 52], [52, 65], [65, 55], [70, 63], [63, 105], [105, 66], [66, 107]), F2 = Se([469, 470], [470, 471], [471, 472], [472, 469]), Yi = Se([10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10]), I2 = [...Vi, ...Hi, ...Ki, ...Wi, ...zi, ...Yi], N2 = Se([127, 34], [34, 139], [139, 127], [11, 0], [0, 37], [37, 11], [232, 231], [231, 120], [120, 232], [72, 37], [37, 39], [39, 72], [128, 121], [121, 47], [47, 128], [232, 121], [121, 128], [128, 232], [104, 69], [69, 67], [67, 104], [175, 171], [171, 148], [148, 175], [118, 50], [50, 101], [101, 118], [73, 39], [39, 40], [40, 73], [9, 151], [151, 108], [108, 9], [48, 115], [115, 131], [131, 48], [194, 204], [204, 211], [211, 194], [74, 40], [40, 185], [185, 74], [80, 42], [42, 183], [183, 80], [40, 92], [92, 186], [186, 40], [230, 229], [229, 118], [118, 230], [202, 212], [212, 214], [214, 202], [83, 18], [18, 17], [17, 83], [76, 61], [61, 146], [146, 76], [160, 29], [29, 30], [30, 160], [56, 157], [157, 173], [173, 56], [106, 204], [204, 194], [194, 106], [135, 214], [214, 192], [192, 135], [203, 165], [165, 98], [98, 203], [21, 71], [71, 68], [68, 21], [51, 45], [45, 4], [4, 51], [144, 24], [24, 23], [23, 144], [77, 146], [146, 91], [91, 77], [205, 50], [50, 187], [187, 205], [201, 200], [200, 18], [18, 201], [91, 106], [106, 182], [182, 91], [90, 91], [91, 181], [181, 90], [85, 84], [84, 17], [17, 85], [206, 203], [203, 36], [36, 206], [148, 171], [171, 140], [140, 148], [92, 40], [40, 39], [39, 92], [193, 189], [189, 244], [244, 193], [159, 158], [158, 28], [28, 159], [247, 246], [246, 161], [161, 247], [236, 3], [3, 196], [196, 236], [54, 68], [68, 104], [104, 54], [193, 168], [168, 8], [8, 193], [117, 228], [228, 31], [31, 117], [189, 193], [193, 55], [55, 189], [98, 97], [97, 99], [99, 98], [126, 47], [47, 100], [100, 126], [166, 79], [79, 218], [218, 166], [155, 154], [154, 26], [26, 155], [209, 49], [49, 131], [131, 209], [135, 136], [136, 150], [150, 135], [47, 126], [126, 217], [217, 47], [223, 52], [52, 53], [53, 223], [45, 51], [51, 134], [134, 45], [211, 170], [170, 140], [140, 211], [67, 69], [69, 108], [108, 67], [43, 106], [106, 91], [91, 43], [230, 119], [119, 120], [120, 230], [226, 130], [130, 247], [247, 226], [63, 53], [53, 52], [52, 63], [238, 20], [20, 242], [242, 238], [46, 70], [70, 156], [156, 46], [78, 62], [62, 96], [96, 78], [46, 53], [53, 63], [63, 46], [143, 34], [34, 227], [227, 143], [123, 117], [117, 111], [111, 123], [44, 125], [125, 19], [19, 44], [236, 134], [134, 51], [51, 236], [216, 206], [206, 205], [205, 216], [154, 153], [153, 22], [22, 154], [39, 37], [37, 167], [167, 39], [200, 201], [201, 208], [208, 200], [36, 142], [142, 100], [100, 36], [57, 212], [212, 202], [202, 57], [20, 60], [60, 99], [99, 20], [28, 158], [158, 157], [157, 28], [35, 226], [226, 113], [113, 35], [160, 159], [159, 27], [27, 160], [204, 202], [202, 210], [210, 204], [113, 225], [225, 46], [46, 113], [43, 202], [202, 204], [204, 43], [62, 76], [76, 77], [77, 62], [137, 123], [123, 116], [116, 137], [41, 38], [38, 72], [72, 41], [203, 129], [129, 142], [142, 203], [64, 98], [98, 240], [240, 64], [49, 102], [102, 64], [64, 49], [41, 73], [73, 74], [74, 41], [212, 216], [216, 207], [207, 212], [42, 74], [74, 184], [184, 42], [169, 170], [170, 211], [211, 169], [170, 149], [149, 176], [176, 170], [105, 66], [66, 69], [69, 105], [122, 6], [6, 168], [168, 122], [123, 147], [147, 187], [187, 123], [96, 77], [77, 90], [90, 96], [65, 55], [55, 107], [107, 65], [89, 90], [90, 180], [180, 89], [101, 100], [100, 120], [120, 101], [63, 105], [105, 104], [104, 63], [93, 137], [137, 227], [227, 93], [15, 86], [86, 85], [85, 15], [129, 102], [102, 49], [49, 129], [14, 87], [87, 86], [86, 14], [55, 8], [8, 9], [9, 55], [100, 47], [47, 121], [121, 100], [145, 23], [23, 22], [22, 145], [88, 89], [89, 179], [179, 88], [6, 122], [122, 196], [196, 6], [88, 95], [95, 96], [96, 88], [138, 172], [172, 136], [136, 138], [215, 58], [58, 172], [172, 215], [115, 48], [48, 219], [219, 115], [42, 80], [80, 81], [81, 42], [195, 3], [3, 51], [51, 195], [43, 146], [146, 61], [61, 43], [171, 175], [175, 199], [199, 171], [81, 82], [82, 38], [38, 81], [53, 46], [46, 225], [225, 53], [144, 163], [163, 110], [110, 144], [52, 65], [65, 66], [66, 52], [229, 228], [228, 117], [117, 229], [34, 127], [127, 234], [234, 34], [107, 108], [108, 69], [69, 107], [109, 108], [108, 151], [151, 109], [48, 64], [64, 235], [235, 48], [62, 78], [78, 191], [191, 62], [129, 209], [209, 126], [126, 129], [111, 35], [35, 143], [143, 111], [117, 123], [123, 50], [50, 117], [222, 65], [65, 52], [52, 222], [19, 125], [125, 141], [141, 19], [221, 55], [55, 65], [65, 221], [3, 195], [195, 197], [197, 3], [25, 7], [7, 33], [33, 25], [220, 237], [237, 44], [44, 220], [70, 71], [71, 139], [139, 70], [122, 193], [193, 245], [245, 122], [247, 130], [130, 33], [33, 247], [71, 21], [21, 162], [162, 71], [170, 169], [169, 150], [150, 170], [188, 174], [174, 196], [196, 188], [216, 186], [186, 92], [92, 216], [2, 97], [97, 167], [167, 2], [141, 125], [125, 241], [241, 141], [164, 167], [167, 37], [37, 164], [72, 38], [38, 12], [12, 72], [38, 82], [82, 13], [13, 38], [63, 68], [68, 71], [71, 63], [226, 35], [35, 111], [111, 226], [101, 50], [50, 205], [205, 101], [206, 92], [92, 165], [165, 206], [209, 198], [198, 217], [217, 209], [165, 167], [167, 97], [97, 165], [220, 115], [115, 218], [218, 220], [133, 112], [112, 243], [243, 133], [239, 238], [238, 241], [241, 239], [214, 135], [135, 169], [169, 214], [190, 173], [173, 133], [133, 190], [171, 208], [208, 32], [32, 171], [125, 44], [44, 237], [237, 125], [86, 87], [87, 178], [178, 86], [85, 86], [86, 179], [179, 85], [84, 85], [85, 180], [180, 84], [83, 84], [84, 181], [181, 83], [201, 83], [83, 182], [182, 201], [137, 93], [93, 132], [132, 137], [76, 62], [62, 183], [183, 76], [61, 76], [76, 184], [184, 61], [57, 61], [61, 185], [185, 57], [212, 57], [57, 186], [186, 212], [214, 207], [207, 187], [187, 214], [34, 143], [143, 156], [156, 34], [79, 239], [239, 237], [237, 79], [123, 137], [137, 177], [177, 123], [44, 1], [1, 4], [4, 44], [201, 194], [194, 32], [32, 201], [64, 102], [102, 129], [129, 64], [213, 215], [215, 138], [138, 213], [59, 166], [166, 219], [219, 59], [242, 99], [99, 97], [97, 242], [2, 94], [94, 141], [141, 2], [75, 59], [59, 235], [235, 75], [24, 110], [110, 228], [228, 24], [25, 130], [130, 226], [226, 25], [23, 24], [24, 229], [229, 23], [22, 23], [23, 230], [230, 22], [26, 22], [22, 231], [231, 26], [112, 26], [26, 232], [232, 112], [189, 190], [190, 243], [243, 189], [221, 56], [56, 190], [190, 221], [28, 56], [56, 221], [221, 28], [27, 28], [28, 222], [222, 27], [29, 27], [27, 223], [223, 29], [30, 29], [29, 224], [224, 30], [247, 30], [30, 225], [225, 247], [238, 79], [79, 20], [20, 238], [166, 59], [59, 75], [75, 166], [60, 75], [75, 240], [240, 60], [147, 177], [177, 215], [215, 147], [20, 79], [79, 166], [166, 20], [187, 147], [147, 213], [213, 187], [112, 233], [233, 244], [244, 112], [233, 128], [128, 245], [245, 233], [128, 114], [114, 188], [188, 128], [114, 217], [217, 174], [174, 114], [131, 115], [115, 220], [220, 131], [217, 198], [198, 236], [236, 217], [198, 131], [131, 134], [134, 198], [177, 132], [132, 58], [58, 177], [143, 35], [35, 124], [124, 143], [110, 163], [163, 7], [7, 110], [228, 110], [110, 25], [25, 228], [356, 389], [389, 368], [368, 356], [11, 302], [302, 267], [267, 11], [452, 350], [350, 349], [349, 452], [302, 303], [303, 269], [269, 302], [357, 343], [343, 277], [277, 357], [452, 453], [453, 357], [357, 452], [333, 332], [332, 297], [297, 333], [175, 152], [152, 377], [377, 175], [347, 348], [348, 330], [330, 347], [303, 304], [304, 270], [270, 303], [9, 336], [336, 337], [337, 9], [278, 279], [279, 360], [360, 278], [418, 262], [262, 431], [431, 418], [304, 408], [408, 409], [409, 304], [310, 415], [415, 407], [407, 310], [270, 409], [409, 410], [410, 270], [450, 348], [348, 347], [347, 450], [422, 430], [430, 434], [434, 422], [313, 314], [314, 17], [17, 313], [306, 307], [307, 375], [375, 306], [387, 388], [388, 260], [260, 387], [286, 414], [414, 398], [398, 286], [335, 406], [406, 418], [418, 335], [364, 367], [367, 416], [416, 364], [423, 358], [358, 327], [327, 423], [251, 284], [284, 298], [298, 251], [281, 5], [5, 4], [4, 281], [373, 374], [374, 253], [253, 373], [307, 320], [320, 321], [321, 307], [425, 427], [427, 411], [411, 425], [421, 313], [313, 18], [18, 421], [321, 405], [405, 406], [406, 321], [320, 404], [404, 405], [405, 320], [315, 16], [16, 17], [17, 315], [426, 425], [425, 266], [266, 426], [377, 400], [400, 369], [369, 377], [322, 391], [391, 269], [269, 322], [417, 465], [465, 464], [464, 417], [386, 257], [257, 258], [258, 386], [466, 260], [260, 388], [388, 466], [456, 399], [399, 419], [419, 456], [284, 332], [332, 333], [333, 284], [417, 285], [285, 8], [8, 417], [346, 340], [340, 261], [261, 346], [413, 441], [441, 285], [285, 413], [327, 460], [460, 328], [328, 327], [355, 371], [371, 329], [329, 355], [392, 439], [439, 438], [438, 392], [382, 341], [341, 256], [256, 382], [429, 420], [420, 360], [360, 429], [364, 394], [394, 379], [379, 364], [277, 343], [343, 437], [437, 277], [443, 444], [444, 283], [283, 443], [275, 440], [440, 363], [363, 275], [431, 262], [262, 369], [369, 431], [297, 338], [338, 337], [337, 297], [273, 375], [375, 321], [321, 273], [450, 451], [451, 349], [349, 450], [446, 342], [342, 467], [467, 446], [293, 334], [334, 282], [282, 293], [458, 461], [461, 462], [462, 458], [276, 353], [353, 383], [383, 276], [308, 324], [324, 325], [325, 308], [276, 300], [300, 293], [293, 276], [372, 345], [345, 447], [447, 372], [352, 345], [345, 340], [340, 352], [274, 1], [1, 19], [19, 274], [456, 248], [248, 281], [281, 456], [436, 427], [427, 425], [425, 436], [381, 256], [256, 252], [252, 381], [269, 391], [391, 393], [393, 269], [200, 199], [199, 428], [428, 200], [266, 330], [330, 329], [329, 266], [287, 273], [273, 422], [422, 287], [250, 462], [462, 328], [328, 250], [258, 286], [286, 384], [384, 258], [265, 353], [353, 342], [342, 265], [387, 259], [259, 257], [257, 387], [424, 431], [431, 430], [430, 424], [342, 353], [353, 276], [276, 342], [273, 335], [335, 424], [424, 273], [292, 325], [325, 307], [307, 292], [366, 447], [447, 345], [345, 366], [271, 303], [303, 302], [302, 271], [423, 266], [266, 371], [371, 423], [294, 455], [455, 460], [460, 294], [279, 278], [278, 294], [294, 279], [271, 272], [272, 304], [304, 271], [432, 434], [434, 427], [427, 432], [272, 407], [407, 408], [408, 272], [394, 430], [430, 431], [431, 394], [395, 369], [369, 400], [400, 395], [334, 333], [333, 299], [299, 334], [351, 417], [417, 168], [168, 351], [352, 280], [280, 411], [411, 352], [325, 319], [319, 320], [320, 325], [295, 296], [296, 336], [336, 295], [319, 403], [403, 404], [404, 319], [330, 348], [348, 349], [349, 330], [293, 298], [298, 333], [333, 293], [323, 454], [454, 447], [447, 323], [15, 16], [16, 315], [315, 15], [358, 429], [429, 279], [279, 358], [14, 15], [15, 316], [316, 14], [285, 336], [336, 9], [9, 285], [329, 349], [349, 350], [350, 329], [374, 380], [380, 252], [252, 374], [318, 402], [402, 403], [403, 318], [6, 197], [197, 419], [419, 6], [318, 319], [319, 325], [325, 318], [367, 364], [364, 365], [365, 367], [435, 367], [367, 397], [397, 435], [344, 438], [438, 439], [439, 344], [272, 271], [271, 311], [311, 272], [195, 5], [5, 281], [281, 195], [273, 287], [287, 291], [291, 273], [396, 428], [428, 199], [199, 396], [311, 271], [271, 268], [268, 311], [283, 444], [444, 445], [445, 283], [373, 254], [254, 339], [339, 373], [282, 334], [334, 296], [296, 282], [449, 347], [347, 346], [346, 449], [264, 447], [447, 454], [454, 264], [336, 296], [296, 299], [299, 336], [338, 10], [10, 151], [151, 338], [278, 439], [439, 455], [455, 278], [292, 407], [407, 415], [415, 292], [358, 371], [371, 355], [355, 358], [340, 345], [345, 372], [372, 340], [346, 347], [347, 280], [280, 346], [442, 443], [443, 282], [282, 442], [19, 94], [94, 370], [370, 19], [441, 442], [442, 295], [295, 441], [248, 419], [419, 197], [197, 248], [263, 255], [255, 359], [359, 263], [440, 275], [275, 274], [274, 440], [300, 383], [383, 368], [368, 300], [351, 412], [412, 465], [465, 351], [263, 467], [467, 466], [466, 263], [301, 368], [368, 389], [389, 301], [395, 378], [378, 379], [379, 395], [412, 351], [351, 419], [419, 412], [436, 426], [426, 322], [322, 436], [2, 164], [164, 393], [393, 2], [370, 462], [462, 461], [461, 370], [164, 0], [0, 267], [267, 164], [302, 11], [11, 12], [12, 302], [268, 12], [12, 13], [13, 268], [293, 300], [300, 301], [301, 293], [446, 261], [261, 340], [340, 446], [330, 266], [266, 425], [425, 330], [426, 423], [423, 391], [391, 426], [429, 355], [355, 437], [437, 429], [391, 327], [327, 326], [326, 391], [440, 457], [457, 438], [438, 440], [341, 382], [382, 362], [362, 341], [459, 457], [457, 461], [461, 459], [434, 430], [430, 394], [394, 434], [414, 463], [463, 362], [362, 414], [396, 369], [369, 262], [262, 396], [354, 461], [461, 457], [457, 354], [316, 403], [403, 402], [402, 316], [315, 404], [404, 403], [403, 315], [314, 405], [405, 404], [404, 314], [313, 406], [406, 405], [405, 313], [421, 418], [418, 406], [406, 421], [366, 401], [401, 361], [361, 366], [306, 408], [408, 407], [407, 306], [291, 409], [409, 408], [408, 291], [287, 410], [410, 409], [409, 287], [432, 436], [436, 410], [410, 432], [434, 416], [416, 411], [411, 434], [264, 368], [368, 383], [383, 264], [309, 438], [438, 457], [457, 309], [352, 376], [376, 401], [401, 352], [274, 275], [275, 4], [4, 274], [421, 428], [428, 262], [262, 421], [294, 327], [327, 358], [358, 294], [433, 416], [416, 367], [367, 433], [289, 455], [455, 439], [439, 289], [462, 370], [370, 326], [326, 462], [2, 326], [326, 370], [370, 2], [305, 460], [460, 455], [455, 305], [254, 449], [449, 448], [448, 254], [255, 261], [261, 446], [446, 255], [253, 450], [450, 449], [449, 253], [252, 451], [451, 450], [450, 252], [256, 452], [452, 451], [451, 256], [341, 453], [453, 452], [452, 341], [413, 464], [464, 463], [463, 413], [441, 413], [413, 414], [414, 441], [258, 442], [442, 441], [441, 258], [257, 443], [443, 442], [442, 257], [259, 444], [444, 443], [443, 259], [260, 445], [445, 444], [444, 260], [467, 342], [342, 445], [445, 467], [459, 458], [458, 250], [250, 459], [289, 392], [392, 290], [290, 289], [290, 328], [328, 460], [460, 290], [376, 433], [433, 435], [435, 376], [250, 290], [290, 392], [392, 250], [411, 416], [416, 433], [433, 411], [341, 463], [463, 464], [464, 341], [453, 464], [464, 465], [465, 453], [357, 465], [465, 412], [412, 357], [343, 412], [412, 399], [399, 343], [360, 363], [363, 440], [440, 360], [437, 399], [399, 456], [456, 437], [420, 456], [456, 363], [363, 420], [401, 435], [435, 288], [288, 401], [372, 383], [383, 353], [353, 372], [339, 255], [255, 249], [249, 339], [448, 261], [261, 255], [255, 448], [133, 243], [243, 190], [190, 133], [133, 155], [155, 112], [112, 133], [33, 246], [246, 247], [247, 33], [33, 130], [130, 25], [25, 33], [398, 384], [384, 286], [286, 398], [362, 398], [398, 414], [414, 362], [362, 463], [463, 341], [341, 362], [263, 359], [359, 467], [467, 263], [263, 249], [249, 255], [255, 263], [466, 467], [467, 260], [260, 466], [75, 60], [60, 166], [166, 75], [238, 239], [239, 79], [79, 238], [162, 127], [127, 139], [139, 162], [72, 11], [11, 37], [37, 72], [121, 232], [232, 120], [120, 121], [73, 72], [72, 39], [39, 73], [114, 128], [128, 47], [47, 114], [233, 232], [232, 128], [128, 233], [103, 104], [104, 67], [67, 103], [152, 175], [175, 148], [148, 152], [119, 118], [118, 101], [101, 119], [74, 73], [73, 40], [40, 74], [107, 9], [9, 108], [108, 107], [49, 48], [48, 131], [131, 49], [32, 194], [194, 211], [211, 32], [184, 74], [74, 185], [185, 184], [191, 80], [80, 183], [183, 191], [185, 40], [40, 186], [186, 185], [119, 230], [230, 118], [118, 119], [210, 202], [202, 214], [214, 210], [84, 83], [83, 17], [17, 84], [77, 76], [76, 146], [146, 77], [161, 160], [160, 30], [30, 161], [190, 56], [56, 173], [173, 190], [182, 106], [106, 194], [194, 182], [138, 135], [135, 192], [192, 138], [129, 203], [203, 98], [98, 129], [54, 21], [21, 68], [68, 54], [5, 51], [51, 4], [4, 5], [145, 144], [144, 23], [23, 145], [90, 77], [77, 91], [91, 90], [207, 205], [205, 187], [187, 207], [83, 201], [201, 18], [18, 83], [181, 91], [91, 182], [182, 181], [180, 90], [90, 181], [181, 180], [16, 85], [85, 17], [17, 16], [205, 206], [206, 36], [36, 205], [176, 148], [148, 140], [140, 176], [165, 92], [92, 39], [39, 165], [245, 193], [193, 244], [244, 245], [27, 159], [159, 28], [28, 27], [30, 247], [247, 161], [161, 30], [174, 236], [236, 196], [196, 174], [103, 54], [54, 104], [104, 103], [55, 193], [193, 8], [8, 55], [111, 117], [117, 31], [31, 111], [221, 189], [189, 55], [55, 221], [240, 98], [98, 99], [99, 240], [142, 126], [126, 100], [100, 142], [219, 166], [166, 218], [218, 219], [112, 155], [155, 26], [26, 112], [198, 209], [209, 131], [131, 198], [169, 135], [135, 150], [150, 169], [114, 47], [47, 217], [217, 114], [224, 223], [223, 53], [53, 224], [220, 45], [45, 134], [134, 220], [32, 211], [211, 140], [140, 32], [109, 67], [67, 108], [108, 109], [146, 43], [43, 91], [91, 146], [231, 230], [230, 120], [120, 231], [113, 226], [226, 247], [247, 113], [105, 63], [63, 52], [52, 105], [241, 238], [238, 242], [242, 241], [124, 46], [46, 156], [156, 124], [95, 78], [78, 96], [96, 95], [70, 46], [46, 63], [63, 70], [116, 143], [143, 227], [227, 116], [116, 123], [123, 111], [111, 116], [1, 44], [44, 19], [19, 1], [3, 236], [236, 51], [51, 3], [207, 216], [216, 205], [205, 207], [26, 154], [154, 22], [22, 26], [165, 39], [39, 167], [167, 165], [199, 200], [200, 208], [208, 199], [101, 36], [36, 100], [100, 101], [43, 57], [57, 202], [202, 43], [242, 20], [20, 99], [99, 242], [56, 28], [28, 157], [157, 56], [124, 35], [35, 113], [113, 124], [29, 160], [160, 27], [27, 29], [211, 204], [204, 210], [210, 211], [124, 113], [113, 46], [46, 124], [106, 43], [43, 204], [204, 106], [96, 62], [62, 77], [77, 96], [227, 137], [137, 116], [116, 227], [73, 41], [41, 72], [72, 73], [36, 203], [203, 142], [142, 36], [235, 64], [64, 240], [240, 235], [48, 49], [49, 64], [64, 48], [42, 41], [41, 74], [74, 42], [214, 212], [212, 207], [207, 214], [183, 42], [42, 184], [184, 183], [210, 169], [169, 211], [211, 210], [140, 170], [170, 176], [176, 140], [104, 105], [105, 69], [69, 104], [193, 122], [122, 168], [168, 193], [50, 123], [123, 187], [187, 50], [89, 96], [96, 90], [90, 89], [66, 65], [65, 107], [107, 66], [179, 89], [89, 180], [180, 179], [119, 101], [101, 120], [120, 119], [68, 63], [63, 104], [104, 68], [234, 93], [93, 227], [227, 234], [16, 15], [15, 85], [85, 16], [209, 129], [129, 49], [49, 209], [15, 14], [14, 86], [86, 15], [107, 55], [55, 9], [9, 107], [120, 100], [100, 121], [121, 120], [153, 145], [145, 22], [22, 153], [178, 88], [88, 179], [179, 178], [197, 6], [6, 196], [196, 197], [89, 88], [88, 96], [96, 89], [135, 138], [138, 136], [136, 135], [138, 215], [215, 172], [172, 138], [218, 115], [115, 219], [219, 218], [41, 42], [42, 81], [81, 41], [5, 195], [195, 51], [51, 5], [57, 43], [43, 61], [61, 57], [208, 171], [171, 199], [199, 208], [41, 81], [81, 38], [38, 41], [224, 53], [53, 225], [225, 224], [24, 144], [144, 110], [110, 24], [105, 52], [52, 66], [66, 105], [118, 229], [229, 117], [117, 118], [227, 34], [34, 234], [234, 227], [66, 107], [107, 69], [69, 66], [10, 109], [109, 151], [151, 10], [219, 48], [48, 235], [235, 219], [183, 62], [62, 191], [191, 183], [142, 129], [129, 126], [126, 142], [116, 111], [111, 143], [143, 116], [118, 117], [117, 50], [50, 118], [223, 222], [222, 52], [52, 223], [94, 19], [19, 141], [141, 94], [222, 221], [221, 65], [65, 222], [196, 3], [3, 197], [197, 196], [45, 220], [220, 44], [44, 45], [156, 70], [70, 139], [139, 156], [188, 122], [122, 245], [245, 188], [139, 71], [71, 162], [162, 139], [149, 170], [170, 150], [150, 149], [122, 188], [188, 196], [196, 122], [206, 216], [216, 92], [92, 206], [164, 2], [2, 167], [167, 164], [242, 141], [141, 241], [241, 242], [0, 164], [164, 37], [37, 0], [11, 72], [72, 12], [12, 11], [12, 38], [38, 13], [13, 12], [70, 63], [63, 71], [71, 70], [31, 226], [226, 111], [111, 31], [36, 101], [101, 205], [205, 36], [203, 206], [206, 165], [165, 203], [126, 209], [209, 217], [217, 126], [98, 165], [165, 97], [97, 98], [237, 220], [220, 218], [218, 237], [237, 239], [239, 241], [241, 237], [210, 214], [214, 169], [169, 210], [140, 171], [171, 32], [32, 140], [241, 125], [125, 237], [237, 241], [179, 86], [86, 178], [178, 179], [180, 85], [85, 179], [179, 180], [181, 84], [84, 180], [180, 181], [182, 83], [83, 181], [181, 182], [194, 201], [201, 182], [182, 194], [177, 137], [137, 132], [132, 177], [184, 76], [76, 183], [183, 184], [185, 61], [61, 184], [184, 185], [186, 57], [57, 185], [185, 186], [216, 212], [212, 186], [186, 216], [192, 214], [214, 187], [187, 192], [139, 34], [34, 156], [156, 139], [218, 79], [79, 237], [237, 218], [147, 123], [123, 177], [177, 147], [45, 44], [44, 4], [4, 45], [208, 201], [201, 32], [32, 208], [98, 64], [64, 129], [129, 98], [192, 213], [213, 138], [138, 192], [235, 59], [59, 219], [219, 235], [141, 242], [242, 97], [97, 141], [97, 2], [2, 141], [141, 97], [240, 75], [75, 235], [235, 240], [229, 24], [24, 228], [228, 229], [31, 25], [25, 226], [226, 31], [230, 23], [23, 229], [229, 230], [231, 22], [22, 230], [230, 231], [232, 26], [26, 231], [231, 232], [233, 112], [112, 232], [232, 233], [244, 189], [189, 243], [243, 244], [189, 221], [221, 190], [190, 189], [222, 28], [28, 221], [221, 222], [223, 27], [27, 222], [222, 223], [224, 29], [29, 223], [223, 224], [225, 30], [30, 224], [224, 225], [113, 247], [247, 225], [225, 113], [99, 60], [60, 240], [240, 99], [213, 147], [147, 215], [215, 213], [60, 20], [20, 166], [166, 60], [192, 187], [187, 213], [213, 192], [243, 112], [112, 244], [244, 243], [244, 233], [233, 245], [245, 244], [245, 128], [128, 188], [188, 245], [188, 114], [114, 174], [174, 188], [134, 131], [131, 220], [220, 134], [174, 217], [217, 236], [236, 174], [236, 198], [198, 134], [134, 236], [215, 177], [177, 58], [58, 215], [156, 143], [143, 124], [124, 156], [25, 110], [110, 7], [7, 25], [31, 228], [228, 25], [25, 31], [264, 356], [356, 368], [368, 264], [0, 11], [11, 267], [267, 0], [451, 452], [452, 349], [349, 451], [267, 302], [302, 269], [269, 267], [350, 357], [357, 277], [277, 350], [350, 452], [452, 357], [357, 350], [299, 333], [333, 297], [297, 299], [396, 175], [175, 377], [377, 396], [280, 347], [347, 330], [330, 280], [269, 303], [303, 270], [270, 269], [151, 9], [9, 337], [337, 151], [344, 278], [278, 360], [360, 344], [424, 418], [418, 431], [431, 424], [270, 304], [304, 409], [409, 270], [272, 310], [310, 407], [407, 272], [322, 270], [270, 410], [410, 322], [449, 450], [450, 347], [347, 449], [432, 422], [422, 434], [434, 432], [18, 313], [313, 17], [17, 18], [291, 306], [306, 375], [375, 291], [259, 387], [387, 260], [260, 259], [424, 335], [335, 418], [418, 424], [434, 364], [364, 416], [416, 434], [391, 423], [423, 327], [327, 391], [301, 251], [251, 298], [298, 301], [275, 281], [281, 4], [4, 275], [254, 373], [373, 253], [253, 254], [375, 307], [307, 321], [321, 375], [280, 425], [425, 411], [411, 280], [200, 421], [421, 18], [18, 200], [335, 321], [321, 406], [406, 335], [321, 320], [320, 405], [405, 321], [314, 315], [315, 17], [17, 314], [423, 426], [426, 266], [266, 423], [396, 377], [377, 369], [369, 396], [270, 322], [322, 269], [269, 270], [413, 417], [417, 464], [464, 413], [385, 386], [386, 258], [258, 385], [248, 456], [456, 419], [419, 248], [298, 284], [284, 333], [333, 298], [168, 417], [417, 8], [8, 168], [448, 346], [346, 261], [261, 448], [417, 413], [413, 285], [285, 417], [326, 327], [327, 328], [328, 326], [277, 355], [355, 329], [329, 277], [309, 392], [392, 438], [438, 309], [381, 382], [382, 256], [256, 381], [279, 429], [429, 360], [360, 279], [365, 364], [364, 379], [379, 365], [355, 277], [277, 437], [437, 355], [282, 443], [443, 283], [283, 282], [281, 275], [275, 363], [363, 281], [395, 431], [431, 369], [369, 395], [299, 297], [297, 337], [337, 299], [335, 273], [273, 321], [321, 335], [348, 450], [450, 349], [349, 348], [359, 446], [446, 467], [467, 359], [283, 293], [293, 282], [282, 283], [250, 458], [458, 462], [462, 250], [300, 276], [276, 383], [383, 300], [292, 308], [308, 325], [325, 292], [283, 276], [276, 293], [293, 283], [264, 372], [372, 447], [447, 264], [346, 352], [352, 340], [340, 346], [354, 274], [274, 19], [19, 354], [363, 456], [456, 281], [281, 363], [426, 436], [436, 425], [425, 426], [380, 381], [381, 252], [252, 380], [267, 269], [269, 393], [393, 267], [421, 200], [200, 428], [428, 421], [371, 266], [266, 329], [329, 371], [432, 287], [287, 422], [422, 432], [290, 250], [250, 328], [328, 290], [385, 258], [258, 384], [384, 385], [446, 265], [265, 342], [342, 446], [386, 387], [387, 257], [257, 386], [422, 424], [424, 430], [430, 422], [445, 342], [342, 276], [276, 445], [422, 273], [273, 424], [424, 422], [306, 292], [292, 307], [307, 306], [352, 366], [366, 345], [345, 352], [268, 271], [271, 302], [302, 268], [358, 423], [423, 371], [371, 358], [327, 294], [294, 460], [460, 327], [331, 279], [279, 294], [294, 331], [303, 271], [271, 304], [304, 303], [436, 432], [432, 427], [427, 436], [304, 272], [272, 408], [408, 304], [395, 394], [394, 431], [431, 395], [378, 395], [395, 400], [400, 378], [296, 334], [334, 299], [299, 296], [6, 351], [351, 168], [168, 6], [376, 352], [352, 411], [411, 376], [307, 325], [325, 320], [320, 307], [285, 295], [295, 336], [336, 285], [320, 319], [319, 404], [404, 320], [329, 330], [330, 349], [349, 329], [334, 293], [293, 333], [333, 334], [366, 323], [323, 447], [447, 366], [316, 15], [15, 315], [315, 316], [331, 358], [358, 279], [279, 331], [317, 14], [14, 316], [316, 317], [8, 285], [285, 9], [9, 8], [277, 329], [329, 350], [350, 277], [253, 374], [374, 252], [252, 253], [319, 318], [318, 403], [403, 319], [351, 6], [6, 419], [419, 351], [324, 318], [318, 325], [325, 324], [397, 367], [367, 365], [365, 397], [288, 435], [435, 397], [397, 288], [278, 344], [344, 439], [439, 278], [310, 272], [272, 311], [311, 310], [248, 195], [195, 281], [281, 248], [375, 273], [273, 291], [291, 375], [175, 396], [396, 199], [199, 175], [312, 311], [311, 268], [268, 312], [276, 283], [283, 445], [445, 276], [390, 373], [373, 339], [339, 390], [295, 282], [282, 296], [296, 295], [448, 449], [449, 346], [346, 448], [356, 264], [264, 454], [454, 356], [337, 336], [336, 299], [299, 337], [337, 338], [338, 151], [151, 337], [294, 278], [278, 455], [455, 294], [308, 292], [292, 415], [415, 308], [429, 358], [358, 355], [355, 429], [265, 340], [340, 372], [372, 265], [352, 346], [346, 280], [280, 352], [295, 442], [442, 282], [282, 295], [354, 19], [19, 370], [370, 354], [285, 441], [441, 295], [295, 285], [195, 248], [248, 197], [197, 195], [457, 440], [440, 274], [274, 457], [301, 300], [300, 368], [368, 301], [417, 351], [351, 465], [465, 417], [251, 301], [301, 389], [389, 251], [394, 395], [395, 379], [379, 394], [399, 412], [412, 419], [419, 399], [410, 436], [436, 322], [322, 410], [326, 2], [2, 393], [393, 326], [354, 370], [370, 461], [461, 354], [393, 164], [164, 267], [267, 393], [268, 302], [302, 12], [12, 268], [312, 268], [268, 13], [13, 312], [298, 293], [293, 301], [301, 298], [265, 446], [446, 340], [340, 265], [280, 330], [330, 425], [425, 280], [322, 426], [426, 391], [391, 322], [420, 429], [429, 437], [437, 420], [393, 391], [391, 326], [326, 393], [344, 440], [440, 438], [438, 344], [458, 459], [459, 461], [461, 458], [364, 434], [434, 394], [394, 364], [428, 396], [396, 262], [262, 428], [274, 354], [354, 457], [457, 274], [317, 316], [316, 402], [402, 317], [316, 315], [315, 403], [403, 316], [315, 314], [314, 404], [404, 315], [314, 313], [313, 405], [405, 314], [313, 421], [421, 406], [406, 313], [323, 366], [366, 361], [361, 323], [292, 306], [306, 407], [407, 292], [306, 291], [291, 408], [408, 306], [291, 287], [287, 409], [409, 291], [287, 432], [432, 410], [410, 287], [427, 434], [434, 411], [411, 427], [372, 264], [264, 383], [383, 372], [459, 309], [309, 457], [457, 459], [366, 352], [352, 401], [401, 366], [1, 274], [274, 4], [4, 1], [418, 421], [421, 262], [262, 418], [331, 294], [294, 358], [358, 331], [435, 433], [433, 367], [367, 435], [392, 289], [289, 439], [439, 392], [328, 462], [462, 326], [326, 328], [94, 2], [2, 370], [370, 94], [289, 305], [305, 455], [455, 289], [339, 254], [254, 448], [448, 339], [359, 255], [255, 446], [446, 359], [254, 253], [253, 449], [449, 254], [253, 252], [252, 450], [450, 253], [252, 256], [256, 451], [451, 252], [256, 341], [341, 452], [452, 256], [414, 413], [413, 463], [463, 414], [286, 441], [441, 414], [414, 286], [286, 258], [258, 441], [441, 286], [258, 257], [257, 442], [442, 258], [257, 259], [259, 443], [443, 257], [259, 260], [260, 444], [444, 259], [260, 467], [467, 445], [445, 260], [309, 459], [459, 250], [250, 309], [305, 289], [289, 290], [290, 305], [305, 290], [290, 460], [460, 305], [401, 376], [376, 435], [435, 401], [309, 250], [250, 392], [392, 309], [376, 411], [411, 433], [433, 376], [453, 341], [341, 464], [464, 453], [357, 453], [453, 465], [465, 357], [343, 357], [357, 412], [412, 343], [437, 343], [343, 399], [399, 437], [344, 360], [360, 440], [440, 344], [420, 437], [437, 456], [456, 420], [360, 420], [420, 363], [363, 360], [361, 401], [401, 288], [288, 361], [265, 372], [372, 353], [353, 265], [390, 339], [339, 249], [249, 390], [339, 448], [448, 255], [255, 339]);
function ea(e) {
  e.m = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
}
var O = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !1), this.m = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }, this.outputFacialTransformationMatrixes = this.outputFaceBlendshapes = !1, y(e = this.i = new Xo(), 0, 1, t = new V()), this.C = new Yo(), y(this.i, 0, 3, this.C), this.v = new fn(), y(this.i, 0, 2, this.v), Ce(this.v, 4, 1), w(this.v, 2, 0.5), w(this.C, 2, 0.5), w(this.i, 4, 0.5);
  }
  D() {
    return "FaceLandmarker";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return "numFaces" in e && Ce(this.v, 4, e.numFaces ?? 1), "minFaceDetectionConfidence" in e && w(this.v, 2, e.minFaceDetectionConfidence ?? 0.5), "minTrackingConfidence" in e && w(this.i, 4, e.minTrackingConfidence ?? 0.5), "minFacePresenceConfidence" in e && w(this.C, 2, e.minFacePresenceConfidence ?? 0.5), "outputFaceBlendshapes" in e && (this.outputFaceBlendshapes = !!e.outputFaceBlendshapes), "outputFacialTransformationMatrixes" in e && (this.outputFacialTransformationMatrixes = !!e.outputFacialTransformationMatrixes), this.l(e);
  }
  H(e, t) {
    return ea(this), Te(this, e, t), this.m;
  }
  I(e, t, r) {
    return ea(this), De(this, e, r, t), this.m;
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect"), C(e, "face_landmarks");
    var t = new ge();
    Pe(t, fh, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.face_landmarker.FaceLandmarkerGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), F(r, "NORM_LANDMARKS:face_landmarks"), r.A(t), be(e, r), this.h.attachProtoVectorListener("face_landmarks", (n, i) => {
      for (let s of n) n = _r(s), this.m.faceLandmarks.push(vr(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("face_landmarks", (n) => {
      m(this, n);
    }), this.outputFaceBlendshapes && (C(e, "blendshapes"), F(r, "BLENDSHAPES:blendshapes"), this.h.attachProtoVectorListener("blendshapes", (n, i) => {
      if (this.outputFaceBlendshapes) for (let s of n) n = ln(s), this.m.faceBlendshapes.push($i(n.h() ?? []));
      m(this, i);
    }), this.h.attachEmptyPacketListener("blendshapes", (n) => {
      m(this, n);
    })), this.outputFacialTransformationMatrixes && (C(e, "face_geometry"), F(r, "FACE_GEOMETRY:face_geometry"), this.h.attachProtoVectorListener("face_geometry", (n, i) => {
      if (this.outputFacialTransformationMatrixes) for (let s of n) (n = M(n = lh(s), eh, 2)) && this.m.facialTransformationMatrixes.push({ rows: Ae(n, 1) ?? 0 ?? 0, columns: Ae(n, 2) ?? 0 ?? 0, data: ft(n, 3, fe).slice() ?? [] });
      m(this, i);
    }), this.h.attachEmptyPacketListener("face_geometry", (n) => {
      m(this, n);
    })), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
O.prototype.detectForVideo = O.prototype.I, O.prototype.detect = O.prototype.H, O.prototype.setOptions = O.prototype.A, O.createFromModelPath = function(e, t) {
  return N(O, e, { baseOptions: { modelAssetPath: t } });
}, O.createFromModelBuffer = function(e, t) {
  return N(O, e, { baseOptions: { modelAssetBuffer: t } });
}, O.createFromOptions = function(e, t) {
  return N(O, e, t);
}, O.FACE_LANDMARKS_LIPS = Vi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_LIPS", O.FACE_LANDMARKS_LIPS), O.FACE_LANDMARKS_LEFT_EYE = Hi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE", O.FACE_LANDMARKS_LEFT_EYE), O.FACE_LANDMARKS_LEFT_EYEBROW = Ki, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW", O.FACE_LANDMARKS_LEFT_EYEBROW), O.FACE_LANDMARKS_LEFT_IRIS = T2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS", O.FACE_LANDMARKS_LEFT_IRIS), O.FACE_LANDMARKS_RIGHT_EYE = Wi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE", O.FACE_LANDMARKS_RIGHT_EYE), O.FACE_LANDMARKS_RIGHT_EYEBROW = zi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW", O.FACE_LANDMARKS_RIGHT_EYEBROW), O.FACE_LANDMARKS_RIGHT_IRIS = F2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS", O.FACE_LANDMARKS_RIGHT_IRIS), O.FACE_LANDMARKS_FACE_OVAL = Yi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL", O.FACE_LANDMARKS_FACE_OVAL), O.FACE_LANDMARKS_CONTOURS = I2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_CONTOURS", O.FACE_LANDMARKS_CONTOURS), O.FACE_LANDMARKS_TESSELATION = N2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$face_landmarker$face_landmarker.FaceLandmarker.FACE_LANDMARKS_TESSELATION", O.FACE_LANDMARKS_TESSELATION);
var Xi = Se([0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]);
function ta(e) {
  e.gestures = [], e.landmarks = [], e.worldLandmarks = [], e.handedness = [];
}
function ra(e) {
  return e.gestures.length === 0 ? { gestures: [], landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] } : { gestures: e.gestures, landmarks: e.landmarks, worldLandmarks: e.worldLandmarks, handedness: e.handedness, handednesses: e.handedness };
}
function na(e, t = !0) {
  var r = [];
  for (let i of e) {
    var n = ln(i);
    e = [];
    for (let s of n.h()) n = t && Ae(s, 1) != null ? Ae(s, 1) ?? 0 : -1, e.push({ score: te(s, 2) ?? 0, index: n, categoryName: ee(B(s, 3)) ?? "" ?? "", displayName: ee(B(s, 4)) ?? "" ?? "" });
    r.push(e);
  }
  return r;
}
var ne = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !1), this.gestures = [], this.landmarks = [], this.worldLandmarks = [], this.handedness = [], y(e = this.m = new Zo(), 0, 1, t = new V()), this.v = new Ci(), y(this.m, 0, 2, this.v), this.G = new Mi(), y(this.v, 0, 3, this.G), this.C = new Jo(), y(this.v, 0, 2, this.C), this.i = new dh(), y(this.m, 0, 3, this.i), w(this.C, 2, 0.5), w(this.v, 4, 0.5), w(this.G, 2, 0.5);
  }
  D() {
    return "GestureRecognizer";
  }
  get baseOptions() {
    return M(this.m, V, 1);
  }
  set baseOptions(e) {
    y(this.m, 0, 1, e);
  }
  A(e) {
    var i, s, a, o;
    if (Ce(this.C, 3, e.numHands ?? 1), "minHandDetectionConfidence" in e && w(this.C, 2, e.minHandDetectionConfidence ?? 0.5), "minTrackingConfidence" in e && w(this.v, 4, e.minTrackingConfidence ?? 0.5), "minHandPresenceConfidence" in e && w(this.G, 2, e.minHandPresenceConfidence ?? 0.5), e.cannedGesturesClassifierOptions) {
      var t = new Ft(), r = t, n = jn(e.cannedGesturesClassifierOptions, (i = M(this.i, Ft, 3)) == null ? void 0 : i.l());
      y(r, 0, 2, n), y(this.i, 0, 3, t);
    } else e.cannedGesturesClassifierOptions === void 0 && ((s = M(this.i, Ft, 3)) == null || s.h());
    return e.customGesturesClassifierOptions ? (y(r = t = new Ft(), 0, 2, n = jn(e.customGesturesClassifierOptions, (a = M(this.i, Ft, 4)) == null ? void 0 : a.l())), y(this.i, 0, 4, t)) : e.customGesturesClassifierOptions === void 0 && ((o = M(this.i, Ft, 4)) == null || o.h()), this.l(e);
  }
  Ya(e, t) {
    return ta(this), Te(this, e, t), ra(this);
  }
  Za(e, t, r) {
    return ta(this), De(this, e, r, t), ra(this);
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect"), C(e, "hand_gestures"), C(e, "hand_landmarks"), C(e, "world_hand_landmarks"), C(e, "handedness");
    var t = new ge();
    Pe(t, ph, this.m);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.gesture_recognizer.GestureRecognizerGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), F(r, "HAND_GESTURES:hand_gestures"), F(r, "LANDMARKS:hand_landmarks"), F(r, "WORLD_LANDMARKS:world_hand_landmarks"), F(r, "HANDEDNESS:handedness"), r.A(t), be(e, r), this.h.attachProtoVectorListener("hand_landmarks", (n, i) => {
      for (let s of n) n = _r(s), this.landmarks.push(vr(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("hand_landmarks", (n) => {
      m(this, n);
    }), this.h.attachProtoVectorListener("world_hand_landmarks", (n, i) => {
      for (let s of n) n = Ot(s), this.worldLandmarks.push(Mt(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("world_hand_landmarks", (n) => {
      m(this, n);
    }), this.h.attachProtoVectorListener("hand_gestures", (n, i) => {
      this.gestures.push(...na(n, !1)), m(this, i);
    }), this.h.attachEmptyPacketListener("hand_gestures", (n) => {
      m(this, n);
    }), this.h.attachProtoVectorListener("handedness", (n, i) => {
      this.handedness.push(...na(n)), m(this, i);
    }), this.h.attachEmptyPacketListener("handedness", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
function ia(e) {
  return { landmarks: e.landmarks, worldLandmarks: e.worldLandmarks, handednesses: e.handedness, handedness: e.handedness };
}
ne.prototype.recognizeForVideo = ne.prototype.Za, ne.prototype.recognize = ne.prototype.Ya, ne.prototype.setOptions = ne.prototype.A, ne.createFromModelPath = function(e, t) {
  return N(ne, e, { baseOptions: { modelAssetPath: t } });
}, ne.createFromModelBuffer = function(e, t) {
  return N(ne, e, { baseOptions: { modelAssetBuffer: t } });
}, ne.createFromOptions = function(e, t) {
  return N(ne, e, t);
}, ne.HAND_CONNECTIONS = Xi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$gesture_recognizer$gesture_recognizer.GestureRecognizer.HAND_CONNECTIONS", ne.HAND_CONNECTIONS);
var ie = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !1), this.landmarks = [], this.worldLandmarks = [], this.handedness = [], y(e = this.i = new Ci(), 0, 1, t = new V()), this.v = new Mi(), y(this.i, 0, 3, this.v), this.m = new Jo(), y(this.i, 0, 2, this.m), Ce(this.m, 3, 1), w(this.m, 2, 0.5), w(this.v, 2, 0.5), w(this.i, 4, 0.5);
  }
  D() {
    return "HandLandmarker";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return "numHands" in e && Ce(this.m, 3, e.numHands ?? 1), "minHandDetectionConfidence" in e && w(this.m, 2, e.minHandDetectionConfidence ?? 0.5), "minTrackingConfidence" in e && w(this.i, 4, e.minTrackingConfidence ?? 0.5), "minHandPresenceConfidence" in e && w(this.v, 2, e.minHandPresenceConfidence ?? 0.5), this.l(e);
  }
  H(e, t) {
    return this.landmarks = [], this.worldLandmarks = [], this.handedness = [], Te(this, e, t), ia(this);
  }
  I(e, t, r) {
    return this.landmarks = [], this.worldLandmarks = [], this.handedness = [], De(this, e, r, t), ia(this);
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect"), C(e, "hand_landmarks"), C(e, "world_hand_landmarks"), C(e, "handedness");
    var t = new ge();
    Pe(t, mh, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.hand_landmarker.HandLandmarkerGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), F(r, "LANDMARKS:hand_landmarks"), F(r, "WORLD_LANDMARKS:world_hand_landmarks"), F(r, "HANDEDNESS:handedness"), r.A(t), be(e, r), this.h.attachProtoVectorListener("hand_landmarks", (n, i) => {
      for (let s of n) n = _r(s), this.landmarks.push(vr(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("hand_landmarks", (n) => {
      m(this, n);
    }), this.h.attachProtoVectorListener("world_hand_landmarks", (n, i) => {
      for (let s of n) n = Ot(s), this.worldLandmarks.push(Mt(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("world_hand_landmarks", (n) => {
      m(this, n);
    }), this.h.attachProtoVectorListener("handedness", (n, i) => {
      var s = this.handedness, a = s.push, o = [];
      for (let h of n) {
        n = ln(h);
        let f = [];
        for (let u of n.h()) f.push({ score: te(u, 2) ?? 0, index: Ae(u, 1) ?? 0 ?? -1, categoryName: ee(B(u, 3)) ?? "" ?? "", displayName: ee(B(u, 4)) ?? "" ?? "" });
        o.push(f);
      }
      a.call(s, ...o), m(this, i);
    }), this.h.attachEmptyPacketListener("handedness", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
ie.prototype.detectForVideo = ie.prototype.I, ie.prototype.detect = ie.prototype.H, ie.prototype.setOptions = ie.prototype.A, ie.createFromModelPath = function(e, t) {
  return N(ie, e, { baseOptions: { modelAssetPath: t } });
}, ie.createFromModelBuffer = function(e, t) {
  return N(ie, e, { baseOptions: { modelAssetBuffer: t } });
}, ie.createFromOptions = function(e, t) {
  return N(ie, e, t);
}, ie.HAND_CONNECTIONS = Xi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$hand_landmarker$hand_landmarker.HandLandmarker.HAND_CONNECTIONS", ie.HAND_CONNECTIONS);
var O2 = Se([0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]);
function sa(e) {
  e.i = { faceLandmarks: [], faceBlendshapes: [], poseLandmarks: [], poseWorldLandmarks: [], poseSegmentationMasks: [], leftHandLandmarks: [], leftHandWorldLandmarks: [], rightHandLandmarks: [], rightHandWorldLandmarks: [] };
}
function aa(e) {
  try {
    if (!e.G) return e.i;
    e.G(e.i);
  } finally {
    pn(e);
  }
}
function br(e, t) {
  e = _r(e), t.push(vr(e));
}
var S = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "input_frames_image", null, !1), this.i = { faceLandmarks: [], faceBlendshapes: [], poseLandmarks: [], poseWorldLandmarks: [], poseSegmentationMasks: [], leftHandLandmarks: [], leftHandWorldLandmarks: [], rightHandLandmarks: [], rightHandWorldLandmarks: [] }, this.outputPoseSegmentationMasks = this.outputFaceBlendshapes = !1, y(e = this.m = new n2(), 0, 1, t = new V()), this.Z = new Mi(), y(this.m, 0, 2, this.Z), this.Ba = new gh(), y(this.m, 0, 3, this.Ba), this.v = new fn(), y(this.m, 0, 4, this.v), this.P = new Yo(), y(this.m, 0, 5, this.P), this.C = new t2(), y(this.m, 0, 6, this.C), this.aa = new r2(), y(this.m, 0, 7, this.aa), w(this.v, 2, 0.5), w(this.v, 3, 0.3), w(this.P, 2, 0.5), w(this.C, 2, 0.5), w(this.C, 3, 0.3), w(this.aa, 2, 0.5), w(this.Z, 2, 0.5);
  }
  D() {
    return "HolisticLandmarker";
  }
  get baseOptions() {
    return M(this.m, V, 1);
  }
  set baseOptions(e) {
    y(this.m, 0, 1, e);
  }
  A(e) {
    return "minFaceDetectionConfidence" in e && w(this.v, 2, e.minFaceDetectionConfidence ?? 0.5), "minFaceSuppressionThreshold" in e && w(this.v, 3, e.minFaceSuppressionThreshold ?? 0.3), "minFacePresenceConfidence" in e && w(this.P, 2, e.minFacePresenceConfidence ?? 0.5), "outputFaceBlendshapes" in e && (this.outputFaceBlendshapes = !!e.outputFaceBlendshapes), "minPoseDetectionConfidence" in e && w(this.C, 2, e.minPoseDetectionConfidence ?? 0.5), "minPoseSuppressionThreshold" in e && w(this.C, 3, e.minPoseSuppressionThreshold ?? 0.3), "minPosePresenceConfidence" in e && w(this.aa, 2, e.minPosePresenceConfidence ?? 0.5), "outputPoseSegmentationMasks" in e && (this.outputPoseSegmentationMasks = !!e.outputPoseSegmentationMasks), "minHandLandmarksConfidence" in e && w(this.Z, 2, e.minHandLandmarksConfidence ?? 0.5), this.l(e);
  }
  H(e, t, r) {
    var n = typeof t != "function" ? t : {};
    return this.G = typeof t == "function" ? t : r, sa(this), Te(this, e, n), aa(this);
  }
  I(e, t, r, n) {
    var i = typeof r != "function" ? r : {};
    return this.G = typeof r == "function" ? r : n, sa(this), De(this, e, i, t), aa(this);
  }
  u() {
    var e = new _e();
    G(e, "input_frames_image"), C(e, "pose_landmarks"), C(e, "pose_world_landmarks"), C(e, "face_landmarks"), C(e, "left_hand_landmarks"), C(e, "left_hand_world_landmarks"), C(e, "right_hand_landmarks"), C(e, "right_hand_world_landmarks");
    var t = new ge(), r = new Es();
    pe(r, 1, "type.googleapis.com/mediapipe.tasks.vision.holistic_landmarker.proto.HolisticLandmarkerGraphOptions"), (function(i, s) {
      if (s != null) if (Array.isArray(s)) k(i, 2, Zr(s, 0, ir));
      else {
        if (!(typeof s == "string" || s instanceof Ne || Zn(s))) throw Error("invalid value in Any.value field: " + s + " expected a ByteString, a base64 encoded string, a Uint8Array or a jspb array");
        lr(i, 2, zr(s, !1), vt());
      }
    })(r, this.m.h());
    var n = new ue();
    pe(n, 2, "mediapipe.tasks.vision.holistic_landmarker.HolisticLandmarkerGraph"), sr(n, 8, Es, r), j(n, "IMAGE:input_frames_image"), F(n, "POSE_LANDMARKS:pose_landmarks"), F(n, "POSE_WORLD_LANDMARKS:pose_world_landmarks"), F(n, "FACE_LANDMARKS:face_landmarks"), F(n, "LEFT_HAND_LANDMARKS:left_hand_landmarks"), F(n, "LEFT_HAND_WORLD_LANDMARKS:left_hand_world_landmarks"), F(n, "RIGHT_HAND_LANDMARKS:right_hand_landmarks"), F(n, "RIGHT_HAND_WORLD_LANDMARKS:right_hand_world_landmarks"), n.A(t), be(e, n), dn(this, e), this.h.attachProtoListener("pose_landmarks", (i, s) => {
      br(i, this.i.poseLandmarks), m(this, s);
    }), this.h.attachEmptyPacketListener("pose_landmarks", (i) => {
      m(this, i);
    }), this.h.attachProtoListener("pose_world_landmarks", (i, s) => {
      var a = this.i.poseWorldLandmarks;
      i = Ot(i), a.push(Mt(i)), m(this, s);
    }), this.h.attachEmptyPacketListener("pose_world_landmarks", (i) => {
      m(this, i);
    }), this.outputPoseSegmentationMasks && (F(n, "POSE_SEGMENTATION_MASK:pose_segmentation_mask"), Bt(this, "pose_segmentation_mask"), this.h.ha("pose_segmentation_mask", (i, s) => {
      this.i.poseSegmentationMasks = [Ut(this, i, !0, !this.G)], m(this, s);
    }), this.h.attachEmptyPacketListener("pose_segmentation_mask", (i) => {
      this.i.poseSegmentationMasks = [], m(this, i);
    })), this.h.attachProtoListener("face_landmarks", (i, s) => {
      br(i, this.i.faceLandmarks), m(this, s);
    }), this.h.attachEmptyPacketListener("face_landmarks", (i) => {
      m(this, i);
    }), this.outputFaceBlendshapes && (C(e, "extra_blendshapes"), F(n, "FACE_BLENDSHAPES:extra_blendshapes"), this.h.attachProtoListener("extra_blendshapes", (i, s) => {
      var a = this.i.faceBlendshapes;
      this.outputFaceBlendshapes && (i = ln(i), a.push($i(i.h() ?? []))), m(this, s);
    }), this.h.attachEmptyPacketListener("extra_blendshapes", (i) => {
      m(this, i);
    })), this.h.attachProtoListener("left_hand_landmarks", (i, s) => {
      br(i, this.i.leftHandLandmarks), m(this, s);
    }), this.h.attachEmptyPacketListener("left_hand_landmarks", (i) => {
      m(this, i);
    }), this.h.attachProtoListener("left_hand_world_landmarks", (i, s) => {
      var a = this.i.leftHandWorldLandmarks;
      i = Ot(i), a.push(Mt(i)), m(this, s);
    }), this.h.attachEmptyPacketListener("left_hand_world_landmarks", (i) => {
      m(this, i);
    }), this.h.attachProtoListener("right_hand_landmarks", (i, s) => {
      br(i, this.i.rightHandLandmarks), m(this, s);
    }), this.h.attachEmptyPacketListener("right_hand_landmarks", (i) => {
      m(this, i);
    }), this.h.attachProtoListener("right_hand_world_landmarks", (i, s) => {
      var a = this.i.rightHandWorldLandmarks;
      i = Ot(i), a.push(Mt(i)), m(this, s);
    }), this.h.attachEmptyPacketListener("right_hand_world_landmarks", (i) => {
      m(this, i);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
S.prototype.detectForVideo = S.prototype.I, S.prototype.detect = S.prototype.H, S.prototype.setOptions = S.prototype.A, S.createFromModelPath = function(e, t) {
  return N(S, e, { baseOptions: { modelAssetPath: t } });
}, S.createFromModelBuffer = function(e, t) {
  return N(S, e, { baseOptions: { modelAssetBuffer: t } });
}, S.createFromOptions = function(e, t) {
  return N(S, e, t);
}, S.HAND_CONNECTIONS = Xi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.HAND_CONNECTIONS", S.HAND_CONNECTIONS), S.POSE_CONNECTIONS = O2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.POSE_CONNECTIONS", S.POSE_CONNECTIONS), S.FACE_LANDMARKS_LIPS = Vi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_LIPS", S.FACE_LANDMARKS_LIPS), S.FACE_LANDMARKS_LEFT_EYE = Hi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_LEFT_EYE", S.FACE_LANDMARKS_LEFT_EYE), S.FACE_LANDMARKS_LEFT_EYEBROW = Ki, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_LEFT_EYEBROW", S.FACE_LANDMARKS_LEFT_EYEBROW), S.FACE_LANDMARKS_LEFT_IRIS = T2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_LEFT_IRIS", S.FACE_LANDMARKS_LEFT_IRIS), S.FACE_LANDMARKS_RIGHT_EYE = Wi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYE", S.FACE_LANDMARKS_RIGHT_EYE), S.FACE_LANDMARKS_RIGHT_EYEBROW = zi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW", S.FACE_LANDMARKS_RIGHT_EYEBROW), S.FACE_LANDMARKS_RIGHT_IRIS = F2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_RIGHT_IRIS", S.FACE_LANDMARKS_RIGHT_IRIS), S.FACE_LANDMARKS_FACE_OVAL = Yi, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL", S.FACE_LANDMARKS_FACE_OVAL), S.FACE_LANDMARKS_CONTOURS = I2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_CONTOURS", S.FACE_LANDMARKS_CONTOURS), S.FACE_LANDMARKS_TESSELATION = N2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$holistic_landmarker$holistic_landmarker.HolisticLandmarker.FACE_LANDMARKS_TESSELATION", S.FACE_LANDMARKS_TESSELATION);
var ye = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "input_image", "norm_rect", !0), this.m = { classifications: [] }, y(e = this.i = new i2(), 0, 1, t = new V());
  }
  D() {
    return "ImageClassifier";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return y(this.i, 0, 2, jn(e, M(this.i, Ni, 2))), this.l(e);
  }
  Ha(e, t) {
    return this.m = { classifications: [] }, Te(this, e, t), this.m;
  }
  Ia(e, t, r) {
    return this.m = { classifications: [] }, De(this, e, r, t), this.m;
  }
  u() {
    var e = new _e();
    G(e, "input_image"), G(e, "norm_rect"), C(e, "classifications");
    var t = new ge();
    Pe(t, _h, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.image_classifier.ImageClassifierGraph"), j(r, "IMAGE:input_image"), j(r, "NORM_RECT:norm_rect"), F(r, "CLASSIFICATIONS:classifications"), r.A(t), be(e, r), this.h.attachProtoListener("classifications", (n, i) => {
      this.m = Th(nh(n)), m(this, i);
    }), this.h.attachEmptyPacketListener("classifications", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
ye.prototype.classifyForVideo = ye.prototype.Ia, ye.prototype.classify = ye.prototype.Ha, ye.prototype.setOptions = ye.prototype.A, ye.createFromModelPath = function(e, t) {
  return N(ye, e, { baseOptions: { modelAssetPath: t } });
}, ye.createFromModelBuffer = function(e, t) {
  return N(ye, e, { baseOptions: { modelAssetBuffer: t } });
}, ye.createFromOptions = function(e, t) {
  return N(ye, e, t);
};
var ce = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !0), this.i = new s2(), this.embeddings = { embeddings: [] }, y(e = this.i, 0, 1, t = new V());
  }
  D() {
    return "ImageEmbedder";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    var t = this.i, r = M(this.i, Ns, 2);
    if (r = r ? r.clone() : new Ns(), e.l2Normalize !== void 0) {
      var n = e.l2Normalize;
      k(r, 1, n == null ? n : Nr(n));
    } else "l2Normalize" in e && k(r, 1);
    return e.quantize !== void 0 ? k(r, 2, (n = e.quantize) == null ? n : Nr(n)) : "quantize" in e && k(r, 2), y(t, 0, 2, r), this.l(e);
  }
  Oa(e, t) {
    return Te(this, e, t), this.embeddings;
  }
  Pa(e, t, r) {
    return De(this, e, r, t), this.embeddings;
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect"), C(e, "embeddings_out");
    var t = new ge();
    Pe(t, vh, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.image_embedder.ImageEmbedderGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), F(r, "EMBEDDINGS:embeddings_out"), r.A(t), be(e, r), this.h.attachProtoListener("embeddings_out", (n, i) => {
      n = oh(n), this.embeddings = (function(s) {
        return { embeddings: kt(s, ah, 1).map((a) => {
          var h, f;
          var o = { headIndex: Ae(a, 3) ?? 0 ?? -1, headName: ee(B(a, 4)) ?? "" ?? "" };
          if (Ha(a, 1, Fr)) a = ft(a = Cn(a, ih, 1, Fr), 1, fe), o.floatEmbedding = a.slice();
          else {
            let u = new Uint8Array(0);
            o.quantizedEmbedding = ((f = (h = Cn(a, sh, 2, Fr)) == null ? void 0 : h.h()) == null ? void 0 : f.i()) ?? u;
          }
          return o;
        }), timestampMs: f2(B(s, 2, void 0, Mr) ?? Ga) };
      })(n), m(this, i);
    }), this.h.attachEmptyPacketListener("embeddings_out", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
ce.cosineSimilarity = function(e, t) {
  if (e.floatEmbedding && t.floatEmbedding) e = Rs(e.floatEmbedding, t.floatEmbedding);
  else {
    if (!e.quantizedEmbedding || !t.quantizedEmbedding) throw Error("Cannot compute cosine similarity between quantized and float embeddings.");
    e = Rs(xs(e.quantizedEmbedding), xs(t.quantizedEmbedding));
  }
  return e;
}, ce.prototype.embedForVideo = ce.prototype.Pa, ce.prototype.embed = ce.prototype.Oa, ce.prototype.setOptions = ce.prototype.A, ce.createFromModelPath = function(e, t) {
  return N(ce, e, { baseOptions: { modelAssetPath: t } });
}, ce.createFromModelBuffer = function(e, t) {
  return N(ce, e, { baseOptions: { modelAssetBuffer: t } });
}, ce.createFromOptions = function(e, t) {
  return N(ce, e, t);
};
var Xn = class {
  constructor(e, t, r) {
    this.confidenceMasks = e, this.categoryMask = t, this.qualityScores = r;
  }
  close() {
    var e, t;
    (e = this.confidenceMasks) == null || e.forEach((r) => {
      r.close();
    }), (t = this.categoryMask) == null || t.close();
  }
};
function Wh(e) {
  var r, n;
  var t = (function(i) {
    return kt(i, ue, 1);
  })(e.ka()).filter((i) => (ee(B(i, 1)) ?? "").includes("mediapipe.tasks.TensorsToSegmentationCalculator"));
  if (e.v = [], t.length > 1) throw Error("The graph has more than one mediapipe.tasks.TensorsToSegmentationCalculator.");
  t.length === 1 && (((n = (r = M(t[0], ge, 7)) == null ? void 0 : r.u()) == null ? void 0 : n.h()) ?? /* @__PURE__ */ new Map()).forEach((i, s) => {
    e.v[Number(s)] = ee(B(i, 1)) ?? "";
  });
}
function oa(e) {
  e.categoryMask = void 0, e.confidenceMasks = void 0, e.qualityScores = void 0;
}
function ha(e) {
  try {
    let t = new Xn(e.confidenceMasks, e.categoryMask, e.qualityScores);
    if (!e.m) return t;
    e.m(t);
  } finally {
    pn(e);
  }
}
Xn.prototype.close = Xn.prototype.close;
var se = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !1), this.v = [], this.outputCategoryMask = !1, this.outputConfidenceMasks = !0, this.i = new Pi(), this.C = new a2(), y(this.i, 0, 3, this.C), y(e = this.i, 0, 1, t = new V());
  }
  D() {
    return "ImageSegmenter";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return e.displayNamesLocale !== void 0 ? k(this.i, 2, Ve(e.displayNamesLocale)) : "displayNamesLocale" in e && k(this.i, 2), "outputCategoryMask" in e && (this.outputCategoryMask = e.outputCategoryMask ?? !1), "outputConfidenceMasks" in e && (this.outputConfidenceMasks = e.outputConfidenceMasks ?? !0), super.l(e);
  }
  M() {
    Wh(this);
  }
  segment(e, t, r) {
    var n = typeof t != "function" ? t : {};
    return this.m = typeof t == "function" ? t : r, oa(this), Te(this, e, n), ha(this);
  }
  fb(e, t, r, n) {
    var i = typeof r != "function" ? r : {};
    return this.m = typeof r == "function" ? r : n, oa(this), De(this, e, i, t), ha(this);
  }
  Sa() {
    return this.v;
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect");
    var t = new ge();
    Pe(t, h2, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.image_segmenter.ImageSegmenterGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), r.A(t), be(e, r), dn(this, e), this.outputConfidenceMasks && (C(e, "confidence_masks"), F(r, "CONFIDENCE_MASKS:confidence_masks"), Bt(this, "confidence_masks"), this.h.ia("confidence_masks", (n, i) => {
      this.confidenceMasks = n.map((s) => Ut(this, s, !0, !this.m)), m(this, i);
    }), this.h.attachEmptyPacketListener("confidence_masks", (n) => {
      this.confidenceMasks = [], m(this, n);
    })), this.outputCategoryMask && (C(e, "category_mask"), F(r, "CATEGORY_MASK:category_mask"), Bt(this, "category_mask"), this.h.ha("category_mask", (n, i) => {
      this.categoryMask = Ut(this, n, !1, !this.m), m(this, i);
    }), this.h.attachEmptyPacketListener("category_mask", (n) => {
      this.categoryMask = void 0, m(this, n);
    })), C(e, "quality_scores"), F(r, "QUALITY_SCORES:quality_scores"), this.h.attachFloatVectorListener("quality_scores", (n, i) => {
      this.qualityScores = n, m(this, i);
    }), this.h.attachEmptyPacketListener("quality_scores", (n) => {
      this.categoryMask = void 0, m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
se.prototype.getLabels = se.prototype.Sa, se.prototype.segmentForVideo = se.prototype.fb, se.prototype.segment = se.prototype.segment, se.prototype.setOptions = se.prototype.A, se.createFromModelPath = function(e, t) {
  return N(se, e, { baseOptions: { modelAssetPath: t } });
}, se.createFromModelBuffer = function(e, t) {
  return N(se, e, { baseOptions: { modelAssetBuffer: t } });
}, se.createFromOptions = function(e, t) {
  return N(se, e, t);
};
var zh = { 0: 0, 1: 1, 2: 2, 3: 3 };
function kn() {
  return Di() ? void 0 : document.createElement("canvas");
}
var ae = class extends Kr {
  constructor(e, t) {
    super(new jh(e, t)), this.v = new Ui(), this.delegate = "CPU", this.i = 0, this.baseOptions = new V(), this.C = this.m = 0;
  }
  D() {
    return "InteractiveSegmenter";
  }
  get j() {
    return this.h.j;
  }
  A(e) {
    var t;
    return this.delegate = ((t = e.baseOptions) == null ? void 0 : t.delegate) ?? "CPU", super.l(e);
  }
  gb(e) {
    if (this.i === 0) throw Error("Segmenter is not initialized.");
    var t;
    if (this.m !== 0 && (this.j._free(this.m), this.m = 0), !(t = typeof ImageData < "u" && e instanceof ImageData)) if (typeof e != "object" || e === null) t = !1;
    else {
      t = e.data;
      var r = e.width, n = e.height;
      t = Number.isInteger(r) && r > 0 && Number.isInteger(n) && n > 0 && (t instanceof Uint8ClampedArray || t instanceof Uint8Array);
    }
    if (t) t = e.width, r = e.height, e = e.data;
    else {
      if ([t, r] = Bi(e), typeof OffscreenCanvas < "u") n = new OffscreenCanvas(t, r);
      else {
        if (typeof document > "u") throw Error("Canvas is not supported in this environment.");
        n = document.createElement("canvas");
      }
      if (n.width = t, n.height = r, !(n = n.getContext("2d"))) throw Error("Canvas 2D context is not supported in this environment.");
      n.drawImage(e, 0, 0), e = n.getImageData(0, 0, t, r).data;
    }
    if (!e) throw Error("Unsupported image source or failed to extract image pixels.");
    n = (function({ Xa: s, width: a, height: o }) {
      if (a <= 0 || o <= 0) throw Error(`Invalid image dimensions: ${a}x${o}. Dimensions must be positive.`);
      if (s % (a * o) !== 0) throw Error(`Invalid image dimensions or pixel data length. Pixel data length ${s} is not a multiple of the number of pixels (${a * o}).`);
      if ((s /= a * o) !== 4 && s !== 3 && s !== 1) throw Error(`Invalid image dimensions or pixel data length. Calculated channels: ${s}. Expected 1, 3, or 4.`);
      return s;
    })({ Xa: e.length, width: t, height: r });
    var i = this.j._malloc(e.length);
    if (this.j.HEAPU8.set(e, i), this.m = i, !this.j._interactive_segmenter_set_image(this.i, i, t, r, n)) throw Error("Failed to set image on native engine.");
  }
  segment(e) {
    var u;
    if (this.i === 0) throw Error("Segmenter is not initialized.");
    var t = (function(l) {
      l = l.map(({ isCompleted: A, brushMode: E, point: R }) => {
        E = zh[E] ?? 0, R = R.map(({ x: Be, y: qt }) => {
          var Lt = new Ah();
          return It(Lt, 1, Be), It(Lt, 2, qt), Lt;
        });
        var U = new wh();
        return xn(U, A), lr(U, 1, Ke(E), 0), Mn(U, 2, R), U;
      });
      var p = new Eh();
      return Mn(p, 1, l), bh(p);
    })(e);
    e = this.j._malloc(t.length), this.j.HEAPU8.set(t, e);
    var r = this.j._malloc(12), n = r + 4, i = r + 8, s = 0, a = this.C++;
    try {
      if (this.o) if (this.delegate === "GPU") {
        var o = this.o;
        ++o.h.U, o.i.set(a, performance.now());
      } else {
        var h = this.o;
        ++h.h.R, h.i.set(a, performance.now());
      }
      if ((s = this.j._interactive_segmenter_segment(this.i, e, t.length, r, n, i)) === 0) throw Error("Segmentation failed.");
      (u = this.o) == null || u.Aa(a);
      let l = this.j.HEAPU32[r / 4], p = this.j.HEAPU32[n / 4], A = new Float32Array(this.j.HEAPU8.buffer, s, this.j.HEAPU32[i / 4] / 4);
      var f = new Float32Array(A);
      if (o = l * p, (f instanceof Uint8Array || f instanceof Float32Array) && f.length !== o) throw Error("Unsupported channel count: " + f.length / o);
      return new q([f], !0, !1, this.h.j.canvas ?? void 0, this.v, l, p);
    } finally {
      e !== 0 && this.j._free(e), r !== 0 && this.j._free(r), s !== 0 && this.j._free(s);
    }
  }
  u() {
    var r, n;
    this.i !== 0 && ((r = this.o) == null || r.ya(), this.j._interactive_segmenter_close(this.i), this.i = 0), this.m !== 0 && (this.j._free(this.m), this.m = 0);
    var e = new Gr();
    if (this.delegate === "GPU") {
      var t = new xo();
      ke(e, 2, He, t);
    } else Ce(t = new z1(), 1, 4), ke(e, 1, He, t);
    if (y(this.baseOptions, 0, 3, e), e = uh(this.baseOptions), t = this.j._malloc(e.length), this.j.HEAPU8.set(e, t), this.i = this.j._interactive_segmenter_create(t, e.length), this.j._free(t), this.i === 0) throw Error("Failed to create native InteractiveSegmenter engine.");
    (n = this.o) == null || n.za();
  }
  close() {
    this.i !== 0 && (this.j._interactive_segmenter_close(this.i), this.i = 0), this.m !== 0 && (this.j._free(this.m), this.m = 0), this.v.close(), super.close();
  }
};
ae.prototype.close = ae.prototype.close, ae.prototype.segment = ae.prototype.segment, ae.prototype.setImage = ae.prototype.gb, ae.prototype.setOptions = ae.prototype.A, ae.createFromModelPath = function(e, t) {
  return Ir(ae, kn(), e, { baseOptions: { modelAssetPath: t } });
}, ae.createFromModelBuffer = function(e, t) {
  return Ir(ae, kn(), e, { baseOptions: { modelAssetBuffer: t } });
}, ae.createFromOptions = function(e, t) {
  var r = t.canvas ?? kn();
  return Ir(ae, r, e, t);
};
var qn = class {
  constructor(e, t, r) {
    this.confidenceMasks = e, this.categoryMask = t, this.qualityScores = r;
  }
  close() {
    var e, t;
    (e = this.confidenceMasks) == null || e.forEach((r) => {
      r.close();
    }), (t = this.categoryMask) == null || t.close();
  }
};
qn.prototype.close = qn.prototype.close;
var Fe = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect_in", !1), this.outputCategoryMask = !1, this.outputConfidenceMasks = !0, this.i = new Pi(), this.v = new a2(), y(this.i, 0, 3, this.v), y(e = this.i, 0, 1, t = new V());
  }
  D() {
    return "InteractiveSegmenterLegacy";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return "outputCategoryMask" in e && (this.outputCategoryMask = e.outputCategoryMask ?? !1), "outputConfidenceMasks" in e && (this.outputConfidenceMasks = e.outputConfidenceMasks ?? !0), super.l(e);
  }
  segment(e, t, r, n) {
    var i = typeof r != "function" ? r : {};
    if (this.m = typeof r == "function" ? r : n, this.qualityScores = this.categoryMask = this.confidenceMasks = void 0, r = this.J + 1, n = new u2(), t.keypoint && t.scribble) throw Error("Cannot provide both keypoint and scribble.");
    if (t.keypoint) {
      var s = new En();
      xn(s, !0), It(s, 1, t.keypoint.x), It(s, 2, t.keypoint.y), ke(n, 1, Bn, s);
    } else {
      if (!t.scribble) throw Error("Must provide either a keypoint or a scribble.");
      {
        let o = new kh();
        for (s of t.scribble) xn(t = new En(), !0), It(t, 1, s.x), It(t, 2, s.y), sr(o, 1, En, t);
        ke(n, 2, Bn, o);
      }
    }
    this.h.addProtoToStream(n.h(), "mediapipe.tasks.vision.interactive_segmenter_legacy.proto.RegionOfInterest", "roi_in", r), Te(this, e, i);
    e: {
      try {
        let o = new qn(this.confidenceMasks, this.categoryMask, this.qualityScores);
        if (!this.m) {
          var a = o;
          break e;
        }
        this.m(o);
      } finally {
        pn(this);
      }
      a = void 0;
    }
    return a;
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "roi_in"), G(e, "norm_rect_in");
    var t = new ge();
    Pe(t, h2, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.interactive_segmenter_legacy.InteractiveSegmenterLegacyGraph"), j(r, "IMAGE:image_in"), j(r, "ROI:roi_in"), j(r, "NORM_RECT:norm_rect_in"), r.A(t), be(e, r), dn(this, e), this.outputConfidenceMasks && (C(e, "confidence_masks"), F(r, "CONFIDENCE_MASKS:confidence_masks"), Bt(this, "confidence_masks"), this.h.ia("confidence_masks", (n, i) => {
      this.confidenceMasks = n.map((s) => Ut(this, s, !0, !this.m)), m(this, i);
    }), this.h.attachEmptyPacketListener("confidence_masks", (n) => {
      this.confidenceMasks = [], m(this, n);
    })), this.outputCategoryMask && (C(e, "category_mask"), F(r, "CATEGORY_MASK:category_mask"), Bt(this, "category_mask"), this.h.ha("category_mask", (n, i) => {
      this.categoryMask = Ut(this, n, !1, !this.m), m(this, i);
    }), this.h.attachEmptyPacketListener("category_mask", (n) => {
      this.categoryMask = void 0, m(this, n);
    })), C(e, "quality_scores"), F(r, "QUALITY_SCORES:quality_scores"), this.h.attachFloatVectorListener("quality_scores", (n, i) => {
      this.qualityScores = n, m(this, i);
    }), this.h.attachEmptyPacketListener("quality_scores", (n) => {
      this.categoryMask = void 0, m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
Fe.prototype.segment = Fe.prototype.segment, Fe.prototype.setOptions = Fe.prototype.A, Fe.createFromModelPath = function(e, t) {
  return N(Fe, e, { baseOptions: { modelAssetPath: t } });
}, Fe.createFromModelBuffer = function(e, t) {
  return N(Fe, e, { baseOptions: { modelAssetBuffer: t } });
}, Fe.createFromOptions = function(e, t) {
  return N(Fe, e, t);
};
var le = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "input_frame_gpu", "norm_rect", !1), this.m = { detections: [] }, y(e = this.i = new c2(), 0, 1, t = new V());
  }
  D() {
    return "ObjectDetector";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return e.displayNamesLocale !== void 0 ? k(this.i, 2, Ve(e.displayNamesLocale)) : "displayNamesLocale" in e && k(this.i, 2), e.maxResults !== void 0 ? Ce(this.i, 3, e.maxResults) : "maxResults" in e && k(this.i, 3), e.scoreThreshold !== void 0 ? w(this.i, 4, e.scoreThreshold) : "scoreThreshold" in e && k(this.i, 4), e.categoryAllowlist !== void 0 ? xr(this.i, 5, e.categoryAllowlist) : "categoryAllowlist" in e && k(this.i, 5), e.categoryDenylist !== void 0 ? xr(this.i, 6, e.categoryDenylist) : "categoryDenylist" in e && k(this.i, 6), this.l(e);
  }
  H(e, t) {
    return this.m = { detections: [] }, Te(this, e, t), this.m;
  }
  I(e, t, r) {
    return this.m = { detections: [] }, De(this, e, r, t), this.m;
  }
  u() {
    var e = new _e();
    G(e, "input_frame_gpu"), G(e, "norm_rect"), C(e, "detections");
    var t = new ge();
    Pe(t, Sh, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.ObjectDetectorGraph"), j(r, "IMAGE:input_frame_gpu"), j(r, "NORM_RECT:norm_rect"), F(r, "DETECTIONS:detections"), r.A(t), be(e, r), this.h.attachProtoVectorListener("detections", (n, i) => {
      for (let s of n) n = Ho(s), this.m.detections.push(d2(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("detections", (n) => {
      m(this, n);
    }), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
le.prototype.detectForVideo = le.prototype.I, le.prototype.detect = le.prototype.H, le.prototype.setOptions = le.prototype.A, le.createFromModelPath = async function(e, t) {
  return N(le, e, { baseOptions: { modelAssetPath: t } });
}, le.createFromModelBuffer = function(e, t) {
  return N(le, e, { baseOptions: { modelAssetBuffer: t } });
}, le.createFromOptions = function(e, t) {
  return N(le, e, t);
};
var Jn = class {
  constructor(e, t, r) {
    this.landmarks = e, this.worldLandmarks = t, this.segmentationMasks = r;
  }
  close() {
    var e;
    (e = this.segmentationMasks) == null || e.forEach((t) => {
      t.close();
    });
  }
};
function ua(e) {
  e.landmarks = [], e.worldLandmarks = [], e.segmentationMasks = void 0;
}
function ca(e) {
  try {
    let t = new Jn(e.landmarks, e.worldLandmarks, e.segmentationMasks);
    if (!e.v) return t;
    e.v(t);
  } finally {
    pn(e);
  }
}
Jn.prototype.close = Jn.prototype.close;
var oe = class extends me {
  constructor(e, t) {
    super(new Le(e, t), "image_in", "norm_rect", !1), this.landmarks = [], this.worldLandmarks = [], this.outputSegmentationMasks = !1, y(e = this.i = new l2(), 0, 1, t = new V()), this.C = new r2(), y(this.i, 0, 3, this.C), this.m = new t2(), y(this.i, 0, 2, this.m), Ce(this.m, 4, 1), w(this.m, 2, 0.5), w(this.C, 2, 0.5), w(this.i, 4, 0.5);
  }
  D() {
    return "PoseLandmarker";
  }
  get baseOptions() {
    return M(this.i, V, 1);
  }
  set baseOptions(e) {
    y(this.i, 0, 1, e);
  }
  A(e) {
    return "numPoses" in e && Ce(this.m, 4, e.numPoses ?? 1), "minPoseDetectionConfidence" in e && w(this.m, 2, e.minPoseDetectionConfidence ?? 0.5), "minTrackingConfidence" in e && w(this.i, 4, e.minTrackingConfidence ?? 0.5), "minPosePresenceConfidence" in e && w(this.C, 2, e.minPosePresenceConfidence ?? 0.5), "outputSegmentationMasks" in e && (this.outputSegmentationMasks = e.outputSegmentationMasks ?? !1), this.l(e);
  }
  H(e, t, r) {
    var n = typeof t != "function" ? t : {};
    return this.v = typeof t == "function" ? t : r, ua(this), Te(this, e, n), ca(this);
  }
  I(e, t, r, n) {
    var i = typeof r != "function" ? r : {};
    return this.v = typeof r == "function" ? r : n, ua(this), De(this, e, i, t), ca(this);
  }
  u() {
    var e = new _e();
    G(e, "image_in"), G(e, "norm_rect"), C(e, "normalized_landmarks"), C(e, "world_landmarks"), C(e, "segmentation_masks");
    var t = new ge();
    Pe(t, Lh, this.i);
    var r = new ue();
    pe(r, 2, "mediapipe.tasks.vision.pose_landmarker.PoseLandmarkerGraph"), j(r, "IMAGE:image_in"), j(r, "NORM_RECT:norm_rect"), F(r, "NORM_LANDMARKS:normalized_landmarks"), F(r, "WORLD_LANDMARKS:world_landmarks"), r.A(t), be(e, r), dn(this, e), this.h.attachProtoVectorListener("normalized_landmarks", (n, i) => {
      this.landmarks = [];
      for (let s of n) n = _r(s), this.landmarks.push(vr(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("normalized_landmarks", (n) => {
      this.landmarks = [], m(this, n);
    }), this.h.attachProtoVectorListener("world_landmarks", (n, i) => {
      this.worldLandmarks = [];
      for (let s of n) n = Ot(s), this.worldLandmarks.push(Mt(n));
      m(this, i);
    }), this.h.attachEmptyPacketListener("world_landmarks", (n) => {
      this.worldLandmarks = [], m(this, n);
    }), this.outputSegmentationMasks && (F(r, "SEGMENTATION_MASK:segmentation_masks"), Bt(this, "segmentation_masks"), this.h.ia("segmentation_masks", (n, i) => {
      this.segmentationMasks = n.map((s) => Ut(this, s, !0, !this.v)), m(this, i);
    }), this.h.attachEmptyPacketListener("segmentation_masks", (n) => {
      this.segmentationMasks = [], m(this, n);
    })), e = e.h(), this.setGraph(new Uint8Array(e), !0);
  }
};
oe.prototype.detectForVideo = oe.prototype.I, oe.prototype.detect = oe.prototype.H, oe.prototype.setOptions = oe.prototype.A, oe.createFromModelPath = function(e, t) {
  return N(oe, e, { baseOptions: { modelAssetPath: t } });
}, oe.createFromModelBuffer = function(e, t) {
  return N(oe, e, { baseOptions: { modelAssetBuffer: t } });
}, oe.createFromOptions = function(e, t) {
  return N(oe, e, t);
}, oe.POSE_CONNECTIONS = O2, D("module$exports$google3$third_party$mediapipe$tasks$web$vision$pose_landmarker$pose_landmarker.PoseLandmarker.POSE_CONNECTIONS", oe.POSE_CONNECTIONS);
let lt, Sn = !1;
self.onmessage = async ({ data: e }) => {
  var n, i;
  const { id: t, type: r } = e;
  if (Sn) {
    (n = e.bitmap) == null || n.close(), self.postMessage({ id: t, error: "检测任务正在处理中" });
    return;
  }
  Sn = !0;
  try {
    if (r === "init") {
      const s = await je.forVisionTasks(e.wasmPath, !0);
      lt = await le.createFromOptions(s, {
        baseOptions: { modelAssetPath: e.modelPath, delegate: "CPU" },
        runningMode: "IMAGE",
        scoreThreshold: 0.45,
        maxResults: 8
      }), self.postMessage({ id: t, ready: !0 });
    } else if (r === "detect") {
      if (!lt) throw new Error("识物模型尚未准备好");
      const s = performance.now(), a = lt.detect(e.bitmap);
      self.postMessage({ id: t, detections: a.detections, inferenceMs: performance.now() - s });
    } else r === "close" && (lt == null || lt.close(), lt = void 0, self.postMessage({ id: t, closed: !0 }));
  } catch (s) {
    self.postMessage({ id: t, error: (s == null ? void 0 : s.message) || String(s) });
  } finally {
    (i = e.bitmap) == null || i.close(), Sn = !1;
  }
};
