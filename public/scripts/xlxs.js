/* xlsx.js (C) 2013 SheetJS -- http://sheetjs.com */
/* vim: set ts=2: */
/*jshint eqnull:true */
/* Spreadsheet Format -- jump to XLSX for the XLSX code */
/* ssf.js (C) 2013 SheetJS -- http://sheetjs.com */
"use strict";

var SSF = {};
var make_ssf = function make_ssf(SSF) {
	String.prototype.reverse = function () {
		return this.split("").reverse().join("");
	};
	var _strrev = function _strrev(x) {
		return String(x).reverse();
	};
	function fill(c, l) {
		return new Array(l + 1).join(c);
	}
	function pad(v, d, c) {
		var t = String(v);return t.length >= d ? t : fill(c || 0, d - t.length) + t;
	}
	function rpad(v, d, c) {
		var t = String(v);return t.length >= d ? t : t + fill(c || 0, d - t.length);
	}
	/* Options */
	var opts_fmt = {};
	function fixopts(o) {
		for (var y in opts_fmt) if (o[y] === undefined) o[y] = opts_fmt[y];
	}
	SSF.opts = opts_fmt;
	opts_fmt.date1904 = 0;
	opts_fmt.output = "";
	opts_fmt.mode = "";
	var table_fmt = {
		1: '0',
		2: '0.00',
		3: '#,##0',
		4: '#,##0.00',
		9: '0%',
		10: '0.00%',
		11: '0.00E+00',
		12: '# ?/?',
		13: '# ??/??',
		14: 'm/d/yy',
		15: 'd-mmm-yy',
		16: 'd-mmm',
		17: 'mmm-yy',
		18: 'h:mm AM/PM',
		19: 'h:mm:ss AM/PM',
		20: 'h:mm',
		21: 'h:mm:ss',
		22: 'm/d/yy h:mm',
		37: '#,##0 ;(#,##0)',
		38: '#,##0 ;[Red](#,##0)',
		39: '#,##0.00;(#,##0.00)',
		40: '#,##0.00;[Red](#,##0.00)',
		45: 'mm:ss',
		46: '[h]:mm:ss',
		47: 'mmss.0',
		48: '##0.0E+0',
		49: '@'
	};
	var days = [['Sun', 'Sunday'], ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday']];
	var months = [['J', 'Jan', 'January'], ['F', 'Feb', 'February'], ['M', 'Mar', 'March'], ['A', 'Apr', 'April'], ['M', 'May', 'May'], ['J', 'Jun', 'June'], ['J', 'Jul', 'July'], ['A', 'Aug', 'August'], ['S', 'Sep', 'September'], ['O', 'Oct', 'October'], ['N', 'Nov', 'November'], ['D', 'Dec', 'December']];
	var frac = function frac(x, D, mixed) {
		var sgn = x < 0 ? -1 : 1;
		var B = x * sgn;
		var P_2 = 0,
		    P_1 = 1,
		    P = 0;
		var Q_2 = 1,
		    Q_1 = 0,
		    Q = 0;
		var A = B | 0;
		while (Q_1 < D) {
			A = B | 0;
			P = A * P_1 + P_2;
			Q = A * Q_1 + Q_2;
			if (B - A < 0.0000000001) break;
			B = 1 / (B - A);
			P_2 = P_1;P_1 = P;
			Q_2 = Q_1;Q_1 = Q;
		}
		if (Q > D) {
			Q = Q_1;P = P_1;
		}
		if (Q > D) {
			Q = Q_2;P = P_2;
		}
		if (!mixed) return [0, sgn * P, Q];
		var q = Math.floor(sgn * P / Q);
		return [q, sgn * P - q * Q, Q];
	};
	var general_fmt = function general_fmt(v) {
		if (typeof v === 'boolean') return v ? "TRUE" : "FALSE";
		if (typeof v === 'number') {
			var o,
			    V = v < 0 ? -v : v;
			if (V >= 0.1 && V < 1) o = v.toPrecision(9);else if (V >= 0.01 && V < 0.1) o = v.toPrecision(8);else if (V >= 0.001 && V < 0.01) o = v.toPrecision(7);else if (V >= 0.0001 && V < 0.001) o = v.toPrecision(6);else if (V >= Math.pow(10, 10) && V < Math.pow(10, 11)) o = v.toFixed(10).substr(0, 12);else if (V > Math.pow(10, -9) && V < Math.pow(10, 11)) {
				o = v.toFixed(12).replace(/(\.[0-9]*[1-9])0*$/, "$1").replace(/\.$/, "");
				if (o.length > 11 + (v < 0 ? 1 : 0)) o = v.toPrecision(10);
				if (o.length > 11 + (v < 0 ? 1 : 0)) o = v.toExponential(5);
			} else {
				o = v.toFixed(11).replace(/(\.[0-9]*[1-9])0*$/, "$1");
				if (o.length > 11 + (v < 0 ? 1 : 0)) o = v.toPrecision(6);
			}
			o = o.replace(/(\.[0-9]*[1-9])0+e/, "$1e").replace(/\.0*e/, "e");
			return o.replace("e", "E").replace(/\.0*$/, "").replace(/\.([0-9]*[^0])0*$/, ".$1").replace(/(E[+-])([0-9])$/, "$1" + "0" + "$2");
		}
		if (typeof v === 'string') return v;
		throw "unsupported value in General format: " + v;
	};
	SSF._general = general_fmt;
	var parse_date_code = function parse_date_code(v, opts) {
		var date = Math.floor(v),
		    time = Math.round(86400 * (v - date)),
		    dow = 0;
		var dout = [],
		    out = { D: date, T: time, u: 86400 * (v - date) - time };fixopts(opts = opts || {});
		if (opts.date1904) date += 1462;
		if (date === 60) {
			dout = [1900, 2, 29];dow = 3;
		} else if (date === 0) {
			dout = [1900, 1, 0];dow = 6;
		} else {
			if (date > 60) --date;
			/* 1 = Jan 1 1900 */
			var d = new Date(1900, 0, 1);
			d.setDate(d.getDate() + date - 1);
			dout = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
			dow = d.getDay();
			if (opts.mode === 'excel' && date < 60) dow = (dow + 6) % 7;
		}
		out.y = dout[0];out.m = dout[1];out.d = dout[2];
		out.S = time % 60;time = Math.floor(time / 60);
		out.M = time % 60;time = Math.floor(time / 60);
		out.H = time;
		out.q = dow;
		return out;
	};
	SSF.parse_date_code = parse_date_code;
	var write_date = function write_date(type, fmt, val) {
		if (val < 0) return "";
		switch (type) {
			case 'y':
				switch (fmt) {/* year */
					case 'y':case 'yy':
						return pad(val.y % 100, 2);
					default:
						return val.y;
				}break;
			case 'm':
				switch (fmt) {/* month */
					case 'm':
						return val.m;
					case 'mm':
						return pad(val.m, 2);
					case 'mmm':
						return months[val.m - 1][1];
					case 'mmmm':
						return months[val.m - 1][2];
					case 'mmmmm':
						return months[val.m - 1][0];
					default:
						throw 'bad month format: ' + fmt;
				}break;
			case 'd':
				switch (fmt) {/* day */
					case 'd':
						return val.d;
					case 'dd':
						return pad(val.d, 2);
					case 'ddd':
						return days[val.q][0];
					case 'dddd':
						return days[val.q][1];
					default:
						throw 'bad day format: ' + fmt;
				}break;
			case 'h':
				switch (fmt) {/* 12-hour */
					case 'h':
						return 1 + (val.H + 11) % 12;
					case 'hh':
						return pad(1 + (val.H + 11) % 12, 2);
					default:
						throw 'bad hour format: ' + fmt;
				}break;
			case 'H':
				switch (fmt) {/* 24-hour */
					case 'h':
						return val.H;
					case 'hh':
						return pad(val.H, 2);
					default:
						throw 'bad hour format: ' + fmt;
				}break;
			case 'M':
				switch (fmt) {/* minutes */
					case 'm':
						return val.M;
					case 'mm':
						return pad(val.M, 2);
					default:
						throw 'bad minute format: ' + fmt;
				}break;
			case 's':
				switch (fmt) {/* seconds */
					case 's':
						return val.S;
					case 'ss':
						return pad(val.S, 2);
					case 'ss.0':
						return pad(val.S, 2) + "." + Math.round(10 * val.u);
					default:
						throw 'bad second format: ' + fmt;
				}break;
			case 'Z':
				switch (fmt) {
					case '[h]':
						return val.D * 24 + val.H;
					default:
						throw 'bad abstime format: ' + fmt;
				}break;
			/* TODO: handle the ECMA spec format ee -> yy */
			case 'e':
				{
					return val.y;
				}break;
			case 'A':
				return (val.h >= 12 ? 'P' : 'A') + fmt.substr(1);
			default:
				throw 'bad format type ' + type + ' in ' + fmt;
		}
	};
	String.prototype.reverse = function () {
		return this.split("").reverse().join("");
	};
	var commaify = function commaify(s) {
		return s.reverse().replace(/.../g, "$&,").reverse().replace(/^,/, "");
	};
	var write_num = function write_num(_x, _x2, _x3) {
		var _again = true;

		_function: while (_again) {
			var type = _x,
			    fmt = _x2,
			    val = _x3;
			_again = false;

			if (type === '(') {
				var ffmt = fmt.replace(/\( */, "").replace(/ \)/, "").replace(/\)/, "");
				if (val >= 0) {
					_x = 'n';
					_x2 = ffmt;
					_x3 = val;
					_again = true;
					ffmt = undefined;
					continue _function;
				}
				return '(' + write_num('n', ffmt, -val) + ')';
			}
			var mul = 0,
			    o;
			fmt = fmt.replace(/%/g, function (x) {
				mul++;return "";
			});
			if (mul !== 0) return write_num(type, fmt, val * Math.pow(10, 2 * mul)) + fill("%", mul);
			if (fmt.indexOf("E") > -1) {
				var idx = fmt.indexOf("E") - fmt.indexOf(".") - 1;
				if (fmt == '##0.0E+0') {
					var ee = Number(val.toExponential(0).substr(3)) % 3;
					o = (val / Math.pow(10, ee % 3)).toPrecision(idx + 1 + ee % 3).replace(/^([+-]?)([0-9]*)\.([0-9]*)[Ee]/, function ($$, $1, $2, $3) {
						return $1 + $2 + $3.substr(0, ee) + "." + $3.substr(ee) + "E";
					});
				} else o = val.toExponential(idx);
				if (fmt.match(/E\+00$/) && o.match(/e[+-][0-9]$/)) o = o.substr(0, o.length - 1) + "0" + o[o.length - 1];
				if (fmt.match(/E\-/) && o.match(/e\+/)) o = o.replace(/e\+/, "e");
				return o.replace("e", "E");
			}
			if (fmt[0] === "$") return "$" + write_num(type, fmt.substr(fmt[1] == ' ' ? 2 : 1), val);
			var r,
			    ff,
			    aval = val < 0 ? -val : val,
			    sign = val < 0 ? "-" : "";
			if (r = fmt.match(/# (\?+) \/ (\d+)/)) {
				var den = Number(r[2]),
				    rnd = Math.round(aval * den),
				    base = Math.floor(rnd / den);
				var myn = rnd - base * den,
				    myd = den;
				return sign + (base ? base : "") + " " + (myn === 0 ? fill(" ", r[1].length + 1 + r[2].length) : pad(myn, r[1].length, " ") + "/" + pad(myd, r[2].length));
			}
			if (fmt.match(/^00*$/)) return (val < 0 ? "-" : "") + pad(Math.round(Math.abs(val)), fmt.length);
			if (fmt.match(/^####*$/)) return "dafuq";
			switch (fmt) {
				case "0":
					return Math.round(val);
				case "0.0":
					o = Math.round(val * 10);
					return String(o / 10).replace(/^([^\.]+)$/, "$1.0").replace(/\.$/, ".0");
				case "0.00":
					o = Math.round(val * 100);
					return String(o / 100).replace(/^([^\.]+)$/, "$1.00").replace(/\.$/, ".00").replace(/\.([0-9])$/, ".$1" + "0");
				case "0.000":
					o = Math.round(val * 1000);
					return String(o / 1000).replace(/^([^\.]+)$/, "$1.000").replace(/\.$/, ".000").replace(/\.([0-9])$/, ".$1" + "00").replace(/\.([0-9][0-9])$/, ".$1" + "0");
				case "#,##0":
					return sign + commaify(String(Math.round(aval)));
				case "#,##0.0":
					r = Math.round((val - Math.floor(val)) * 10);return val < 0 ? "-" + write_num(type, fmt, -val) : commaify(String(Math.floor(val))) + "." + r;
				case "#,##0.00":
					r = Math.round((val - Math.floor(val)) * 100);return val < 0 ? "-" + write_num(type, fmt, -val) : commaify(String(Math.floor(val))) + "." + (r < 10 ? "0" + r : r);
				case "# ? / ?":
					ff = frac(aval, 9, true);return sign + (ff[0] || "") + " " + (ff[1] === 0 ? "   " : ff[1] + "/" + ff[2]);
				case "# ?? / ??":
					ff = frac(aval, 99, true);return sign + (ff[0] || "") + " " + (ff[1] ? pad(ff[1], 2, " ") + "/" + rpad(ff[2], 2, " ") : "     ");
				case "# ??? / ???":
					ff = frac(aval, 999, true);return sign + (ff[0] || "") + " " + (ff[1] ? pad(ff[1], 3, " ") + "/" + rpad(ff[2], 3, " ") : "       ");
				default:
			}
			throw new Error("unsupported format |" + fmt + "|");
		}
	};
	function split_fmt(fmt) {
		var out = [];
		var in_str = -1;
		for (var i = 0, j = 0; i < fmt.length; ++i) {
			if (in_str != -1) {
				if (fmt[i] == '"') in_str = -1;continue;
			}
			if (fmt[i] == "_" || fmt[i] == "*" || fmt[i] == "\\") {
				++i;continue;
			}
			if (fmt[i] == '"') {
				in_str = i;continue;
			}
			if (fmt[i] != ";") continue;
			out.push(fmt.slice(j, i));
			j = i + 1;
		}
		out.push(fmt.slice(j));
		if (in_str != -1) throw "Format |" + fmt + "| unterminated string at " + in_str;
		return out;
	}
	SSF._split = split_fmt;
	function eval_fmt(fmt, v, opts, flen) {
		var out = [],
		    o = "",
		    i = 0,
		    c = "",
		    lst = 't',
		    q = {},
		    dt;
		fixopts(opts = opts || {});
		var hr = 'H';
		/* Tokenize */
		while (i < fmt.length) {
			switch (c = fmt[i]) {
				case '"':
					/* Literal text */
					for (o = ""; fmt[++i] !== '"' && i < fmt.length;) o += fmt[i];
					out.push({ t: 't', v: o });++i;break;
				case '\\':
					var w = fmt[++i],
					    t = "()".indexOf(w) === -1 ? 't' : w;
					out.push({ t: t, v: w });++i;break;
				case '_':
					out.push({ t: 't', v: " " });i += 2;break;
				case '@':
					/* Text Placeholder */
					out.push({ t: 'T', v: v });++i;break;
				/* Dates */
				case 'm':case 'd':case 'y':case 'h':case 's':case 'e':
					if (v < 0) return "";
					if (!dt) dt = parse_date_code(v, opts);
					o = fmt[i];while (fmt[++i] === c) o += c;
					if (c === 's' && fmt[i] === '.' && fmt[i + 1] === '0') {
						o += '.';while (fmt[++i] === '0') o += '0';
					}
					if (c === 'm' && lst.toLowerCase() === 'h') c = 'M'; /* m = minute */
					if (c === 'h') c = hr;
					q = { t: c, v: o };out.push(q);lst = c;break;
				case 'A':
					if (!dt) dt = parse_date_code(v, opts);
					q = { t: c, v: "A" };
					if (fmt.substr(i, 3) === "A/P") {
						q.v = dt.H >= 12 ? "P" : "A";q.t = 'T';hr = 'h';i += 3;
					} else if (fmt.substr(i, 5) === "AM/PM") {
						q.v = dt.H >= 12 ? "PM" : "AM";q.t = 'T';i += 5;hr = 'h';
					} else q.t = "t";
					out.push(q);lst = c;break;
				case '[':
					/* TODO: Fix this -- ignore all conditionals and formatting */
					o = c;
					while (fmt[i++] !== ']') o += fmt[i];
					if (o == "[h]") out.push({ t: 'Z', v: o });
					break;
				/* Numbers */
				case '0':case '#':
					o = c;while ("0#?.,E+-%".indexOf(c = fmt[++i]) > -1) o += c;
					out.push({ t: 'n', v: o });break;
				case '?':
					o = fmt[i];while (fmt[++i] === c) o += c;
					q = { t: c, v: o };out.push(q);lst = c;break;
				case '*':
					++i;if (fmt[i] == ' ') ++i;break; // **
				case '(':case ')':
					out.push({ t: flen === 1 ? 't' : c, v: c });++i;break;
				case '1':case '2':case '3':case '4':case '5':case '6':case '7':case '8':case '9':
					o = fmt[i];while ("0123456789".indexOf(fmt[++i]) > -1) o += fmt[i];
					out.push({ t: 'D', v: o });break;
				case ' ':
					out.push({ t: c, v: c });++i;break;
				default:
					if ("$-+/():!^&'~{}<>=".indexOf(c) === -1) throw 'unrecognized character ' + fmt[i] + ' in ' + fmt;
					out.push({ t: 't', v: c });++i;break;
			}
		}

		/* walk backwards */
		for (i = out.length - 1, lst = 't'; i >= 0; --i) {
			switch (out[i].t) {
				case 'h':case 'H':
					out[i].t = hr;lst = 'h';break;
				case 'd':case 'y':case 's':case 'M':case 'e':
					lst = out[i].t;break;
				case 'm':
					if (lst === 's') out[i].t = 'M';break;
			}
		}

		/* replace fields */
		for (i = 0; i < out.length; ++i) {
			switch (out[i].t) {
				case 't':case 'T':case ' ':
					break;
				case 'd':case 'm':case 'y':case 'h':case 'H':case 'M':case 's':case 'A':case 'e':case 'Z':
					out[i].v = write_date(out[i].t, out[i].v, dt);
					out[i].t = 't';break;
				case 'n':case '(':
					var jj = i + 1;
					while (out[jj] && ("? D".indexOf(out[jj].t) > -1 || out[i].t == '(' && (out[jj].t == ')' || out[jj].t == 'n') || out[jj].t == 't' && (out[jj].v == '/' || out[jj].v == '$' || out[jj].v == ' ' && (out[jj + 1] || {}).t == '?'))) {
						if (out[jj].v !== ' ') out[i].v += ' ' + out[jj].v;
						delete out[jj];++jj;
					}
					out[i].v = write_num(out[i].t, out[i].v, v);
					out[i].t = 't';
					i = jj;break;
				default:
					throw "unrecognized type " + out[i].t;
			}
		}

		return out.map(function (x) {
			return x.v;
		}).join("");
	}
	SSF._eval = eval_fmt;
	function choose_fmt(fmt, v, o) {
		if (typeof fmt === 'number') fmt = table_fmt[fmt];
		if (typeof fmt === "string") fmt = split_fmt(fmt);
		var l = fmt.length;
		switch (fmt.length) {
			case 1:
				fmt = [fmt[0], fmt[0], fmt[0], "@"];break;
			case 2:
				fmt = [fmt[0], fmt[fmt[1] === "@" ? 0 : 1], fmt[0], "@"];break;
			case 4:
				break;
			default:
				throw "cannot find right format for |" + fmt + "|";
		}
		if (typeof v !== "number") return [fmt.length, fmt[3]];
		return [l, v > 0 ? fmt[0] : v < 0 ? fmt[1] : fmt[2]];
	}

	var format = function format(fmt, v, o) {
		fixopts(o = o || {});
		if (fmt === 0) return general_fmt(v, o);
		if (typeof fmt === 'number') fmt = table_fmt[fmt];
		var f = choose_fmt(fmt, v, o);
		return eval_fmt(f[1], v, o, f[0]);
	};

	SSF._choose = choose_fmt;
	SSF._table = table_fmt;
	SSF.load = function (fmt, idx) {
		table_fmt[idx] = fmt;
	};
	SSF.format = format;
};
make_ssf(SSF);
var XLSX = {};
(function (XLSX) {
	function parsexmltag(tag) {
		var words = tag.split(/\s+/);
		var z = { '0': words[0] };
		if (words.length === 1) return z;
		(tag.match(/(\w+)="([^"]*)"/g) || []).map(function (x) {
			var y = x.match(/(\w+)="([^"]*)"/);z[y[1]] = y[2];
		});
		return z;
	}

	var encodings = {
		'&quot;': '"',
		'&apos;': "'",
		'&gt;': '>',
		'&lt;': '<',
		'&amp;': '&'
	};

	// TODO: CP remap (need to read file version to determine OS)
	function unescapexml(text) {
		var s = text + '';
		for (var y in encodings) s = s.replace(new RegExp(y, 'g'), encodings[y]);
		return s.replace(/_x([0-9a-fA-F]*)_/g, function (m, c) {
			return _chr(parseInt(c, 16));
		});
	}

	function parsexmlbool(value, tag) {
		switch (value) {
			case '0':case 0:case 'false':case 'FALSE':
				return false;
			case '1':case 1:case 'true':case 'TRUE':
				return true;
			default:
				throw "bad boolean value " + value + " in " + (tag || "?");
		}
	}

	var utf8read = function utf8read(orig) {
		var out = "",
		    i = 0,
		    c = 0,
		    c1 = 0,
		    c2 = 0,
		    c3 = 0;
		while (i < orig.length) {
			c = orig.charCodeAt(i++);
			if (c < 128) out += _chr(c);else {
				c2 = orig.charCodeAt(i++);
				if (c > 191 && c < 224) out += _chr((c & 31) << 6 | c2 & 63);else {
					c3 = orig.charCodeAt(i++);
					out += _chr((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
				}
			}
		}
		return out;
	};

	// matches <foo>...</foo> extracts content
	function matchtag(f, g) {
		return new RegExp('<' + f + "(?: xml:space=\"preserve\")?>([^☃]*)</" + f + '>', (g || "") + "m");
	}

	function parseVector(data) {
		var h = parsexmltag(data);

		var matches = data.match(new RegExp("<vt:" + h.baseType + ">(.*?)</vt:" + h.baseType + ">", 'g')) || [];
		if (matches.length != h.size) throw "unexpected vector length " + matches.length + " != " + h.size;
		var res = [];
		matches.forEach(function (x) {
			var v = x.replace(/<[/]?vt:variant>/g, "").match(/<vt:([^>]*)>(.*)</);
			res.push({ v: v[2], t: v[1] });
		});
		return res;
	}

	function isval(x) {
		return typeof x !== "undefined" && x !== null;
	}
	/* 18.4 Shared String Table */
	var parse_sst = (function () {
		var tregex = matchtag("t"),
		    rpregex = matchtag("rPr");
		/* Parse a list of <r> tags */
		var parse_rs = (function () {
			/* 18.4.7 rPr CT_RPrElt */
			var parse_rpr = function parse_rpr(rpr, intro, outro) {
				var font = {};
				(rpr.match(/<[^>]*>/g) || []).forEach(function (x) {
					var y = parsexmltag(x);
					switch (y[0]) {
						/* 18.8.12 condense CT_BooleanProperty */
						/* ** not required . */
						case '<condense':
							break;
						/* 18.8.17 extend CT_BooleanProperty */
						/* ** not required . */
						case '<extend':
							break;
						/* 18.8.36 shadow CT_BooleanProperty */
						/* ** not required . */
						case '<shadow':
							break;

						/* 18.4.1 charset CT_IntProperty TODO */
						case '<charset':
							break;

						/* 18.4.2 outline CT_BooleanProperty TODO */
						case '<outline':
							break;

						/* 18.4.5 rFont CT_FontName */
						case '<rFont':
							font.name = y.val;break;

						/* 18.4.11 sz CT_FontSize */
						case '<sz':
							font.sz = y.val;break;

						/* 18.4.10 strike CT_BooleanProperty */
						case '<strike':
							if (!y.val) break;
						/* falls through */
						case '<strike/>':
							font.strike = 1;break;
						case '</strike>':
							break;

						/* 18.4.13 u CT_UnderlineProperty */
						case '<u':
							if (!y.val) break;
						/* falls through */
						case '<u/>':
							font.u = 1;break;
						case '</u>':
							break;

						/* 18.8.2 b */
						case '<b':
							if (!y.val) break;
						/* falls through */
						case '<b/>':
							font.b = 1;break;
						case '</b>':
							break;

						/* 18.8.26 i */
						case '<i':
							if (!y.val) break;
						/* falls through */
						case '<i/>':
							font.i = 1;break;
						case '</i>':
							break;

						/* 18.3.1.15 color CT_Color TODO: tint, theme, auto, indexed */
						case '<color':
							if (y.rgb) font.color = y.rgb.substr(2, 6);
							break;

						/* 18.8.18 family ST_FontFamily */
						case '<family':
							font.family = y.val;break;

						/* 18.4.14 vertAlign CT_VerticalAlignFontProperty TODO */
						case '<vertAlign':
							break;

						/* 18.8.35 scheme CT_FontScheme TODO */
						case '<scheme':
							break;

						default:
							if (y[0][2] !== '/') throw 'Unrecognized rich format ' + y[0];
					}
				});
				/* TODO: These should be generated styles, not inline */
				var style = [];
				if (font.b) style.push("font-weight: bold;");
				if (font.i) style.push("font-style: italic;");
				intro.push('<span style="' + style.join("") + '">');
				outro.push("</span>");
			};

			/* 18.4.4 r CT_RElt */
			function parse_r(r) {
				var terms = [[], "", []];
				/* 18.4.12 t ST_Xstring */
				var t = r.match(tregex);
				if (!isval(t)) return "";
				terms[1] = t[1];

				var rpr = r.match(rpregex);
				if (isval(rpr)) parse_rpr(rpr[1], terms[0], terms[2]);
				return terms[0].join("") + terms[1].replace(/\r\n/g, '<br/>') + terms[2].join("");
			}
			return function (rs) {
				return rs.replace(/<r>/g, "").split(/<\/r>/).map(parse_r).join("");
			};
		})();

		/* 18.4.8 si CT_Rst */
		var parse_si = function parse_si(x) {
			var z = {};
			if (!x) return z;
			var y;
			/* 18.4.12 t ST_Xstring (Plaintext String) */
			if (x[1] === 't') {
				z.t = utf8read(unescapexml(x.replace(/<[^>]*>/g, "")));
				z.raw = x;
				z.r = z.t;
			}
			/* 18.4.4 r CT_RElt (Rich Text Run) */
			else if (y = x.match(/<r>/)) {
					z.raw = x;
					/* TODO: properly parse (note: no other valid child can have body text) */
					z.t = utf8read(unescapexml(x.replace(/<[^>]*>/gm, "")));
					z.r = parse_rs(x);
				}
			/* 18.4.3 phoneticPr CT_PhoneticPr (TODO: needed for Asian support) */
			/* 18.4.6 rPh CT_PhoneticRun (TODO: needed for Asian support) */
			return z;
		};

		return function (data) {
			var s = [];
			/* 18.4.9 sst CT_Sst */
			var sst = data.match(new RegExp("<sst([^>]*)>([\\s\\S]*)<\/sst>", "m"));
			if (isval(sst)) {
				s = sst[2].replace(/<si>/g, "").split(/<\/si>/).map(parse_si);
				sst = parsexmltag(sst[1]);s.Count = sst.count;s.Unique = sst.uniqueCount;
			}
			return s;
		};
	})();

	var ct2type = {
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": "workbooks",
		"application/vnd.openxmlformats-package.core-properties+xml": "coreprops",
		"application/vnd.openxmlformats-officedocument.extended-properties+xml": "extprops",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml": "calcchains",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": "sheets",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml": "strs",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": "styles",
		"application/vnd.openxmlformats-officedocument.theme+xml": "themes",
		"foo": "bar"
	};

	/* 18.2.28 (CT_WorkbookProtection) Defaults */
	var WBPropsDef = {
		allowRefreshQuery: '0',
		autoCompressPictures: '1',
		backupFile: '0',
		checkCompatibility: '0',
		codeName: '',
		date1904: '0',
		dateCompatibility: '1',
		//defaultThemeVersion: '0',
		filterPrivacy: '0',
		hidePivotFieldList: '0',
		promptedSolutions: '0',
		publishItems: '0',
		refreshAllConnections: false,
		saveExternalLinkValues: '1',
		showBorderUnselectedTables: '1',
		showInkAnnotation: '1',
		showObjects: 'all',
		showPivotChartFilter: '0'
		//updateLinks: 'userSet'
	};

	/* 18.2.30 (CT_BookView) Defaults */
	var WBViewDef = {
		activeTab: '0',
		autoFilterDateGrouping: '1',
		firstSheet: '0',
		minimized: '0',
		showHorizontalScroll: '1',
		showSheetTabs: '1',
		showVerticalScroll: '1',
		tabRatio: '600',
		visibility: 'visible'
		//window{Height,Width}, {x,y}Window
	};

	/* 18.2.19 (CT_Sheet) Defaults */
	var SheetDef = {
		state: 'visible'
	};

	/* 18.2.2  (CT_CalcPr) Defaults */
	var CalcPrDef = {
		calcCompleted: 'true',
		calcMode: 'auto',
		calcOnSave: 'true',
		concurrentCalc: 'true',
		fullCalcOnLoad: 'false',
		fullPrecision: 'true',
		iterate: 'false',
		iterateCount: '100',
		iterateDelta: '0.001',
		refMode: 'A1'
	};

	/* 18.2.3 (CT_CustomWorkbookView) Defaults */
	var CustomWBViewDef = {
		autoUpdate: 'false',
		changesSavedWin: 'false',
		includeHiddenRowCol: 'true',
		includePrintSettings: 'true',
		maximized: 'false',
		minimized: 'false',
		onlySync: 'false',
		personalView: 'false',
		showComments: 'commIndicator',
		showFormulaBar: 'true',
		showHorizontalScroll: 'true',
		showObjects: 'all',
		showSheetTabs: 'true',
		showStatusbar: 'true',
		showVerticalScroll: 'true',
		tabRatio: '600',
		xWindow: '0',
		yWindow: '0'
	};

	var XMLNS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
	var XMLNS_WB = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

	var strs = {}; // shared strings
	var styles = {}; // shared styles
	var _ssfopts = {}; // spreadsheet formatting options

	/* 18.3 Worksheets */
	function parseSheet(data) {
		if (!data) return data;
		/* 18.3.1.99 worksheet CT_Worksheet */
		var s = {};

		/* 18.3.1.35 dimension CT_SheetDimension ? */
		var ref = data.match(/<dimension ref="([^"]*)"\s*\/>/);
		if (ref && ref.length == 2 && ref[1].indexOf(":") !== -1) s["!ref"] = ref[1];

		var refguess = { s: { r: 1000000, c: 1000000 }, e: { r: 0, c: 0 } };
		var q = ["v", "f"];
		var sidx = 0;
		/* 18.3.1.80 sheetData CT_SheetData ? */
		if (!data.match(/<sheetData *\/>/)) data.match(/<sheetData>([^\u2603]*)<\/sheetData>/m)[1].split("</row>").forEach(function (x) {
			if (x === "" || x.trim() === "") return;

			/* 18.3.1.73 row CT_Row */
			var row = parsexmltag(x.match(/<row[^>]*>/)[0]);
			if (refguess.s.r > row.r - 1) refguess.s.r = row.r - 1;
			if (refguess.e.r < row.r - 1) refguess.e.r = row.r - 1;

			/* 18.3.1.4 c CT_Cell */
			var cells = x.substr(x.indexOf('>') + 1).split(/<c/);
			cells.forEach(function (c, idx) {
				if (c === "" || c.trim() === "") return;
				var cref = c.match(/r="([^"]*)"/);
				c = "<c" + c;
				if (cref && cref.length == 2) {
					var cref_cell = decode_cell(cref[1]);
					idx = cref_cell.c;
				}
				if (refguess.s.c > idx) refguess.s.c = idx;
				if (refguess.e.c < idx) refguess.e.c = idx;
				var cell = parsexmltag((c.match(/<c[^>]*>/) || [c])[0]);delete cell[0];
				var d = c.substr(c.indexOf('>') + 1);
				var p = {};
				q.forEach(function (f) {
					var x = d.match(matchtag(f));if (x) p[f] = unescapexml(x[1]);
				});

				/* SCHEMA IS ACTUALLY INCORRECT HERE.  IF A CELL HAS NO T, EMIT "" */
				if (cell.t === undefined && p.v === undefined) {
					p.t = "str";p.v = undefined;
				} else p.t = cell.t ? cell.t : "n"; // default is "n" in schema
				switch (p.t) {
					case 'n':
						p.v = parseFloat(p.v);break;
					case 's':
						{
							sidx = parseInt(p.v, 10);
							p.v = strs[sidx].t;
							p.r = strs[sidx].r;
						}break;
					case 'str':
						if (p.v) p.v = utf8read(p.v);break; // normal string
					case 'inlineStr':
						p.t = 'str';p.v = unescapexml((d.match(matchtag('t')) || ["", ""])[1]);
						break; // inline string
					case 'b':
						switch (p.v) {
							case '0':case 'FALSE':case "false":case false:
								p.v = false;break;
							case '1':case 'TRUE':case "true":case true:
								p.v = true;break;
							default:
								throw "Unrecognized boolean: " + p.v;
						}break;
					/* in case of error, stick value in .raw */
					case 'e':
						p.raw = p.v;p.v = undefined;break;
					default:
						throw "Unrecognized cell type: " + p.t;
				}

				/* formatting */
				if (cell.s && styles.CellXf) {
					/* TODO: second check is a hacked guard */
					var cf = styles.CellXf[cell.s];
					if (cf && cf.numFmtId && cf.numFmtId !== 0) {
						p.raw = p.v;
						p.rawt = p.t;
						try {
							p.v = SSF.format(cf.numFmtId, p.v, _ssfopts);
							p.t = 'str';
						} catch (e) {
							p.v = p.raw;
						}
					}
				}

				s[cell.r] = p;
			});
		});
		if (!s["!ref"]) s["!ref"] = encode_range(refguess);
		return s;
	}

	function parseProps(data) {
		var p = { Company: '' },
		    q = {};
		var strings = ["Application", "DocSecurity", "Company", "AppVersion"];
		var bools = ["HyperlinksChanged", "SharedDoc", "LinksUpToDate", "ScaleCrop"];
		var xtra = ["HeadingPairs", "TitlesOfParts"];
		var xtracp = ["category", "contentStatus", "lastModifiedBy", "lastPrinted", "revision", "version"];
		var xtradc = ["creator", "description", "identifier", "language", "subject", "title"];
		var xtradcterms = ["created", "modified"];
		xtra = xtra.concat(xtracp.map(function (x) {
			return "cp:" + x;
		}));
		xtra = xtra.concat(xtradc.map(function (x) {
			return "dc:" + x;
		}));
		xtra = xtra.concat(xtradcterms.map(function (x) {
			return "dcterms:" + x;
		}));

		strings.forEach(function (f) {
			p[f] = (data.match(matchtag(f)) || [])[1];
		});
		bools.forEach(function (f) {
			p[f] = (data.match(matchtag(f)) || [])[1] == "true";
		});
		xtra.forEach(function (f) {
			var cur = data.match(new RegExp("<" + f + "[^>]*>(.*)<\/" + f + ">"));
			if (cur && cur.length > 0) q[f] = cur[1];
		});

		if (q.HeadingPairs && q.TitlesOfParts) {
			var v = parseVector(q.HeadingPairs);
			var j = 0,
			    widx = 0;
			for (var i = 0; i !== v.length; ++i) {
				switch (v[i].v) {
					case "Worksheets":
						widx = j;p.Worksheets = +v[++i];break;
					case "Named Ranges":
						++i;break; // TODO: Handle Named Ranges
				}
			}
			var parts = parseVector(q.TitlesOfParts).map(utf8read);
			p.SheetNames = parts.slice(widx, widx + p.Worksheets);
		}
		p.Creator = q["dc:creator"];
		p.LastModifiedBy = q["cp:lastModifiedBy"];
		p.CreatedDate = new Date(q["dcterms:created"]);
		p.ModifiedDate = new Date(q["dcterms:modified"]);
		return p;
	}

	/* 18.6 Calculation Chain */
	function parseDeps(data) {
		var d = [];
		var l = 0,
		    i = 1;
		(data.match(/<[^>]*>/g) || []).forEach(function (x) {
			var y = parsexmltag(x);
			switch (y[0]) {
				case '<?xml':
					break;
				/* 18.6.2  calcChain CT_CalcChain 1 */
				case '<calcChain':case '<calcChain>':case '</calcChain>':
					break;
				/* 18.6.1  c CT_CalcCell 1 */
				case '<c':
					delete y[0];if (y.i) i = y.i;else y.i = i;d.push(y);break;
			}
		});
		return d;
	}

	var ctext = {};

	function parseCT(data) {
		if (!data || !data.match) return data;
		var ct = { workbooks: [], sheets: [], calcchains: [], themes: [], styles: [],
			coreprops: [], extprops: [], strs: [], xmlns: "" };
		(data.match(/<[^>]*>/g) || []).forEach(function (x) {
			var y = parsexmltag(x);
			switch (y[0]) {
				case '<?xml':
					break;
				case '<Types':
					ct.xmlns = y.xmlns;break;
				case '<Default':
					ctext[y.Extension] = y.ContentType;break;
				case '<Override':
					if (y.ContentType in ct2type) ct[ct2type[y.ContentType]].push(y.PartName);
					break;
			}
		});
		if (ct.xmlns !== XMLNS_CT) throw new Error("Unknown Namespace: " + ct.xmlns);
		ct.calcchain = ct.calcchains.length > 0 ? ct.calcchains[0] : "";
		ct.sst = ct.strs.length > 0 ? ct.strs[0] : "";
		ct.style = ct.styles.length > 0 ? ct.styles[0] : "";
		delete ct.calcchains;
		return ct;
	}

	/* 18.2 Workbook */
	function parseWB(data) {
		var wb = { AppVersion: {}, WBProps: {}, WBView: [], Sheets: [], CalcPr: {}, xmlns: "" };
		var pass = false;
		data.match(/<[^>]*>/g).forEach(function (x) {
			var y = parsexmltag(x);
			switch (y[0]) {
				case '<?xml':
					break;

				/* 18.2.27 workbook CT_Workbook 1 */
				case '<workbook':
					wb.xmlns = y.xmlns;break;
				case '</workbook>':
					break;

				/* 18.2.13 fileVersion CT_FileVersion ? */
				case '<fileVersion':
					delete y[0];wb.AppVersion = y;break;
				case '<fileVersion/>':
					break;

				/* 18.2.12 fileSharing CT_FileSharing ? */
				case '<fileSharing':case '<fileSharing/>':
					break;

				/* 18.2.28 workbookPr CT_WorkbookPr ? */
				case '<workbookPr':
					delete y[0];wb.WBProps = y;break;
				case '<workbookPr/>':
					delete y[0];wb.WBProps = y;break;

				/* 18.2.29 workbookProtection CT_WorkbookProtection ? */
				case '<workbookProtection/>':
					break;

				/* 18.2.1  bookViews CT_BookViews ? */
				case '<bookViews>':case '</bookViews>':
					break;
				/* 18.2.30   workbookView CT_BookView + */
				case '<workbookView':
					delete y[0];wb.WBView.push(y);break;

				/* 18.2.20 sheets CT_Sheets 1 */
				case '<sheets>':case '</sheets>':
					break; // aggregate sheet
				/* 18.2.19   sheet CT_Sheet + */
				case '<sheet':
					delete y[0];y.name = utf8read(y.name);wb.Sheets.push(y);break;

				/* 18.2.15 functionGroups CT_FunctionGroups ? */
				case '<functionGroups':case '<functionGroups/>':
					break;
				/* 18.2.14   functionGroup CT_FunctionGroup + */
				case '<functionGroup':
					break;

				/* 18.2.9  externalReferences CT_ExternalReferences ? */
				case '<externalReferences':case '</externalReferences>':
					break;
				/* 18.2.8    externalReference CT_ExternalReference + */
				case '<externalReference':
					break;

				/* 18.2.6  definedNames CT_DefinedNames ? */
				case '<definedNames/>':
					break;
				case '<definedNames>':
					pass = true;break;
				case '</definedNames>':
					pass = false;break;
				/* 18.2.5    definedName CT_DefinedName + */
				case '<definedName':case '<definedName/>':case '</definedName>':
					break;

				/* 18.2.2  calcPr CT_CalcPr ? */
				case '<calcPr':
					delete y[0];wb.CalcPr = y;break;
				case '<calcPr/>':
					delete y[0];wb.CalcPr = y;break;

				/* 18.2.16 oleSize CT_OleSize ? (ref required) */
				case '<oleSize':
					break;

				/* 18.2.4  customWorkbookViews CT_CustomWorkbookViews ? */
				case '<customWorkbookViews>':case '</customWorkbookViews>':case '<customWorkbookViews':
					break;
				/* 18.2.3    customWorkbookView CT_CustomWorkbookView + */
				case '<customWorkbookView':case '</customWorkbookView>':
					break;

				/* 18.2.18 pivotCaches CT_PivotCaches ? */
				case '<pivotCaches>':case '</pivotCaches>':case '<pivotCaches':
					break;
				/* 18.2.17 pivotCache CT_PivotCache ? */
				case '<pivotCache':
					break;

				/* 18.2.21 smartTagPr CT_SmartTagPr ? */
				case '<smartTagPr':case '<smartTagPr/>':
					break;

				/* 18.2.23 smartTagTypes CT_SmartTagTypes ? */
				case '<smartTagTypes':case '<smartTagTypes>':case '</smartTagTypes>':
					break;
				/* 18.2.22   smartTagType CT_SmartTagType ? */
				case '<smartTagType':
					break;

				/* 18.2.24 webPublishing CT_WebPublishing ? */
				case '<webPublishing':case '<webPublishing/>':
					break;

				/* 18.2.11 fileRecoveryPr CT_FileRecoveryPr ? */
				case '<fileRecoveryPr':case '<fileRecoveryPr/>':
					break;

				/* 18.2.26 webPublishObjects CT_WebPublishObjects ? */
				case '<webPublishObjects>':case '<webPublishObjects':case '</webPublishObjects>':
					break;
				/* 18.2.25 webPublishObject CT_WebPublishObject ? */
				case '<webPublishObject':
					break;

				/* 18.2.10 extLst CT_ExtensionList ? */
				case '<extLst>':case '</extLst>':case '<extLst/>':
					break;
				/* 18.2.7    ext CT_Extension + */
				case '<ext':
					pass = true;break; //TODO: check with versions of excel
				case '</ext>':
					pass = false;break;

				/* Others */
				case '<mx:ArchID':
					break;
				case '<mc:AlternateContent':
					pass = true;break;
				case '</mc:AlternateContent>':
					pass = false;break;
			}
		});
		if (wb.xmlns !== XMLNS_WB) throw new Error("Unknown Namespace: " + wb.xmlns);

		var z;
		/* defaults */
		for (z in WBPropsDef) if (typeof wb.WBProps[z] === 'undefined') wb.WBProps[z] = WBPropsDef[z];
		for (z in CalcPrDef) if (typeof wb.CalcPr[z] === 'undefined') wb.CalcPr[z] = CalcPrDef[z];

		wb.WBView.forEach(function (w) {
			for (var z in WBViewDef) if (typeof w[z] === 'undefined') w[z] = WBViewDef[z];
		});
		wb.Sheets.forEach(function (w) {
			for (var z in SheetDef) if (typeof w[z] === 'undefined') w[z] = SheetDef[z];
		});

		_ssfopts.date1904 = parsexmlbool(wb.WBProps.date1904, 'date1904');

		return wb;
	}

	/* 18.8.31 numFmts CT_NumFmts */
	function parseNumFmts(t) {
		styles.NumberFmt = [];
		for (var y in SSF._table) styles.NumberFmt[y] = SSF._table[y];
		t[0].match(/<[^>]*>/g).forEach(function (x) {
			var y = parsexmltag(x);
			switch (y[0]) {
				case '<numFmts':case '</numFmts>':case '<numFmts/>':
					break;
				case '<numFmt':
					{
						var f = unescapexml(y.formatCode),
						    i = parseInt(y.numFmtId, 10);
						styles.NumberFmt[i] = f;SSF.load(f, i);
					}break;
				default:
					throw 'unrecognized ' + y[0] + ' in numFmts';
			}
		});
	}

	/* 18.8.10 cellXfs CT_CellXfs */
	function parseCXfs(t) {
		styles.CellXf = [];
		t[0].match(/<[^>]*>/g).forEach(function (x) {
			var y = parsexmltag(x);
			switch (y[0]) {
				case '<cellXfs':case '<cellXfs/>':case '</cellXfs>':
					break;

				/* 18.8.45 xf CT_Xf */
				case '<xf':
					if (y.numFmtId) y.numFmtId = parseInt(y.numFmtId, 10);
					styles.CellXf.push(y);break;
				case '</xf>':
					break;

				/* 18.8.1 alignment CT_CellAlignment */
				case '<alignment':
					break;

				/* 18.8.33 protection CT_CellProtection */
				case '<protection':case '</protection>':case '<protection/>':
					break;

				case '<extLst':case '</extLst>':
					break;
				case '<ext':
					break;
				default:
					throw 'unrecognized ' + y[0] + ' in cellXfs';
			}
		});
	}

	/* 18.8 Styles CT_Stylesheet*/
	function parseStyles(data) {
		/* 18.8.39 styleSheet CT_Stylesheet */
		var t;

		/* numFmts CT_NumFmts ? */
		if (t = data.match(/<numFmts([^>]*)>.*<\/numFmts>/)) parseNumFmts(t);

		/* fonts CT_Fonts ? */
		/* fills CT_Fills ? */
		/* borders CT_Borders ? */
		/* cellStyleXfs CT_CellStyleXfs ? */

		/* cellXfs CT_CellXfs ? */
		if (t = data.match(/<cellXfs([^>]*)>.*<\/cellXfs>/)) parseCXfs(t);

		/* dxfs CT_Dxfs ? */
		/* tableStyles CT_TableStyles ? */
		/* colors CT_Colors ? */
		/* extLst CT_ExtensionList ? */

		return styles;
	}

	function getdata(data) {
		if (!data) return null;
		if (data.data) return data.data;
		if (data._data && data._data.getContent) return Array.prototype.slice.call(data._data.getContent(), 0).map(function (x) {
			return String.fromCharCode(x);
		}).join("");
		return null;
	}

	function getzipfile(zip, file) {
		var f = file;if (zip.files[f]) return zip.files[f];
		f = file.toLowerCase();if (zip.files[f]) return zip.files[f];
		f = f.replace(/\//g, '\\');if (zip.files[f]) return zip.files[f];
		throw new Error("Cannot find file " + file + " in zip");
	}

	function parseZip(zip) {
		var entries = Object.keys(zip.files);
		var keys = entries.filter(function (x) {
			return x.substr(-1) != '/';
		}).sort();
		var dir = parseCT(getdata(getzipfile(zip, '[Content_Types].xml')));
		if (dir.workbooks.length === 0) throw new Error("Could not find workbook entry");
		strs = {};
		if (dir.sst) strs = parse_sst(getdata(getzipfile(zip, dir.sst.replace(/^\//, ''))));

		styles = {};
		if (dir.style) styles = parseStyles(getdata(getzipfile(zip, dir.style.replace(/^\//, ''))));

		var wb = parseWB(getdata(getzipfile(zip, dir.workbooks[0].replace(/^\//, ''))));
		var propdata = dir.coreprops.length !== 0 ? getdata(getzipfile(zip, dir.coreprops[0].replace(/^\//, ''))) : "";
		propdata += dir.extprops.length !== 0 ? getdata(getzipfile(zip, dir.extprops[0].replace(/^\//, ''))) : "";
		var props = propdata !== "" ? parseProps(propdata) : {};
		var deps = {};
		if (dir.calcchain) deps = parseDeps(getdata(getzipfile(zip, dir.calcchain.replace(/^\//, ''))));
		var sheets = {},
		    i = 0;
		if (!props.Worksheets) {
			/* Google Docs doesn't generate the appropriate metadata, so we impute: */
			var wbsheets = wb.Sheets;
			props.Worksheets = wbsheets.length;
			props.SheetNames = [];
			for (var j = 0; j != wbsheets.length; ++j) {
				props.SheetNames[j] = wbsheets[j].name;
			}
			for (i = 0; i != props.Worksheets; ++i) {
				try {
					/* TODO: remove these guards */
					sheets[props.SheetNames[i]] = parseSheet(getdata(getzipfile(zip, 'xl/worksheets/sheet' + (i + 1) + '.xml')));
				} catch (e) {}
			}
		} else {
			for (i = 0; i != props.Worksheets; ++i) {
				try {
					sheets[props.SheetNames[i]] = parseSheet(getdata(getzipfile(zip, dir.sheets[i].replace(/^\//, ''))));
				} catch (e) {}
			}
		}
		return {
			Directory: dir,
			Workbook: wb,
			Props: props,
			Deps: deps,
			Sheets: sheets,
			SheetNames: props.SheetNames,
			Strings: strs,
			Styles: styles,
			keys: keys,
			files: zip.files
		};
	}

	var _fs, jszip;
	if (typeof JSZip !== 'undefined') jszip = JSZip;
	if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
			if (typeof jszip === 'undefined') jszip = require('./jszip').JSZip;
			_fs = require('fs');
		}
	}

	function readSync(data, options) {
		var zip,
		    d = data;
		var o = options || {};
		switch (o.type || "base64") {
			case "file":
				d = _fs.readFileSync(data).toString('base64');
			/* falls through */
			case "base64":
				zip = new jszip(d, { base64: true });break;
			case "binary":
				zip = new jszip(d, { base64: false });break;
		}
		return parseZip(zip);
	}

	function readFileSync(data, options) {
		var o = options || {};o.type = 'file';
		return readSync(data, o);
	}

	XLSX.read = readSync;
	XLSX.readFile = readFileSync;
	XLSX.parseZip = parseZip;
	return this;
})(XLSX);

var _chr = function _chr(c) {
	return String.fromCharCode(c);
};

function encode_col(col) {
	var s = "";for (++col; col; col = Math.floor((col - 1) / 26)) s = _chr((col - 1) % 26 + 65) + s;return s;
}
function encode_row(row) {
	return "" + (row + 1);
}
function encode_cell(cell) {
	return encode_col(cell.c) + encode_row(cell.r);
}

function decode_col(c) {
	var d = 0,
	    i = 0;for (; i !== c.length; ++i) d = 26 * d + c.charCodeAt(i) - 64;return d - 1;
}
function decode_row(rowstr) {
	return Number(rowstr) - 1;
}
function split_cell(cstr) {
	return cstr.replace(/(\$?[A-Z]*)(\$?[0-9]*)/, "$1,$2").split(",");
}
function decode_cell(cstr) {
	var splt = split_cell(cstr);return { c: decode_col(splt[0]), r: decode_row(splt[1]) };
}
function decode_range(range) {
	var x = range.split(":").map(decode_cell);return { s: x[0], e: x[x.length - 1] };
}
function encode_range(range) {
	return encode_cell(range.s) + ":" + encode_cell(range.e);
}
/**
 * Convert a sheet into an array of objects where the column headers are keys.
 **/
function sheet_to_row_object_array(sheet) {
	var val, rowObject, range, columnHeaders, emptyRow, C;
	var outSheet = [];
	if (sheet["!ref"]) {
		range = decode_range(sheet["!ref"]);

		columnHeaders = {};
		for (C = range.s.c; C <= range.e.c; ++C) {
			val = sheet[encode_cell({
				c: C,
				r: range.s.r
			})];
			if (val) {
				switch (val.t) {
					case 's':case 'str':
						columnHeaders[C] = val.v;break;
					case 'n':
						columnHeaders[C] = val.v;break;
				}
			}
		}

		for (var R = range.s.r + 1; R <= range.e.r; ++R) {
			emptyRow = true;
			//Row number is recorded in the prototype
			//so that it doesn't appear when stringified.
			rowObject = Object.create({ __rowNum__: R });
			for (C = range.s.c; C <= range.e.c; ++C) {
				val = sheet[encode_cell({
					c: C,
					r: R
				})];
				if (val !== undefined) switch (val.t) {
					case 's':case 'str':case 'b':case 'n':
						if (val.v !== undefined) {
							rowObject[columnHeaders[C]] = val.v;
							emptyRow = false;
						}
						break;
					case 'e':
						break; /* throw */
					default:
						throw 'unrecognized type ' + val.t;
				}
			}
			if (!emptyRow) {
				outSheet.push(rowObject);
			}
		}
	}
	return outSheet;
}

function sheet_to_csv(sheet) {
	var stringify = function stringify(val) {
		switch (val.t) {
			case 'n':
				return String(val.v);
			case 's':case 'str':
				if (typeof val.v === 'undefined') return "";
				return JSON.stringify(val.v);
			case 'b':
				return val.v ? "TRUE" : "FALSE";
			case 'e':
				return ""; /* throw out value in case of error */
			default:
				throw 'unrecognized type ' + val.t;
		}
	};
	var out = "";
	if (sheet["!ref"]) {
		var r = XLSX.utils.decode_range(sheet["!ref"]);
		for (var R = r.s.r; R <= r.e.r; ++R) {
			var row = [];
			for (var C = r.s.c; C <= r.e.c; ++C) {
				var val = sheet[XLSX.utils.encode_cell({ c: C, r: R })];
				row.push(val ? stringify(val).replace(/\\r\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace("\\\"", "\"\"") : "");
			}
			out += row.join(",") + "\n";
		}
	}
	return out;
}
var make_csv = sheet_to_csv;

function get_formulae(ws) {
	var cmds = [];
	for (var y in ws) if (y[0] !== '!' && ws.hasOwnProperty(y)) {
		var x = ws[y];
		var val = "";
		if (x.f) val = x.f;else if (typeof x.v === 'number') val = x.v;else val = x.v;
		cmds.push(y + "=" + val);
	}
	return cmds;
}

XLSX.utils = {
	encode_col: encode_col,
	encode_row: encode_row,
	encode_cell: encode_cell,
	encode_range: encode_range,
	decode_col: decode_col,
	decode_row: decode_row,
	split_cell: split_cell,
	decode_cell: decode_cell,
	decode_range: decode_range,
	sheet_to_csv: sheet_to_csv,
	make_csv: sheet_to_csv,
	get_formulae: get_formulae,
	sheet_to_row_object_array: sheet_to_row_object_array
};

if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
	exports.read = XLSX.read;
	exports.readFile = XLSX.readFile;
	exports.utils = XLSX.utils;
	exports.main = function (args) {
		var zip = XLSX.read(args[0], { type: 'file' });
		console.log(zip.Sheets);
	};
	if (typeof module !== 'undefined' && require.main === module) exports.main(process.argv.slice(2));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL3hseHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUtBLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUNiLElBQUksUUFBUSxHQUFHLFNBQVgsUUFBUSxDQUFZLEdBQUcsRUFBQztBQUM1QixPQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBQyxZQUFVO0FBQUMsU0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztFQUFDLENBQUM7QUFDL0UsS0FBSSxPQUFPLEdBQUcsU0FBVixPQUFPLENBQVksQ0FBQyxFQUFFO0FBQUUsU0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7RUFBRSxDQUFDO0FBQzFELFVBQVMsSUFBSSxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUU7QUFBRSxTQUFPLElBQUksS0FBSyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFBRTtBQUNyRCxVQUFTLEdBQUcsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQztBQUFDLE1BQUksQ0FBQyxHQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLElBQUUsQ0FBQyxHQUFDLENBQUMsR0FBRSxJQUFJLENBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFDLENBQUMsQUFBQyxDQUFDO0VBQUM7QUFDcEYsVUFBUyxJQUFJLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUM7QUFBQyxNQUFJLENBQUMsR0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxJQUFFLENBQUMsR0FBQyxDQUFDLEdBQUUsQ0FBQyxHQUFDLElB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R0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUc7T0FBRSxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2xFLE9BQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRztBQUN2QyxRQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQUUsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztRQUFFLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBQyxHQUFHLENBQUMsQ0FBQztBQUNqRixRQUFJLEdBQUcsR0FBSSxHQUFHLEdBQUcsSUFBSSxHQUFDLEdBQUcsQUFBQztRQUFFLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDdEMsV0FBTyxJQUFJLElBQUksSUFBSSxHQUFDLElBQUksR0FBQyxFQUFFLENBQUEsQUFBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUEsQUFBQyxDQUFDO0lBQ3BKO0FBQ0QsT0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLEdBQUMsQ0FBQyxHQUFDLEdBQUcsR0FBQyxFQUFFLENBQUEsR0FBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3hGLE9BQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUN4QyxXQUFPLEdBQUc7QUFDVCxTQUFLLEdBQUc7QUFBRSxZQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxBQUNqQyxTQUFLLEtBQUs7QUFBRSxNQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUMsRUFBRSxDQUFDLENBQUM7QUFDbEMsWUFBTyxNQUFNLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxJQUFJLENBQUMsQ0FBQztBQUFBLEFBQ3RFLFNBQUssTUFBTTtBQUFFLE1BQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBQyxHQUFHLENBQUMsQ0FBQztBQUNwQyxZQUFPLE1BQU0sQ0FBQyxDQUFDLEdBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUMsS0FBSyxHQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsQUFDekcsU0FBSyxPQUFPO0FBQUUsTUFBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RDLFlBQU8sTUFBTSxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBQyxLQUFLLEdBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFDLEtBQUssR0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEFBQ2xKLFNBQUssT0FBTztBQUFFLFlBQU8sSUFBSSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFBQSxBQUMvRCxTQUFLLFNBQVM7QUFBRSxNQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBLEdBQUUsRUFBRSxDQUFDLENBQUMsQUFBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLFNBQVMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsQUFDMUosU0FBSyxVQUFVO0FBQUUsTUFBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQSxHQUFFLEdBQUcsQ0FBQyxDQUFDLEFBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDO0FBQUEsQUFDN0ssU0FBSyxTQUFTO0FBQUUsT0FBRSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEFBQUMsT0FBTyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFFLEVBQUUsQ0FBQSxBQUFDLEdBQUcsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBLEFBQUMsQ0FBQztBQUFBLEFBQ3hILFNBQUssV0FBVztBQUFFLE9BQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxBQUFDLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLENBQUEsQUFBQyxHQUFHLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQSxBQUFDLENBQUM7QUFBQSxBQUM5SSxTQUFLLGFBQWE7QUFBRSxPQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQUFBQyxPQUFPLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUUsRUFBRSxDQUFBLEFBQUMsR0FBRyxHQUFHLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUEsQUFBQyxDQUFDO0FBQUEsQUFDbkosWUFBUTtJQUNSO0FBQ0QsU0FBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7R0FDcEQ7RUFBQSxDQUFDO0FBQ0YsVUFBUyxTQUFTLENBQUMsR0FBRyxFQUFFO0FBQ3ZCLE1BQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUNiLE1BQUksTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hCLE9BQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDMUMsT0FBRyxNQUFNLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFBRSxRQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEFBQUMsU0FBUztJQUFFO0FBQzdELE9BQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBRSxNQUFFLENBQUMsQ0FBQyxBQUFDLFNBQVM7SUFBRTtBQUN2RSxPQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUU7QUFBRSxVQUFNLEdBQUcsQ0FBQyxDQUFDLEFBQUMsU0FBUztJQUFFO0FBQzNDLE9BQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxTQUFTO0FBQzNCLE1BQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6QixJQUFDLEdBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQztHQUNSO0FBQ0QsS0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdkIsTUFBRyxNQUFNLElBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxVQUFVLEdBQUcsR0FBRyxHQUFHLDJCQUEyQixHQUFHLE1BQU0sQ0FBQztBQUM5RSxTQUFPLEdBQUcsQ0FBQztFQUNYO0FBQ0QsSUFBRyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7QUFDdkIsVUFBUyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQ3JDLE1BQUksR0FBRyxHQUFHLEVBQUU7TUFBRSxDQUFDLEdBQUcsRUFBRTtNQUFFLENBQUMsR0FBRyxDQUFDO01BQUUsQ0FBQyxHQUFHLEVBQUU7TUFBRSxHQUFHLEdBQUMsR0FBRztNQUFFLENBQUMsR0FBRyxFQUFFO01BQUUsRUFBRSxDQUFDO0FBQ3pELFNBQU8sQ0FBQyxJQUFJLEdBQUksSUFBSSxJQUFJLEVBQUUsQUFBQyxDQUFDLENBQUM7QUFDN0IsTUFBSSxFQUFFLEdBQUMsR0FBRyxDQUFDOztBQUVYLFNBQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUU7QUFDckIsV0FBUSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNqQixTQUFLLEdBQUc7O0FBQ1AsVUFBSSxDQUFDLEdBQUMsRUFBRSxFQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzFELFFBQUcsQ0FBQyxJQUFJLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxFQUFFLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEFBQUMsRUFBRSxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQUEsQUFDcEMsU0FBSyxJQUFJO0FBQUUsU0FBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNqRSxRQUFHLENBQUMsSUFBSSxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxBQUFDLEVBQUUsQ0FBQyxDQUFDLEFBQUMsTUFBTTtBQUFBLEFBQ2xDLFNBQUssR0FBRztBQUFFLFFBQUcsQ0FBQyxJQUFJLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxFQUFFLENBQUMsRUFBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLEFBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxBQUFDLE1BQU07QUFBQSxBQUNoRCxTQUFLLEdBQUc7O0FBQ1AsUUFBRyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUMsRUFBQyxHQUFHLEVBQUUsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQUFBQyxFQUFFLENBQUMsQ0FBQyxBQUFDLE1BQU07QUFBQTtBQUVwQyxTQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHO0FBQ3pELFNBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUNwQixTQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxlQUFlLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3RDLE1BQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQUFBQyxPQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUUsQ0FBQyxDQUFDO0FBQ3ZDLFNBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO0FBQUUsT0FBQyxJQUFFLEdBQUcsQ0FBQyxBQUFDLE9BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsSUFBRyxHQUFHLENBQUM7TUFBRTtBQUNoRyxTQUFHLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQ25ELFNBQUcsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLE1BQUMsR0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEFBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQUEsQUFDM0MsU0FBSyxHQUFHO0FBQ1AsU0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsZUFBZSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN0QyxNQUFDLEdBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxHQUFHLEVBQUMsQ0FBQztBQUNkLFNBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxFQUFFO0FBQUMsT0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEFBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQUFBQyxFQUFFLEdBQUMsR0FBRyxDQUFDLENBQUMsSUFBRSxDQUFDLENBQUM7TUFBQyxNQUNqRixJQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxLQUFLLE9BQU8sRUFBRTtBQUFFLE9BQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxBQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEFBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxBQUFDLEVBQUUsR0FBQyxHQUFHLENBQUM7TUFBRSxNQUM1RixDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUNmLFFBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQUFBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEFBQUMsTUFBTTtBQUFBLEFBQzdCLFNBQUssR0FBRzs7QUFDUCxNQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ04sWUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQyxTQUFHLENBQUMsSUFBSSxLQUFLLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUMsRUFBQyxHQUFHLEVBQUUsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFDdEMsV0FBTTtBQUFBO0FBRVAsU0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUc7QUFDakIsTUFBQyxHQUFHLENBQUMsQ0FBQyxBQUFDLE9BQU0sV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFELFFBQUcsQ0FBQyxJQUFJLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxFQUFFLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEFBQUMsTUFBTTtBQUFBLEFBQy9CLFNBQUssR0FBRztBQUNQLE1BQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQUFBQyxPQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUUsQ0FBQyxDQUFDO0FBQ3ZDLE1BQUMsR0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEFBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQUEsQUFDM0MsU0FBSyxHQUFHO0FBQUUsT0FBRSxDQUFDLENBQUMsQUFBQyxJQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQzVDLFNBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHO0FBQUUsUUFBRyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUMsRUFBRSxJQUFJLEtBQUcsQ0FBQyxHQUFDLEdBQUcsR0FBQyxDQUFDLEFBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxBQUFDLEVBQUUsQ0FBQyxDQUFDLEFBQUMsTUFBTTtBQUFBLEFBQ25FLFNBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUc7QUFDdkYsTUFBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFDLE9BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakUsUUFBRyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUMsRUFBQyxHQUFHLEVBQUUsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQUEsQUFDL0IsU0FBSyxHQUFHO0FBQUUsUUFBRyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQUFBQyxFQUFFLENBQUMsQ0FBQyxBQUFDLE1BQU07QUFBQSxBQUMxQztBQUNDLFNBQUcsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUN2QyxNQUFNLHlCQUF5QixHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEdBQUcsR0FBRyxDQUFDO0FBQ3pELFFBQUcsQ0FBQyxJQUFJLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxFQUFFLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEFBQUMsRUFBRSxDQUFDLENBQUMsQUFBQyxNQUFNO0FBQUEsSUFDcEM7R0FDRDs7O0FBR0QsT0FBSSxDQUFDLEdBQUMsR0FBRyxDQUFDLE1BQU0sR0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQ3pDLFdBQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDZCxTQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRztBQUFFLFFBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEFBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQyxBQUFDLE1BQU07QUFBQSxBQUNsRCxTQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRztBQUFFLFFBQUcsR0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQUMsTUFBTTtBQUFBLEFBQ3RFLFNBQUssR0FBRztBQUFFLFNBQUcsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxBQUFDLE1BQU07QUFBQSxJQUNoRDtHQUNEOzs7QUFHRCxPQUFJLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDN0IsV0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNkLFNBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUc7QUFBRSxXQUFNO0FBQUEsQUFDcEMsU0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHLENBQUMsQUFBQyxLQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRyxDQUFDLEFBQUMsS0FBSyxHQUFHO0FBQ2pHLFFBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUM5QyxRQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxBQUFDLE1BQU07QUFBQSxBQUN2QixTQUFLLEdBQUcsQ0FBQyxBQUFDLEtBQUssR0FBRztBQUNqQixTQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUMsQ0FBQyxDQUFDO0FBQ2IsWUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUEsQUFBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFD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QUFFLEVBQUUsT0FBTztBQUN2RSxRQUFJLElBQUksR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ2xDLEtBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQ2IsUUFBRyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7QUFDNUIsU0FBSSxTQUFTLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLFFBQUcsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO0tBQ2xCO0FBQ0QsUUFBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQzFDLFFBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUMxQyxRQUFJLElBQUksR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdEUsUUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25DLFFBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUNYLEtBQUMsQ0FBQyxPQUFPLENBQUMsVUFBUyxDQUFDLEVBQUM7QUFBQyxTQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENB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LENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBUyxDQUFDLEVBQUU7QUFBRSxVQUFPLEtBQUssR0FBRyxDQUFDLENBQUM7R0FBRSxDQUFDLENBQUMsQ0FBQztBQUNsRSxNQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVMsQ0FBQyxFQUFFO0FBQUUsVUFBTyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0dBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEUsTUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFTLENBQUMsRUFBRTtBQUFFLFVBQU8sVUFBVSxHQUFHLENBQUMsQ0FBQztHQUFFLENBQUMsQ0FBQyxDQUFDOztBQUc1RSxTQUFPLENBQUMsT0FBTyxDQUFDLFVBQVMsQ0FBQyxFQUFDO0FBQUMsSUFBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLENBQUEsQ0FBRSxDQUFDLENBQUMsQ0FBQztHQUFDLENBQUMsQ0FBQztBQUN2RSxPQUFLLENBQUMsT0FBTyxDQUFDLFVBQVMsQ0FBQyxFQUFDO0FBQUMsSUFBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLENBQUEsQ0FBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUM7R0FBQyxDQUFDLENBQUM7QUFDL0UsTUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFTLENBQUMsRUFBRTtBQUN4QixPQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsZUFBZSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3RFLE9BQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxF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LElBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVMsQ0FBQyxFQUFDO0FBQUMsUUFBSSxJQUFJLENBQUMsSUFBSSxTQUFTLEVBQUUsSUFBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztHQUFFLENBQUMsQ0FBQztBQUM1RyxJQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFTLENBQUMsRUFBQztBQUFDLFFBQUksSUFBSSxDQUFDLElBQUksUUFBUSxFQUFFLElBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7R0FBRSxDQUFDLENBQUM7O0FBRTFHLFVBQVEsQ0FBQyxRQUFRLEdBQUcsWUFBWSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDOztBQUVsRSxTQUFPLEVBQUUsQ0FBQztFQUNWOzs7QUFHRCxVQUFTLFlBQVksQ0FBQyxDQUFDLEVBQUU7QUFDeEIsUUFBTSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDdEIsT0FBSSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RCxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFTLENBQUMsRUFBRTtBQUMxQyxPQUFJLENBQUMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdkIsV0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ1YsU0FBSyxVQUFVLENBQUMsQUFBQyxLQUFLLFlBQVksQ0FBQyxBQUFDLEtBQUssWUFBWTtBQUFFLFdB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LElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7QUFDaEYsTUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLE1BQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEdBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzs7QUFFaEYsUUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNaLE1BQUcsR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzs7QUFFMUYsTUFBSSxFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMvRSxNQUFJLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDOUcsVUFBUSxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUN6RyxNQUFJ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QUFDLENBQUMsQ0FBQztDQUFFLENBQUM7O0FBRTFELFNBQVMsVUFBVSxDQUFDLEdBQUcsRUFBRTtBQUFFLEtBQUksQ0FBQyxHQUFDLEVBQUUsQ0FBQyxBQUFDLEtBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQSxHQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQUFBQyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUEsR0FBRSxFQUFFLEdBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEFBQUMsT0FBTyxDQUFDLENBQUM7Q0FBRTtBQUM3SCxTQUFTLFVBQVUsQ0FBQyxHQUFHLEVBQUU7QUFBRSxRQUFPLEVBQUUsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFBLEFBQUMsQ0FBQztDQUFFO0FBQ25ELFNBQVMsV0FBVyxDQUFDLElBQUksRUFBRTtBQUFFLFFBQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQUU7O0FBRTlFLFNBQVMsVUFBVSxDQUFDLENBQUMsRUFBRTtBQUFFLEtBQUksQ0FBQyxHQUFHLENBQUM7S0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEFBQUMsT0FBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxBQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztDQUFFO0FBQ3RILFNBQVMsVUFBVSxDQUFDLE1BQU0sRUFBRTtBQUFFLFFBQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztDQUFFO0FBQzFELFNBQVMsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFFLFFBQU8sSUFBSSxDQUFDLE9BQU8sQ0FB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LENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDekIsUUFBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQ2pDLFFBQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztBQUMzQixRQUFPLENBQUMsSUFBSSxHQUFHLFVBQVMsSUFBSSxFQUFFO0FBQzdCLE1BQUksR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUMsSUFBSSxFQUFDLE1BQU0sRUFBQyxDQUFDLENBQUM7QUFDNUMsU0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7RUFDeEIsQ0FBQztBQUNILEtBQUcsT0FBTyxNQUFNLEtBQUssV0FBVyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUMxRCxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDcEMiLCJmaWxlIjoieGx4cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qIHhsc3guanMgKEMpIDIwMTMgU2hlZXRKUyAtLSBodHRwOi8vc2hlZXRqcy5jb20gKi9cbi8qIHZpbTogc2V0IHRzPTI6ICovXG4vKmpzaGludCBlcW51bGw6dHJ1ZSAqL1xuLyogU3ByZWFkc2hlZXQgRm9ybWF0IC0tIGp1bXAgdG8gWExTWCBmb3IgdGhlIFhMU1ggY29kZSAqL1xuLyogc3NmLmpzIChDKSAyMDEzIFNoZWV0SlMgLS0gaHR0cDovL3NoZWV0anMuY29tICovXG52YXIgU1NGID0ge307XG52YXIgbWFrZV9zc2YgPSBmdW5jdGlvbihTU0Ype1xuU3RyaW5nLnByb3RvdHlwZS5yZXZlcnNlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc3BsaXQoXCJcIikucmV2ZXJzZSgpLmpvaW4oXCJcIik7fTtcbnZhciBfc3RycmV2ID0gZnVuY3Rpb24oeCkgeyByZXR1cm4gU3RyaW5nKHgpLnJldmVyc2UoKTsgfTtcbmZ1bmN0aW9uIGZpbGwoYyxsKSB7IHJldHVybiBuZXcgQXJyYXkobCsxKS5qb2luKGMpOyB9XG5mdW5jdGlvbiBwYWQodixkLGMpe3ZhciB0PVN0cmluZyh2KTtyZXR1cm4gdC5sZW5ndGg+PWQ/dDooZmlsbChjfHwwLGQtdC5sZW5ndGgpK3QpO31cbmZ1bmN0aW9uIHJwYWQodixkLGMpe3ZhciB0PVN0cmluZyh2KTtyZXR1cm4gdC5sZW5ndGg+PWQ/dDoodCtmaWxsKGN8fDAsZC10Lmxlbmd0aCkpO31cbi8qIE9wdGlvbnMgKi9cbnZhciBvcHRzX2ZtdCA9IHt9O1xuZnVuY3Rpb24gZml4b3B0cyhvKXtmb3IodmFyIHkgaW4gb3B0c19mbXQpIGlmKG9beV09PT11bmRlZmluZWQpIG9beV09b3B0c19mbXRbeV07fVxuU1NGLm9wdHMgPSBvcHRzX2ZtdDtcbm9wdHNfZm10LmRhdGUxOTA0ID0gMDtcbm9wdHNfZm10Lm91dHB1dCA9IFwiXCI7XG5vcHRzX2ZtdC5tb2RlID0gXCJcIjtcbnZhciB0YWJsZV9mbXQgPSB7XG5cdDE6ICAnMCcsXG5cdDI6ICAnMC4wMCcsXG5cdDM6ICAnIywjIzAnLFxuXHQ0OiAgJyMsIyMwLjAwJyxcblx0OTogICcwJScsXG5cdDEwOiAnMC4wMCUnLFxuXHQxMTogJzAuMDBFKzAwJyxcblx0MTI6ICcjID8vPycsXG5cdDEzOiAnIyA/Py8/PycsXG5cdDE0OiAnbS9kL3l5Jyxcblx0MTU6ICdkLW1tbS15eScsXG5cdDE2OiAnZC1tbW0nLFxuXHQxNzogJ21tbS15eScsXG5cdDE4OiAnaDptbSBBTS9QTScsXG5cdDE5OiAnaDptbTpzcyBBTS9QTScsXG5cdDIwOiAnaDptbScsXG5cdDIxOiAnaDptbTpzcycsXG5cdDIyOiAnbS9kL3l5IGg6bW0nLFxuXHQzNzogJyMsIyMwIDsoIywjIzApJyxcblx0Mzg6ICcjLCMjMCA7W1JlZF0oIywjIzApJyxcblx0Mzk6ICcjLCMjMC4wMDsoIywjIzAuMDApJyxcblx0NDA6ICcjLCMjMC4wMDtbUmVkXSgjLCMjMC4wMCknLFxuXHQ0NTogJ21tOnNzJyxcblx0NDY6ICdbaF06bW06c3MnLFxuXHQ0NzogJ21tc3MuMCcsXG5cdDQ4OiAnIyMwLjBFKzAnLFxuXHQ0OTogJ0AnXG59O1xudmFyIGRheXMgPSBbXG5cdFsnU3VuJywgJ1N1bmRheSddLFxuXHRbJ01vbicsICdNb25kYXknXSxcblx0WydUdWUnLCAnVHVlc2RheSddLFxuXHRbJ1dlZCcsICdXZWRuZXNkYXknXSxcblx0WydUaHUnLCAnVGh1cnNkYXknXSxcblx0WydGcmknLCAnRnJpZGF5J10sXG5cdFsnU2F0JywgJ1NhdHVyZGF5J11cbl07XG52YXIgbW9udGhzID0gW1xuXHRbJ0onLCAnSmFuJywgJ0phbnVhcnknXSxcblx0WydGJywgJ0ZlYicsICdGZWJydWFyeSddLFxuXHRbJ00nLCAnTWFyJywgJ01hcmNoJ10sXG5cdFsnQScsICdBcHInLCAnQXByaWwnXSxcblx0WydNJywgJ01heScsICdNYXknXSxcblx0WydKJywgJ0p1bicsICdKdW5lJ10sXG5cdFsnSicsICdKdWwnLCAnSnVseSddLFxuXHRbJ0EnLCAnQXVnJywgJ0F1Z3VzdCddLFxuXHRbJ1MnLCAnU2VwJywgJ1NlcHRlbWJlciddLFxuXHRbJ08nLCAnT2N0JywgJ09jdG9iZXInXSxcblx0WydOJywgJ05vdicsICdOb3ZlbWJlciddLFxuXHRbJ0QnLCAnRGVjJywgJ0RlY2VtYmVyJ11cbl07XG52YXIgZnJhYyA9IGZ1bmN0aW9uIGZyYWMoeCwgRCwgbWl4ZWQpIHtcblx0dmFyIHNnbiA9IHggPCAwID8gLTEgOiAxO1xuXHR2YXIgQiA9IHggKiBzZ247XG5cdHZhciBQXzIgPSAwLCBQXzEgPSAxLCBQID0gMDtcblx0dmFyIFFfMiA9IDEsIFFfMSA9IDAsIFEgPSAwO1xuXHR2YXIgQSA9IEJ8MDtcblx0d2hpbGUoUV8xIDwgRCkge1xuXHRcdEEgPSBCfDA7XG5cdFx0UCA9IEEgKiBQXzEgKyBQXzI7XG5cdFx0USA9IEEgKiBRXzEgKyBRXzI7XG5cdFx0aWYoKEIgLSBBKSA8IDAuMDAwMDAwMDAwMSkgYnJlYWs7XG5cdFx0QiA9IDEgLyAoQiAtIEEpO1xuXHRcdFBfMiA9IFBfMTsgUF8xID0gUDtcblx0XHRRXzIgPSBRXzE7IFFfMSA9IFE7XG5cdH1cblx0aWYoUSA+IEQpIHsgUSA9IFFfMTsgUCA9IFBfMTsgfVxuXHRpZihRID4gRCkgeyBRID0gUV8yOyBQID0gUF8yOyB9XG5cdGlmKCFtaXhlZCkgcmV0dXJuIFswLCBzZ24gKiBQLCBRXTtcblx0dmFyIHEgPSBNYXRoLmZsb29yKHNnbiAqIFAvUSk7XG5cdHJldHVybiBbcSwgc2duKlAgLSBxKlEsIFFdO1xufTtcbnZhciBnZW5lcmFsX2ZtdCA9IGZ1bmN0aW9uKHYpIHtcblx0aWYodHlwZW9mIHYgPT09ICdib29sZWFuJykgcmV0dXJuIHYgPyBcIlRSVUVcIiA6IFwiRkFMU0VcIjtcblx0aWYodHlwZW9mIHYgPT09ICdudW1iZXInKSB7XG5cdFx0dmFyIG8sIFYgPSB2IDwgMCA/IC12IDogdjtcblx0XHRpZihWID49IDAuMSAmJiBWIDwgMSkgbyA9IHYudG9QcmVjaXNpb24oOSk7XG5cdFx0ZWxzZSBpZihWID49IDAuMDEgJiYgViA8IDAuMSkgbyA9IHYudG9QcmVjaXNpb24oOCk7XG5cdFx0ZWxzZSBpZihWID49IDAuMDAxICYmIFYgPCAwLjAxKSBvID0gdi50b1ByZWNpc2lvbig3KTtcblx0XHRlbHNlIGlmKFYgPj0gMC4wMDAxICYmIFYgPCAwLjAwMSkgbyA9IHYudG9QcmVjaXNpb24oNik7XG5cdFx0ZWxzZSBpZihWID49IE1hdGgucG93KDEwLDEwKSAmJiBWIDwgTWF0aC5wb3coMTAsMTEpKSBvID0gdi50b0ZpeGVkKDEwKS5zdWJzdHIoMCwxMik7XG5cdFx0ZWxzZSBpZihWID4gTWF0aC5wb3coMTAsLTkpICYmIFYgPCBNYXRoLnBvdygxMCwxMSkpIHtcblx0XHRcdG8gPSB2LnRvRml4ZWQoMTIpLnJlcGxhY2UoLyhcXC5bMC05XSpbMS05XSkwKiQvLFwiJDFcIikucmVwbGFjZSgvXFwuJC8sXCJcIik7IFxuXHRcdFx0aWYoby5sZW5ndGggPiAxMSsodjwwPzE6MCkpIG8gPSB2LnRvUHJlY2lzaW9uKDEwKTtcblx0XHRcdGlmKG8ubGVuZ3RoID4gMTErKHY8MD8xOjApKSBvID0gdi50b0V4cG9uZW50aWFsKDUpO1xuXHRcdH0gXG5cdFx0ZWxzZSB7XG5cdFx0XHRvID0gdi50b0ZpeGVkKDExKS5yZXBsYWNlKC8oXFwuWzAtOV0qWzEtOV0pMCokLyxcIiQxXCIpO1xuXHRcdFx0XHRpZihvLmxlbmd0aCA+IDExICsgKHY8MD8xOjApKSBvID0gdi50b1ByZWNpc2lvbig2KTsgXG5cdFx0fVxuXHRcdG8gPSBvLnJlcGxhY2UoLyhcXC5bMC05XSpbMS05XSkwK2UvLFwiJDFlXCIpLnJlcGxhY2UoL1xcLjAqZS8sXCJlXCIpO1xuXHRcdHJldHVybiBvLnJlcGxhY2UoXCJlXCIsXCJFXCIpLnJlcGxhY2UoL1xcLjAqJC8sXCJcIikucmVwbGFjZSgvXFwuKFswLTldKlteMF0pMCokLyxcIi4kMVwiKS5yZXBsYWNlKC8oRVsrLV0pKFswLTldKSQvLFwiJDFcIitcIjBcIitcIiQyXCIpO1xuXHR9XG5cdGlmKHR5cGVvZiB2ID09PSAnc3RyaW5nJykgcmV0dXJuIHY7XG5cdHRocm93IFwidW5zdXBwb3J0ZWQgdmFsdWUgaW4gR2VuZXJhbCBmb3JtYXQ6IFwiICsgdjtcbn07XG5TU0YuX2dlbmVyYWwgPSBnZW5lcmFsX2ZtdDtcbnZhciBwYXJzZV9kYXRlX2NvZGUgPSBmdW5jdGlvbiBwYXJzZV9kYXRlX2NvZGUodixvcHRzKSB7XG5cdHZhciBkYXRlID0gTWF0aC5mbG9vcih2KSwgdGltZSA9IE1hdGgucm91bmQoODY0MDAgKiAodiAtIGRhdGUpKSwgZG93PTA7XG5cdHZhciBkb3V0PVtdLCBvdXQ9e0Q6ZGF0ZSwgVDp0aW1lLCB1Ojg2NDAwKih2LWRhdGUpLXRpbWV9OyBmaXhvcHRzKG9wdHMgPSAob3B0c3x8e30pKTtcblx0aWYob3B0cy5kYXRlMTkwNCkgZGF0ZSArPSAxNDYyO1xuXHRpZihkYXRlID09PSA2MCkge2RvdXQgPSBbMTkwMCwyLDI5XTsgZG93PTM7fVxuXHRlbHNlIGlmKGRhdGUgPT09IDApIHtkb3V0ID0gWzE5MDAsMSwwXTsgZG93PTY7fVxuXHRlbHNlIHtcblx0XHRpZihkYXRlID4gNjApIC0tZGF0ZTtcblx0XHQvKiAxID0gSmFuIDEgMTkwMCAqL1xuXHRcdHZhciBkID0gbmV3IERhdGUoMTkwMCwwLDEpO1xuXHRcdGQuc2V0RGF0ZShkLmdldERhdGUoKSArIGRhdGUgLSAxKTtcblx0XHRkb3V0ID0gW2QuZ2V0RnVsbFllYXIoKSwgZC5nZXRNb250aCgpKzEsZC5nZXREYXRlKCldO1xuXHRcdGRvdyA9IGQuZ2V0RGF5KCk7XG5cdFx0aWYob3B0cy5tb2RlID09PSAnZXhjZWwnICYmIGRhdGUgPCA2MCkgZG93ID0gKGRvdyArIDYpICUgNztcblx0fVxuXHRvdXQueSA9IGRvdXRbMF07IG91dC5tID0gZG91dFsxXTsgb3V0LmQgPSBkb3V0WzJdO1xuXHRvdXQuUyA9IHRpbWUgJSA2MDsgdGltZSA9IE1hdGguZmxvb3IodGltZSAvIDYwKTtcblx0b3V0Lk0gPSB0aW1lICUgNjA7IHRpbWUgPSBNYXRoLmZsb29yKHRpbWUgLyA2MCk7XG5cdG91dC5IID0gdGltZTtcblx0b3V0LnEgPSBkb3c7XG5cdHJldHVybiBvdXQ7XG59O1xuU1NGLnBhcnNlX2RhdGVfY29kZSA9IHBhcnNlX2RhdGVfY29kZTtcbnZhciB3cml0ZV9kYXRlID0gZnVuY3Rpb24odHlwZSwgZm10LCB2YWwpIHtcblx0aWYodmFsIDwgMCkgcmV0dXJuIFwiXCI7XG5cdHN3aXRjaCh0eXBlKSB7XG5cdFx0Y2FzZSAneSc6IHN3aXRjaChmbXQpIHsgLyogeWVhciAqL1xuXHRcdFx0Y2FzZSAneSc6IGNhc2UgJ3l5JzogcmV0dXJuIHBhZCh2YWwueSAlIDEwMCwyKTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiB2YWwueTtcblx0XHR9IGJyZWFrO1xuXHRcdGNhc2UgJ20nOiBzd2l0Y2goZm10KSB7IC8qIG1vbnRoICovXG5cdFx0XHRjYXNlICdtJzogcmV0dXJuIHZhbC5tO1xuXHRcdFx0Y2FzZSAnbW0nOiByZXR1cm4gcGFkKHZhbC5tLDIpO1xuXHRcdFx0Y2FzZSAnbW1tJzogcmV0dXJuIG1vbnRoc1t2YWwubS0xXVsxXTtcblx0XHRcdGNhc2UgJ21tbW0nOiByZXR1cm4gbW9udGhzW3ZhbC5tLTFdWzJdO1xuXHRcdFx0Y2FzZSAnbW1tbW0nOiByZXR1cm4gbW9udGhzW3ZhbC5tLTFdWzBdO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgJ2JhZCBtb250aCBmb3JtYXQ6ICcgKyBmbXQ7XG5cdFx0fSBicmVhaztcblx0XHRjYXNlICdkJzogc3dpdGNoKGZtdCkgeyAvKiBkYXkgKi9cblx0XHRcdGNhc2UgJ2QnOiByZXR1cm4gdmFsLmQ7XG5cdFx0XHRjYXNlICdkZCc6IHJldHVybiBwYWQodmFsLmQsMik7XG5cdFx0XHRjYXNlICdkZGQnOiByZXR1cm4gZGF5c1t2YWwucV1bMF07XG5cdFx0XHRjYXNlICdkZGRkJzogcmV0dXJuIGRheXNbdmFsLnFdWzFdO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgJ2JhZCBkYXkgZm9ybWF0OiAnICsgZm10O1xuXHRcdH0gYnJlYWs7XG5cdFx0Y2FzZSAnaCc6IHN3aXRjaChmbXQpIHsgLyogMTItaG91ciAqL1xuXHRcdFx0Y2FzZSAnaCc6IHJldHVybiAxKyh2YWwuSCsxMSklMTI7XG5cdFx0XHRjYXNlICdoaCc6IHJldHVybiBwYWQoMSsodmFsLkgrMTEpJTEyLCAyKTtcblx0XHRcdGRlZmF1bHQ6IHRocm93ICdiYWQgaG91ciBmb3JtYXQ6ICcgKyBmbXQ7XG5cdFx0fSBicmVhaztcblx0XHRjYXNlICdIJzogc3dpdGNoKGZtdCkgeyAvKiAyNC1ob3VyICovXG5cdFx0XHRjYXNlICdoJzogcmV0dXJuIHZhbC5IO1xuXHRcdFx0Y2FzZSAnaGgnOiByZXR1cm4gcGFkKHZhbC5ILCAyKTtcblx0XHRcdGRlZmF1bHQ6IHRocm93ICdiYWQgaG91ciBmb3JtYXQ6ICcgKyBmbXQ7XG5cdFx0fSBicmVhaztcblx0XHRjYXNlICdNJzogc3dpdGNoKGZtdCkgeyAvKiBtaW51dGVzICovXG5cdFx0XHRjYXNlICdtJzogcmV0dXJuIHZhbC5NO1xuXHRcdFx0Y2FzZSAnbW0nOiByZXR1cm4gcGFkKHZhbC5NLCAyKTtcblx0XHRcdGRlZmF1bHQ6IHRocm93ICdiYWQgbWludXRlIGZvcm1hdDogJyArIGZtdDtcblx0XHR9IGJyZWFrO1xuXHRcdGNhc2UgJ3MnOiBzd2l0Y2goZm10KSB7IC8qIHNlY29uZHMgKi9cblx0XHRcdGNhc2UgJ3MnOiByZXR1cm4gdmFsLlM7XG5cdFx0XHRjYXNlICdzcyc6IHJldHVybiBwYWQodmFsLlMsIDIpO1xuXHRcdFx0Y2FzZSAnc3MuMCc6IHJldHVybiBwYWQodmFsLlMsMikgKyBcIi5cIiArIE1hdGgucm91bmQoMTAqdmFsLnUpO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgJ2JhZCBzZWNvbmQgZm9ybWF0OiAnICsgZm10O1xuXHRcdH0gYnJlYWs7XG5cdFx0Y2FzZSAnWic6IHN3aXRjaChmbXQpIHtcblx0XHRcdGNhc2UgJ1toXSc6IHJldHVybiB2YWwuRCoyNCt2YWwuSDtcblx0XHRcdGRlZmF1bHQ6IHRocm93ICdiYWQgYWJzdGltZSBmb3JtYXQ6ICcgKyBmbXQ7XG5cdFx0fSBicmVhaztcblx0XHQvKiBUT0RPOiBoYW5kbGUgdGhlIEVDTUEgc3BlYyBmb3JtYXQgZWUgLT4geXkgKi9cblx0XHRjYXNlICdlJzogeyByZXR1cm4gdmFsLnk7IH0gYnJlYWs7XG5cdFx0Y2FzZSAnQSc6IHJldHVybiAodmFsLmg+PTEyID8gJ1AnIDogJ0EnKSArIGZtdC5zdWJzdHIoMSk7XG5cdFx0ZGVmYXVsdDogdGhyb3cgJ2JhZCBmb3JtYXQgdHlwZSAnICsgdHlwZSArICcgaW4gJyArIGZtdDtcblx0fVxufTtcblN0cmluZy5wcm90b3R5cGUucmV2ZXJzZSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5zcGxpdChcIlwiKS5yZXZlcnNlKCkuam9pbihcIlwiKTsgfTtcbnZhciBjb21tYWlmeSA9IGZ1bmN0aW9uKHMpIHsgcmV0dXJuIHMucmV2ZXJzZSgpLnJlcGxhY2UoLy4uLi9nLFwiJCYsXCIpLnJldmVyc2UoKS5yZXBsYWNlKC9eLC8sXCJcIik7IH07XG52YXIgd3JpdGVfbnVtID0gZnVuY3Rpb24odHlwZSwgZm10LCB2YWwpIHtcblx0aWYodHlwZSA9PT0gJygnKSB7XG5cdFx0dmFyIGZmbXQgPSBmbXQucmVwbGFjZSgvXFwoICovLFwiXCIpLnJlcGxhY2UoLyBcXCkvLFwiXCIpLnJlcGxhY2UoL1xcKS8sXCJcIik7XG5cdFx0aWYodmFsID49IDApIHJldHVybiB3cml0ZV9udW0oJ24nLCBmZm10LCB2YWwpO1xuXHRcdHJldHVybiAnKCcgKyB3cml0ZV9udW0oJ24nLCBmZm10LCAtdmFsKSArICcpJztcblx0fVxuXHR2YXIgbXVsID0gMCwgbztcblx0Zm10ID0gZm10LnJlcGxhY2UoLyUvZyxmdW5jdGlvbih4KSB7IG11bCsrOyByZXR1cm4gXCJcIjsgfSk7XG5cdGlmKG11bCAhPT0gMCkgcmV0dXJuIHdyaXRlX251bSh0eXBlLCBmbXQsIHZhbCAqIE1hdGgucG93KDEwLDIqbXVsKSkgKyBmaWxsKFwiJVwiLG11bCk7XG5cdGlmKGZtdC5pbmRleE9mKFwiRVwiKSA+IC0xKSB7XG5cdFx0dmFyIGlkeCA9IGZtdC5pbmRleE9mKFwiRVwiKSAtIGZtdC5pbmRleE9mKFwiLlwiKSAtIDE7XG5cdFx0aWYoZm10ID09ICcjIzAuMEUrMCcpIHtcblx0XHRcdHZhciBlZSA9IE51bWJlcih2YWwudG9FeHBvbmVudGlhbCgwKS5zdWJzdHIoMykpJTM7XG5cdFx0XHRvID0gKHZhbC9NYXRoLnBvdygxMCxlZSUzKSkudG9QcmVjaXNpb24oaWR4KzErKGVlJTMpKS5yZXBsYWNlKC9eKFsrLV0/KShbMC05XSopXFwuKFswLTldKilbRWVdLyxmdW5jdGlvbigkJCwkMSwkMiwkMykgeyByZXR1cm4gJDEgKyAkMiArICQzLnN1YnN0cigwLGVlKSArIFwiLlwiICsgJDMuc3Vic3RyKGVlKSArIFwiRVwiOyB9KTtcblx0XHR9IGVsc2UgbyA9IHZhbC50b0V4cG9uZW50aWFsKGlkeCk7XG5cdFx0aWYoZm10Lm1hdGNoKC9FXFwrMDAkLykgJiYgby5tYXRjaCgvZVsrLV1bMC05XSQvKSkgbyA9IG8uc3Vic3RyKDAsby5sZW5ndGgtMSkgKyBcIjBcIiArIG9bby5sZW5ndGgtMV07XG5cdFx0aWYoZm10Lm1hdGNoKC9FXFwtLykgJiYgby5tYXRjaCgvZVxcKy8pKSBvID0gby5yZXBsYWNlKC9lXFwrLyxcImVcIik7XG5cdFx0cmV0dXJuIG8ucmVwbGFjZShcImVcIixcIkVcIik7XG5cdH1cbiAgaWYoZm10WzBdID09PSBcIiRcIikgcmV0dXJuIFwiJFwiK3dyaXRlX251bSh0eXBlLGZtdC5zdWJzdHIoZm10WzFdPT0nICc/MjoxKSx2YWwpO1xuXHR2YXIgciwgZmYsIGF2YWwgPSB2YWwgPCAwID8gLXZhbCA6IHZhbCwgc2lnbiA9IHZhbCA8IDAgPyBcIi1cIiA6IFwiXCI7XG5cdGlmKChyID0gZm10Lm1hdGNoKC8jIChcXD8rKSBcXC8gKFxcZCspLykpKSB7XG5cdFx0dmFyIGRlbiA9IE51bWJlcihyWzJdKSwgcm5kID0gTWF0aC5yb3VuZChhdmFsICogZGVuKSwgYmFzZSA9IE1hdGguZmxvb3Iocm5kL2Rlbik7XG5cdFx0dmFyIG15biA9IChybmQgLSBiYXNlKmRlbiksIG15ZCA9IGRlbjtcblx0XHRyZXR1cm4gc2lnbiArIChiYXNlP2Jhc2U6XCJcIikgKyBcIiBcIiArIChteW4gPT09IDAgPyBmaWxsKFwiIFwiLCByWzFdLmxlbmd0aCArIDEgKyByWzJdLmxlbmd0aCkgOiBwYWQobXluLHJbMV0ubGVuZ3RoLFwiIFwiKSArIFwiL1wiICsgcGFkKG15ZCxyWzJdLmxlbmd0aCkpO1xuXHR9XG5cdGlmKGZtdC5tYXRjaCgvXjAwKiQvKSkgcmV0dXJuICh2YWw8MD9cIi1cIjpcIlwiKStwYWQoTWF0aC5yb3VuZChNYXRoLmFicyh2YWwpKSwgZm10Lmxlbmd0aCk7XG5cdGlmKGZtdC5tYXRjaCgvXiMjIyMqJC8pKSByZXR1cm4gXCJkYWZ1cVwiO1xuXHRzd2l0Y2goZm10KSB7XG5cdFx0Y2FzZSBcIjBcIjogcmV0dXJuIE1hdGgucm91bmQodmFsKTtcblx0XHRjYXNlIFwiMC4wXCI6IG8gPSBNYXRoLnJvdW5kKHZhbCoxMCk7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKG8vMTApLnJlcGxhY2UoL14oW15cXC5dKykkLyxcIiQxLjBcIikucmVwbGFjZSgvXFwuJC8sXCIuMFwiKTtcblx0XHRjYXNlIFwiMC4wMFwiOiBvID0gTWF0aC5yb3VuZCh2YWwqMTAwKTtcblx0XHRcdHJldHVybiBTdHJpbmcoby8xMDApLnJlcGxhY2UoL14oW15cXC5dKykkLyxcIiQxLjAwXCIpLnJlcGxhY2UoL1xcLiQvLFwiLjAwXCIpLnJlcGxhY2UoL1xcLihbMC05XSkkLyxcIi4kMVwiK1wiMFwiKTtcblx0XHRjYXNlIFwiMC4wMDBcIjogbyA9IE1hdGgucm91bmQodmFsKjEwMDApO1xuXHRcdFx0cmV0dXJuIFN0cmluZyhvLzEwMDApLnJlcGxhY2UoL14oW15cXC5dKykkLyxcIiQxLjAwMFwiKS5yZXBsYWNlKC9cXC4kLyxcIi4wMDBcIikucmVwbGFjZSgvXFwuKFswLTldKSQvLFwiLiQxXCIrXCIwMFwiKS5yZXBsYWNlKC9cXC4oWzAtOV1bMC05XSkkLyxcIi4kMVwiK1wiMFwiKTtcblx0XHRjYXNlIFwiIywjIzBcIjogcmV0dXJuIHNpZ24gKyBjb21tYWlmeShTdHJpbmcoTWF0aC5yb3VuZChhdmFsKSkpO1xuXHRcdGNhc2UgXCIjLCMjMC4wXCI6IHIgPSBNYXRoLnJvdW5kKCh2YWwtTWF0aC5mbG9vcih2YWwpKSoxMCk7IHJldHVybiB2YWwgPCAwID8gXCItXCIgKyB3cml0ZV9udW0odHlwZSwgZm10LCAtdmFsKSA6IGNvbW1haWZ5KFN0cmluZyhNYXRoLmZsb29yKHZhbCkpKSArIFwiLlwiICsgcjtcblx0XHRjYXNlIFwiIywjIzAuMDBcIjogciA9IE1hdGgucm91bmQoKHZhbC1NYXRoLmZsb29yKHZhbCkpKjEwMCk7IHJldHVybiB2YWwgPCAwID8gXCItXCIgKyB3cml0ZV9udW0odHlwZSwgZm10LCAtdmFsKSA6IGNvbW1haWZ5KFN0cmluZyhNYXRoLmZsb29yKHZhbCkpKSArIFwiLlwiICsgKHIgPCAxMCA/IFwiMFwiK3I6cik7XG5cdFx0Y2FzZSBcIiMgPyAvID9cIjogZmYgPSBmcmFjKGF2YWwsIDksIHRydWUpOyByZXR1cm4gc2lnbiArIChmZlswXXx8XCJcIikgKyBcIiBcIiArIChmZlsxXSA9PT0gMCA/IFwiICAgXCIgOiBmZlsxXSArIFwiL1wiICsgZmZbMl0pO1xuXHRcdGNhc2UgXCIjID8/IC8gPz9cIjogZmYgPSBmcmFjKGF2YWwsIDk5LCB0cnVlKTsgcmV0dXJuIHNpZ24gKyAoZmZbMF18fFwiXCIpICsgXCIgXCIgKyAoZmZbMV0gPyBwYWQoZmZbMV0sMixcIiBcIikgKyBcIi9cIiArIHJwYWQoZmZbMl0sMixcIiBcIikgOiBcIiAgICAgXCIpO1xuXHRcdGNhc2UgXCIjID8/PyAvID8/P1wiOiBmZiA9IGZyYWMoYXZhbCwgOTk5LCB0cnVlKTsgcmV0dXJuIHNpZ24gKyAoZmZbMF18fFwiXCIpICsgXCIgXCIgKyAoZmZbMV0gPyBwYWQoZmZbMV0sMyxcIiBcIikgKyBcIi9cIiArIHJwYWQoZmZbMl0sMyxcIiBcIikgOiBcIiAgICAgICBcIik7XG5cdFx0ZGVmYXVsdDpcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoXCJ1bnN1cHBvcnRlZCBmb3JtYXQgfFwiICsgZm10ICsgXCJ8XCIpO1xufTtcbmZ1bmN0aW9uIHNwbGl0X2ZtdChmbXQpIHtcblx0dmFyIG91dCA9IFtdO1xuXHR2YXIgaW5fc3RyID0gLTE7XG5cdGZvcih2YXIgaSA9IDAsIGogPSAwOyBpIDwgZm10Lmxlbmd0aDsgKytpKSB7XG5cdFx0aWYoaW5fc3RyICE9IC0xKSB7IGlmKGZtdFtpXSA9PSAnXCInKSBpbl9zdHIgPSAtMTsgY29udGludWU7IH1cblx0XHRpZihmbXRbaV0gPT0gXCJfXCIgfHwgZm10W2ldID09IFwiKlwiIHx8IGZtdFtpXSA9PSBcIlxcXFxcIikgeyArK2k7IGNvbnRpbnVlOyB9XG5cdFx0aWYoZm10W2ldID09ICdcIicpIHsgaW5fc3RyID0gaTsgY29udGludWU7IH1cblx0XHRpZihmbXRbaV0gIT0gXCI7XCIpIGNvbnRpbnVlO1xuXHRcdG91dC5wdXNoKGZtdC5zbGljZShqLGkpKTtcblx0XHRqID0gaSsxO1xuXHR9XG5cdG91dC5wdXNoKGZtdC5zbGljZShqKSk7XG5cdGlmKGluX3N0ciAhPS0xKSB0aHJvdyBcIkZvcm1hdCB8XCIgKyBmbXQgKyBcInwgdW50ZXJtaW5hdGVkIHN0cmluZyBhdCBcIiArIGluX3N0cjtcblx0cmV0dXJuIG91dDtcbn1cblNTRi5fc3BsaXQgPSBzcGxpdF9mbXQ7XG5mdW5jdGlvbiBldmFsX2ZtdChmbXQsIHYsIG9wdHMsIGZsZW4pIHtcblx0dmFyIG91dCA9IFtdLCBvID0gXCJcIiwgaSA9IDAsIGMgPSBcIlwiLCBsc3Q9J3QnLCBxID0ge30sIGR0O1xuXHRmaXhvcHRzKG9wdHMgPSAob3B0cyB8fCB7fSkpO1xuXHR2YXIgaHI9J0gnO1xuXHQvKiBUb2tlbml6ZSAqL1xuXHR3aGlsZShpIDwgZm10Lmxlbmd0aCkge1xuXHRcdHN3aXRjaCgoYyA9IGZtdFtpXSkpIHtcblx0XHRcdGNhc2UgJ1wiJzogLyogTGl0ZXJhbCB0ZXh0ICovXG5cdFx0XHRcdGZvcihvPVwiXCI7Zm10WysraV0gIT09ICdcIicgJiYgaSA8IGZtdC5sZW5ndGg7KSBvICs9IGZtdFtpXTtcblx0XHRcdFx0b3V0LnB1c2goe3Q6J3QnLCB2Om99KTsgKytpOyBicmVhaztcblx0XHRcdGNhc2UgJ1xcXFwnOiB2YXIgdyA9IGZtdFsrK2ldLCB0ID0gXCIoKVwiLmluZGV4T2YodykgPT09IC0xID8gJ3QnIDogdztcblx0XHRcdFx0b3V0LnB1c2goe3Q6dCwgdjp3fSk7ICsraTsgYnJlYWs7XG5cdFx0XHRjYXNlICdfJzogb3V0LnB1c2goe3Q6J3QnLCB2OlwiIFwifSk7IGkrPTI7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnQCc6IC8qIFRleHQgUGxhY2Vob2xkZXIgKi9cblx0XHRcdFx0b3V0LnB1c2goe3Q6J1QnLCB2OnZ9KTsgKytpOyBicmVhaztcblx0XHRcdC8qIERhdGVzICovXG5cdFx0XHRjYXNlICdtJzogY2FzZSAnZCc6IGNhc2UgJ3knOiBjYXNlICdoJzogY2FzZSAncyc6IGNhc2UgJ2UnOlxuXHRcdFx0XHRpZih2IDwgMCkgcmV0dXJuIFwiXCI7XG5cdFx0XHRcdGlmKCFkdCkgZHQgPSBwYXJzZV9kYXRlX2NvZGUodiwgb3B0cyk7XG5cdFx0XHRcdG8gPSBmbXRbaV07IHdoaWxlKGZtdFsrK2ldID09PSBjKSBvKz1jO1xuXHRcdFx0XHRpZihjID09PSAncycgJiYgZm10W2ldID09PSAnLicgJiYgZm10W2krMV0gPT09ICcwJykgeyBvKz0nLic7IHdoaWxlKGZtdFsrK2ldID09PSAnMCcpIG8rPSAnMCc7IH1cblx0XHRcdFx0aWYoYyA9PT0gJ20nICYmIGxzdC50b0xvd2VyQ2FzZSgpID09PSAnaCcpIGMgPSAnTSc7IC8qIG0gPSBtaW51dGUgKi9cblx0XHRcdFx0aWYoYyA9PT0gJ2gnKSBjID0gaHI7XG5cdFx0XHRcdHE9e3Q6YywgdjpvfTsgb3V0LnB1c2gocSk7IGxzdCA9IGM7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnQSc6XG5cdFx0XHRcdGlmKCFkdCkgZHQgPSBwYXJzZV9kYXRlX2NvZGUodiwgb3B0cyk7XG5cdFx0XHRcdHE9e3Q6Yyx2OlwiQVwifTtcblx0XHRcdFx0aWYoZm10LnN1YnN0cihpLCAzKSA9PT0gXCJBL1BcIikge3EudiA9IGR0LkggPj0gMTIgPyBcIlBcIiA6IFwiQVwiOyBxLnQgPSAnVCc7IGhyPSdoJztpKz0zO31cblx0XHRcdFx0ZWxzZSBpZihmbXQuc3Vic3RyKGksNSkgPT09IFwiQU0vUE1cIikgeyBxLnYgPSBkdC5IID49IDEyID8gXCJQTVwiIDogXCJBTVwiOyBxLnQgPSAnVCc7IGkrPTU7IGhyPSdoJzsgfVxuXHRcdFx0XHRlbHNlIHEudCA9IFwidFwiO1xuXHRcdFx0XHRvdXQucHVzaChxKTsgbHN0ID0gYzsgYnJlYWs7XG5cdFx0XHRjYXNlICdbJzogLyogVE9ETzogRml4IHRoaXMgLS0gaWdub3JlIGFsbCBjb25kaXRpb25hbHMgYW5kIGZvcm1hdHRpbmcgKi9cblx0XHRcdFx0byA9IGM7XG5cdFx0XHRcdHdoaWxlKGZtdFtpKytdICE9PSAnXScpIG8gKz0gZm10W2ldO1xuXHRcdFx0XHRpZihvID09IFwiW2hdXCIpIG91dC5wdXNoKHt0OidaJywgdjpvfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0LyogTnVtYmVycyAqL1xuXHRcdFx0Y2FzZSAnMCc6IGNhc2UgJyMnOlxuXHRcdFx0XHRvID0gYzsgd2hpbGUoXCIwIz8uLEUrLSVcIi5pbmRleE9mKGM9Zm10WysraV0pID4gLTEpIG8gKz0gYztcblx0XHRcdFx0b3V0LnB1c2goe3Q6J24nLCB2Om99KTsgYnJlYWs7XG5cdFx0XHRjYXNlICc/Jzpcblx0XHRcdFx0byA9IGZtdFtpXTsgd2hpbGUoZm10WysraV0gPT09IGMpIG8rPWM7XG5cdFx0XHRcdHE9e3Q6YywgdjpvfTsgb3V0LnB1c2gocSk7IGxzdCA9IGM7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnKic6ICsraTsgaWYoZm10W2ldID09ICcgJykgKytpOyBicmVhazsgLy8gKipcblx0XHRcdGNhc2UgJygnOiBjYXNlICcpJzogb3V0LnB1c2goe3Q6KGZsZW49PT0xPyd0JzpjKSx2OmN9KTsgKytpOyBicmVhaztcblx0XHRcdGNhc2UgJzEnOiBjYXNlICcyJzogY2FzZSAnMyc6IGNhc2UgJzQnOiBjYXNlICc1JzogY2FzZSAnNic6IGNhc2UgJzcnOiBjYXNlICc4JzogY2FzZSAnOSc6XG5cdFx0XHRcdG8gPSBmbXRbaV07IHdoaWxlKFwiMDEyMzQ1Njc4OVwiLmluZGV4T2YoZm10WysraV0pID4gLTEpIG8rPWZtdFtpXTtcblx0XHRcdFx0b3V0LnB1c2goe3Q6J0QnLCB2Om99KTsgYnJlYWs7XG5cdFx0XHRjYXNlICcgJzogb3V0LnB1c2goe3Q6Yyx2OmN9KTsgKytpOyBicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGlmKFwiJC0rLygpOiFeJid+e308Pj1cIi5pbmRleE9mKGMpID09PSAtMSlcblx0XHRcdFx0XHR0aHJvdyAndW5yZWNvZ25pemVkIGNoYXJhY3RlciAnICsgZm10W2ldICsgJyBpbiAnICsgZm10O1xuXHRcdFx0XHRvdXQucHVzaCh7dDondCcsIHY6Y30pOyArK2k7IGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8qIHdhbGsgYmFja3dhcmRzICovXG5cdGZvcihpPW91dC5sZW5ndGgtMSwgbHN0PSd0JzsgaSA+PSAwOyAtLWkpIHtcblx0XHRzd2l0Y2gob3V0W2ldLnQpIHtcblx0XHRcdGNhc2UgJ2gnOiBjYXNlICdIJzogb3V0W2ldLnQgPSBocjsgbHN0PSdoJzsgYnJlYWs7XG5cdFx0XHRjYXNlICdkJzogY2FzZSAneSc6IGNhc2UgJ3MnOiBjYXNlICdNJzogY2FzZSAnZSc6IGxzdD1vdXRbaV0udDsgYnJlYWs7XG5cdFx0XHRjYXNlICdtJzogaWYobHN0ID09PSAncycpIG91dFtpXS50ID0gJ00nOyBicmVhaztcblx0XHR9XG5cdH1cblxuXHQvKiByZXBsYWNlIGZpZWxkcyAqL1xuXHRmb3IoaT0wOyBpIDwgb3V0Lmxlbmd0aDsgKytpKSB7XG5cdFx0c3dpdGNoKG91dFtpXS50KSB7XG5cdFx0XHRjYXNlICd0JzogY2FzZSAnVCc6IGNhc2UgJyAnOiBicmVhaztcblx0XHRcdGNhc2UgJ2QnOiBjYXNlICdtJzogY2FzZSAneSc6IGNhc2UgJ2gnOiBjYXNlICdIJzogY2FzZSAnTSc6IGNhc2UgJ3MnOiBjYXNlICdBJzogY2FzZSAnZSc6IGNhc2UgJ1onOlxuXHRcdFx0XHRvdXRbaV0udiA9IHdyaXRlX2RhdGUob3V0W2ldLnQsIG91dFtpXS52LCBkdCk7XG5cdFx0XHRcdG91dFtpXS50ID0gJ3QnOyBicmVhaztcblx0XHRcdGNhc2UgJ24nOiBjYXNlICcoJzpcblx0XHRcdFx0dmFyIGpqID0gaSsxO1xuXHRcdFx0XHR3aGlsZShvdXRbampdICYmIChcIj8gRFwiLmluZGV4T2Yob3V0W2pqXS50KSA+IC0xIHx8IG91dFtpXS50ID09ICcoJyAmJiAob3V0W2pqXS50ID09ICcpJyB8fCBvdXRbampdLnQgPT0gJ24nKSB8fCBvdXRbampdLnQgPT0gJ3QnICYmIChvdXRbampdLnYgPT0gJy8nIHx8IG91dFtqal0udiA9PSAnJCcgfHwgKG91dFtqal0udiA9PSAnICcgJiYgKG91dFtqaisxXXx8e30pLnQgPT0gJz8nKSkpKSB7XG5cdFx0XHRcdFx0aWYob3V0W2pqXS52IT09JyAnKSBvdXRbaV0udiArPSAnICcgKyBvdXRbampdLnY7XG5cdFx0XHRcdFx0ZGVsZXRlIG91dFtqal07ICsramo7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3V0W2ldLnYgPSB3cml0ZV9udW0ob3V0W2ldLnQsIG91dFtpXS52LCB2KTtcblx0XHRcdFx0b3V0W2ldLnQgPSAndCc7XG5cdFx0XHRcdGkgPSBqajsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB0aHJvdyBcInVucmVjb2duaXplZCB0eXBlIFwiICsgb3V0W2ldLnQ7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG91dC5tYXAoZnVuY3Rpb24oeCl7cmV0dXJuIHgudjt9KS5qb2luKFwiXCIpO1xufVxuU1NGLl9ldmFsID0gZXZhbF9mbXQ7XG5mdW5jdGlvbiBjaG9vc2VfZm10KGZtdCwgdiwgbykge1xuXHRpZih0eXBlb2YgZm10ID09PSAnbnVtYmVyJykgZm10ID0gdGFibGVfZm10W2ZtdF07XG5cdGlmKHR5cGVvZiBmbXQgPT09IFwic3RyaW5nXCIpIGZtdCA9IHNwbGl0X2ZtdChmbXQpO1xuXHR2YXIgbCA9IGZtdC5sZW5ndGg7XG5cdHN3aXRjaChmbXQubGVuZ3RoKSB7XG5cdFx0Y2FzZSAxOiBmbXQgPSBbZm10WzBdLCBmbXRbMF0sIGZtdFswXSwgXCJAXCJdOyBicmVhaztcblx0XHRjYXNlIDI6IGZtdCA9IFtmbXRbMF0sIGZtdFtmbXRbMV0gPT09IFwiQFwiPzA6MV0sIGZtdFswXSwgXCJAXCJdOyBicmVhaztcblx0XHRjYXNlIDQ6IGJyZWFrO1xuXHRcdGRlZmF1bHQ6IHRocm93IFwiY2Fubm90IGZpbmQgcmlnaHQgZm9ybWF0IGZvciB8XCIgKyBmbXQgKyBcInxcIjtcblx0fVxuXHRpZih0eXBlb2YgdiAhPT0gXCJudW1iZXJcIikgcmV0dXJuIFtmbXQubGVuZ3RoLCBmbXRbM11dO1xuXHRyZXR1cm4gW2wsIHYgPiAwID8gZm10WzBdIDogdiA8IDAgPyBmbXRbMV0gOiBmbXRbMl1dO1xufVxuXG52YXIgZm9ybWF0ID0gZnVuY3Rpb24gZm9ybWF0KGZtdCx2LG8pIHtcblx0Zml4b3B0cyhvID0gKG98fHt9KSk7XG5cdGlmKGZtdCA9PT0gMCkgcmV0dXJuIGdlbmVyYWxfZm10KHYsIG8pO1xuXHRpZih0eXBlb2YgZm10ID09PSAnbnVtYmVyJykgZm10ID0gdGFibGVfZm10W2ZtdF07XG5cdHZhciBmID0gY2hvb3NlX2ZtdChmbXQsIHYsIG8pO1xuXHRyZXR1cm4gZXZhbF9mbXQoZlsxXSwgdiwgbywgZlswXSk7XG59O1xuXG5TU0YuX2Nob29zZSA9IGNob29zZV9mbXQ7XG5TU0YuX3RhYmxlID0gdGFibGVfZm10O1xuU1NGLmxvYWQgPSBmdW5jdGlvbihmbXQsIGlkeCkgeyB0YWJsZV9mbXRbaWR4XSA9IGZtdDsgfTtcblNTRi5mb3JtYXQgPSBmb3JtYXQ7XG59O1xubWFrZV9zc2YoU1NGKTtcbnZhciBYTFNYID0ge307XG4oZnVuY3Rpb24oWExTWCl7XG5mdW5jdGlvbiBwYXJzZXhtbHRhZyh0YWcpIHtcblx0dmFyIHdvcmRzID0gdGFnLnNwbGl0KC9cXHMrLyk7XG5cdHZhciB6ID0geycwJzogd29yZHNbMF19O1xuXHRpZih3b3Jkcy5sZW5ndGggPT09IDEpIHJldHVybiB6O1xuXHQodGFnLm1hdGNoKC8oXFx3Kyk9XCIoW15cIl0qKVwiL2cpIHx8IFtdKS5tYXAoXG5cdFx0ZnVuY3Rpb24oeCl7dmFyIHk9eC5tYXRjaCgvKFxcdyspPVwiKFteXCJdKilcIi8pOyB6W3lbMV1dID0geVsyXTsgfSk7XG5cdHJldHVybiB6O1xufVxuXG52YXIgZW5jb2RpbmdzID0ge1xuXHQnJnF1b3Q7JzogJ1wiJyxcblx0JyZhcG9zOyc6IFwiJ1wiLFxuXHQnJmd0Oyc6ICc+Jyxcblx0JyZsdDsnOiAnPCcsXG5cdCcmYW1wOyc6ICcmJ1xufTtcblxuLy8gVE9ETzogQ1AgcmVtYXAgKG5lZWQgdG8gcmVhZCBmaWxlIHZlcnNpb24gdG8gZGV0ZXJtaW5lIE9TKVxuZnVuY3Rpb24gdW5lc2NhcGV4bWwodGV4dCl7XG5cdHZhciBzID0gdGV4dCArICcnO1xuXHRmb3IodmFyIHkgaW4gZW5jb2RpbmdzKSBzID0gcy5yZXBsYWNlKG5ldyBSZWdFeHAoeSwnZycpLCBlbmNvZGluZ3NbeV0pO1xuXHRyZXR1cm4gcy5yZXBsYWNlKC9feChbMC05YS1mQS1GXSopXy9nLGZ1bmN0aW9uKG0sYykge3JldHVybiBfY2hyKHBhcnNlSW50KGMsMTYpKTt9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2V4bWxib29sKHZhbHVlLCB0YWcpIHtcblx0c3dpdGNoKHZhbHVlKSB7XG5cdFx0Y2FzZSAnMCc6IGNhc2UgMDogY2FzZSAnZmFsc2UnOiBjYXNlICdGQUxTRSc6IHJldHVybiBmYWxzZTtcblx0XHRjYXNlICcxJzogY2FzZSAxOiBjYXNlICd0cnVlJzogY2FzZSAnVFJVRSc6IHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6IHRocm93IFwiYmFkIGJvb2xlYW4gdmFsdWUgXCIgKyB2YWx1ZSArIFwiIGluIFwiKyh0YWd8fFwiP1wiKTtcblx0fVxufVxuXG52YXIgdXRmOHJlYWQgPSBmdW5jdGlvbihvcmlnKSB7XG5cdHZhciBvdXQgPSBcIlwiLCBpID0gMCwgYyA9IDAsIGMxID0gMCwgYzIgPSAwLCBjMyA9IDA7XG5cdHdoaWxlIChpIDwgb3JpZy5sZW5ndGgpIHtcblx0XHRjID0gb3JpZy5jaGFyQ29kZUF0KGkrKyk7XG5cdFx0aWYgKGMgPCAxMjgpIG91dCArPSBfY2hyKGMpO1xuXHRcdGVsc2Uge1xuXHRcdFx0YzIgPSBvcmlnLmNoYXJDb2RlQXQoaSsrKTtcblx0XHRcdGlmIChjPjE5MSAmJiBjPDIyNCkgb3V0ICs9IF9jaHIoKGMgJiAzMSkgPDwgNiB8IGMyICYgNjMpO1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGMzID0gb3JpZy5jaGFyQ29kZUF0KGkrKyk7XG5cdFx0XHRcdG91dCArPSBfY2hyKChjICYgMTUpIDw8IDEyIHwgKGMyICYgNjMpIDw8IDYgfCBjMyAmIDYzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn07XG5cbi8vIG1hdGNoZXMgPGZvbz4uLi48L2Zvbz4gZXh0cmFjdHMgY29udGVudFxuZnVuY3Rpb24gbWF0Y2h0YWcoZixnKSB7cmV0dXJuIG5ldyBSZWdFeHAoJzwnK2YrJyg/OiB4bWw6c3BhY2U9XCJwcmVzZXJ2ZVwiKT8+KFteXFx1MjYwM10qKTwvJytmKyc+JywoZ3x8XCJcIikrXCJtXCIpO31cblxuZnVuY3Rpb24gcGFyc2VWZWN0b3IoZGF0YSkge1xuXHR2YXIgaCA9IHBhcnNleG1sdGFnKGRhdGEpO1xuXG5cdHZhciBtYXRjaGVzID0gZGF0YS5tYXRjaChuZXcgUmVnRXhwKFwiPHZ0OlwiICsgaC5iYXNlVHlwZSArIFwiPiguKj8pPC92dDpcIiArIGguYmFzZVR5cGUgKyBcIj5cIiwgJ2cnKSl8fFtdO1xuXHRpZihtYXRjaGVzLmxlbmd0aCAhPSBoLnNpemUpIHRocm93IFwidW5leHBlY3RlZCB2ZWN0b3IgbGVuZ3RoIFwiICsgbWF0Y2hlcy5sZW5ndGggKyBcIiAhPSBcIiArIGguc2l6ZTtcblx0dmFyIHJlcyA9IFtdO1xuXHRtYXRjaGVzLmZvckVhY2goZnVuY3Rpb24oeCkge1xuXHRcdHZhciB2ID0geC5yZXBsYWNlKC88Wy9dP3Z0OnZhcmlhbnQ+L2csXCJcIikubWF0Y2goLzx2dDooW14+XSopPiguKik8Lyk7XG5cdFx0cmVzLnB1c2goe3Y6dlsyXSwgdDp2WzFdfSk7XG5cdH0pO1xuXHRyZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiBpc3ZhbCh4KSB7IHJldHVybiB0eXBlb2YgeCAhPT0gXCJ1bmRlZmluZWRcIiAmJiB4ICE9PSBudWxsOyB9XG4vKiAxOC40IFNoYXJlZCBTdHJpbmcgVGFibGUgKi9cbnZhciBwYXJzZV9zc3QgPSAoZnVuY3Rpb24oKXtcblx0dmFyIHRyZWdleCA9IG1hdGNodGFnKFwidFwiKSwgcnByZWdleCA9IG1hdGNodGFnKFwiclByXCIpO1xuXHQvKiBQYXJzZSBhIGxpc3Qgb2YgPHI+IHRhZ3MgKi9cblx0dmFyIHBhcnNlX3JzID0gKGZ1bmN0aW9uKCkge1xuXHRcdC8qIDE4LjQuNyByUHIgQ1RfUlByRWx0ICovXG5cdFx0dmFyIHBhcnNlX3JwciA9IGZ1bmN0aW9uKHJwciwgaW50cm8sIG91dHJvKSB7XG5cdFx0XHR2YXIgZm9udCA9IHt9O1xuXHRcdFx0KHJwci5tYXRjaCgvPFtePl0qPi9nKXx8W10pLmZvckVhY2goZnVuY3Rpb24oeCkge1xuXHRcdFx0XHR2YXIgeSA9IHBhcnNleG1sdGFnKHgpO1xuXHRcdFx0XHRzd2l0Y2goeVswXSkge1xuXHRcdFx0XHRcdC8qIDE4LjguMTIgY29uZGVuc2UgQ1RfQm9vbGVhblByb3BlcnR5ICovXG5cdFx0XHRcdFx0LyogKiogbm90IHJlcXVpcmVkIC4gKi9cblx0XHRcdFx0XHRjYXNlICc8Y29uZGVuc2UnOiBicmVhaztcblx0XHRcdFx0XHQvKiAxOC44LjE3IGV4dGVuZCBDVF9Cb29sZWFuUHJvcGVydHkgKi9cblx0XHRcdFx0XHQvKiAqKiBub3QgcmVxdWlyZWQgLiAqL1xuXHRcdFx0XHRcdGNhc2UgJzxleHRlbmQnOiBicmVhaztcblx0XHRcdFx0XHQvKiAxOC44LjM2IHNoYWRvdyBDVF9Cb29sZWFuUHJvcGVydHkgKi9cblx0XHRcdFx0XHQvKiAqKiBub3QgcmVxdWlyZWQgLiAqL1xuXHRcdFx0XHRcdGNhc2UgJzxzaGFkb3cnOiBicmVhaztcblxuXHRcdFx0XHRcdC8qIDE4LjQuMSBjaGFyc2V0IENUX0ludFByb3BlcnR5IFRPRE8gKi9cblx0XHRcdFx0XHRjYXNlICc8Y2hhcnNldCc6IGJyZWFrO1xuXG5cdFx0XHRcdFx0LyogMTguNC4yIG91dGxpbmUgQ1RfQm9vbGVhblByb3BlcnR5IFRPRE8gKi9cblx0XHRcdFx0XHRjYXNlICc8b3V0bGluZSc6IGJyZWFrO1xuXG5cdFx0XHRcdFx0LyogMTguNC41IHJGb250IENUX0ZvbnROYW1lICovXG5cdFx0XHRcdFx0Y2FzZSAnPHJGb250JzogZm9udC5uYW1lID0geS52YWw7IGJyZWFrO1xuXG5cdFx0XHRcdFx0LyogMTguNC4xMSBzeiBDVF9Gb250U2l6ZSAqL1xuXHRcdFx0XHRcdGNhc2UgJzxzeic6IGZvbnQuc3ogPSB5LnZhbDsgYnJlYWs7XG5cblx0XHRcdFx0XHQvKiAxOC40LjEwIHN0cmlrZSBDVF9Cb29sZWFuUHJvcGVydHkgKi9cblx0XHRcdFx0XHRjYXNlICc8c3RyaWtlJzpcblx0XHRcdFx0XHRcdGlmKCF5LnZhbCkgYnJlYWs7XG5cdFx0XHRcdFx0XHQvKiBmYWxscyB0aHJvdWdoICovXG5cdFx0XHRcdFx0Y2FzZSAnPHN0cmlrZS8+JzogZm9udC5zdHJpa2UgPSAxOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICc8L3N0cmlrZT4nOiBicmVhaztcblxuXHRcdFx0XHRcdC8qIDE4LjQuMTMgdSBDVF9VbmRlcmxpbmVQcm9wZXJ0eSAqL1xuXHRcdFx0XHRcdGNhc2UgJzx1Jzpcblx0XHRcdFx0XHRcdGlmKCF5LnZhbCkgYnJlYWs7XG5cdFx0XHRcdFx0XHQvKiBmYWxscyB0aHJvdWdoICovXG5cdFx0XHRcdFx0Y2FzZSAnPHUvPic6IGZvbnQudSA9IDE7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJzwvdT4nOiBicmVhaztcblxuXHRcdFx0XHRcdC8qIDE4LjguMiBiICovXG5cdFx0XHRcdFx0Y2FzZSAnPGInOlxuXHRcdFx0XHRcdFx0aWYoIXkudmFsKSBicmVhaztcblx0XHRcdFx0XHRcdC8qIGZhbGxzIHRocm91Z2ggKi9cblx0XHRcdFx0XHRjYXNlICc8Yi8+JzogZm9udC5iID0gMTsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnPC9iPic6IGJyZWFrO1xuXG5cdFx0XHRcdFx0LyogMTguOC4yNiBpICovXG5cdFx0XHRcdFx0Y2FzZSAnPGknOlxuXHRcdFx0XHRcdFx0aWYoIXkudmFsKSBicmVhaztcblx0XHRcdFx0XHRcdC8qIGZhbGxzIHRocm91Z2ggKi9cblx0XHRcdFx0XHRjYXNlICc8aS8+JzogZm9udC5pID0gMTsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnPC9pPic6IGJyZWFrO1xuXG5cdFx0XHRcdFx0LyogMTguMy4xLjE1IGNvbG9yIENUX0NvbG9yIFRPRE86IHRpbnQsIHRoZW1lLCBhdXRvLCBpbmRleGVkICovXG5cdFx0XHRcdFx0Y2FzZSAnPGNvbG9yJzpcblx0XHRcdFx0XHRcdGlmKHkucmdiKSBmb250LmNvbG9yID0geS5yZ2Iuc3Vic3RyKDIsNik7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdC8qIDE4LjguMTggZmFtaWx5IFNUX0ZvbnRGYW1pbHkgKi9cblx0XHRcdFx0XHRjYXNlICc8ZmFtaWx5JzogZm9udC5mYW1pbHkgPSB5LnZhbDsgYnJlYWs7XG5cblx0XHRcdFx0XHQvKiAxOC40LjE0IHZlcnRBbGlnbiBDVF9WZXJ0aWNhbEFsaWduRm9udFByb3BlcnR5IFRPRE8gKi9cblx0XHRcdFx0XHRjYXNlICc8dmVydEFsaWduJzogYnJlYWs7XG5cblx0XHRcdFx0XHQvKiAxOC44LjM1IHNjaGVtZSBDVF9Gb250U2NoZW1lIFRPRE8gKi9cblx0XHRcdFx0XHRjYXNlICc8c2NoZW1lJzogYnJlYWs7XG5cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0aWYoeVswXVsyXSAhPT0gJy8nKSB0aHJvdyAnVW5yZWNvZ25pemVkIHJpY2ggZm9ybWF0ICcgKyB5WzBdO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdC8qIFRPRE86IFRoZXNlIHNob3VsZCBiZSBnZW5lcmF0ZWQgc3R5bGVzLCBub3QgaW5saW5lICovXG5cdFx0XHR2YXIgc3R5bGUgPSBbXTtcblx0XHRcdGlmKGZvbnQuYikgc3R5bGUucHVzaChcImZvbnQtd2VpZ2h0OiBib2xkO1wiKTtcblx0XHRcdGlmKGZvbnQuaSkgc3R5bGUucHVzaChcImZvbnQtc3R5bGU6IGl0YWxpYztcIik7XG5cdFx0XHRpbnRyby5wdXNoKCc8c3BhbiBzdHlsZT1cIicgKyBzdHlsZS5qb2luKFwiXCIpICsgJ1wiPicpO1xuXHRcdFx0b3V0cm8ucHVzaChcIjwvc3Bhbj5cIik7XG5cdFx0fTtcblxuXHRcdC8qIDE4LjQuNCByIENUX1JFbHQgKi9cblx0XHRmdW5jdGlvbiBwYXJzZV9yKHIpIHtcblx0XHRcdHZhciB0ZXJtcyA9IFtbXSxcIlwiLFtdXTtcblx0XHRcdC8qIDE4LjQuMTIgdCBTVF9Yc3RyaW5nICovXG5cdFx0XHR2YXIgdCA9IHIubWF0Y2godHJlZ2V4KTtcblx0XHRcdGlmKCFpc3ZhbCh0KSkgcmV0dXJuIFwiXCI7XG5cdFx0XHR0ZXJtc1sxXSA9IHRbMV07XG5cblx0XHRcdHZhciBycHIgPSByLm1hdGNoKHJwcmVnZXgpO1xuXHRcdFx0aWYoaXN2YWwocnByKSkgcGFyc2VfcnByKHJwclsxXSwgdGVybXNbMF0sIHRlcm1zWzJdKTtcblx0XHRcdHJldHVybiB0ZXJtc1swXS5qb2luKFwiXCIpICsgdGVybXNbMV0ucmVwbGFjZSgvXFxyXFxuL2csJzxici8+JykgKyB0ZXJtc1syXS5qb2luKFwiXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZnVuY3Rpb24ocnMpIHtcblx0XHRcdHJldHVybiBycy5yZXBsYWNlKC88cj4vZyxcIlwiKS5zcGxpdCgvPFxcL3I+LykubWFwKHBhcnNlX3IpLmpvaW4oXCJcIik7XG5cdFx0fTtcblx0fSkoKTtcblxuXHQvKiAxOC40Ljggc2kgQ1RfUnN0ICovXG5cdHZhciBwYXJzZV9zaSA9IGZ1bmN0aW9uKHgpIHtcblx0XHR2YXIgeiA9IHt9O1xuXHRcdGlmKCF4KSByZXR1cm4gejtcblx0XHR2YXIgeTtcblx0XHQvKiAxOC40LjEyIHQgU1RfWHN0cmluZyAoUGxhaW50ZXh0IFN0cmluZykgKi9cblx0XHRpZih4WzFdID09PSAndCcpIHtcblx0XHRcdHoudCA9IHV0ZjhyZWFkKHVuZXNjYXBleG1sKHgucmVwbGFjZSgvPFtePl0qPi9nLFwiXCIpKSk7XG5cdFx0XHR6LnJhdyA9IHg7XG5cdFx0XHR6LnIgPSB6LnQ7XG5cdFx0fVxuXHRcdC8qIDE4LjQuNCByIENUX1JFbHQgKFJpY2ggVGV4dCBSdW4pICovXG5cdFx0ZWxzZSBpZigoeSA9IHgubWF0Y2goLzxyPi8pKSkge1xuXHRcdFx0ei5yYXcgPSB4O1xuXHRcdFx0LyogVE9ETzogcHJvcGVybHkgcGFyc2UgKG5vdGU6IG5vIG90aGVyIHZhbGlkIGNoaWxkIGNhbiBoYXZlIGJvZHkgdGV4dCkgKi9cblx0XHRcdHoudCA9IHV0ZjhyZWFkKHVuZXNjYXBleG1sKHgucmVwbGFjZSgvPFtePl0qPi9nbSxcIlwiKSkpO1xuXHRcdFx0ei5yID0gcGFyc2VfcnMoeCk7XG5cdFx0fVxuXHRcdC8qIDE4LjQuMyBwaG9uZXRpY1ByIENUX1Bob25ldGljUHIgKFRPRE86IG5lZWRlZCBmb3IgQXNpYW4gc3VwcG9ydCkgKi9cblx0XHQvKiAxOC40LjYgclBoIENUX1Bob25ldGljUnVuIChUT0RPOiBuZWVkZWQgZm9yIEFzaWFuIHN1cHBvcnQpICovXG5cdFx0cmV0dXJuIHo7XG5cdH07XG5cblxuXHRyZXR1cm4gZnVuY3Rpb24oZGF0YSkge1xuXHRcdHZhciBzID0gW107XG5cdFx0LyogMTguNC45IHNzdCBDVF9Tc3QgKi9cblx0XHR2YXIgc3N0ID0gZGF0YS5tYXRjaChuZXcgUmVnRXhwKFwiPHNzdChbXj5dKik+KFtcXFxcc1xcXFxTXSopPFxcL3NzdD5cIixcIm1cIikpO1xuXHRcdGlmKGlzdmFsKHNzdCkpIHtcblx0XHRcdHMgPSBzc3RbMl0ucmVwbGFjZSgvPHNpPi9nLFwiXCIpLnNwbGl0KC88XFwvc2k+LykubWFwKHBhcnNlX3NpKTtcblx0XHRcdHNzdCA9IHBhcnNleG1sdGFnKHNzdFsxXSk7IHMuQ291bnQgPSBzc3QuY291bnQ7IHMuVW5pcXVlID0gc3N0LnVuaXF1ZUNvdW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fTtcbn0pKCk7XG5cbnZhciBjdDJ0eXBlID0ge1xuXHRcImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnNoZWV0Lm1haW4reG1sXCI6IFwid29ya2Jvb2tzXCIsXG5cdFwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLXBhY2thZ2UuY29yZS1wcm9wZXJ0aWVzK3htbFwiOiBcImNvcmVwcm9wc1wiLFxuXHRcImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5leHRlbmRlZC1wcm9wZXJ0aWVzK3htbFwiOiBcImV4dHByb3BzXCIsXG5cdFwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuY2FsY0NoYWluK3htbFwiOiBcImNhbGNjaGFpbnNcIixcblx0XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC53b3Jrc2hlZXQreG1sXCI6XCJzaGVldHNcIixcblx0XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGFyZWRTdHJpbmdzK3htbFwiOiBcInN0cnNcIixcblx0XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zdHlsZXMreG1sXCI6XCJzdHlsZXNcIixcblx0XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQudGhlbWUreG1sXCI6XCJ0aGVtZXNcIixcblx0XCJmb29cIjogXCJiYXJcIlxufTtcblxuLyogMTguMi4yOCAoQ1RfV29ya2Jvb2tQcm90ZWN0aW9uKSBEZWZhdWx0cyAqL1xudmFyIFdCUHJvcHNEZWYgPSB7XG5cdGFsbG93UmVmcmVzaFF1ZXJ5OiAnMCcsXG5cdGF1dG9Db21wcmVzc1BpY3R1cmVzOiAnMScsXG5cdGJhY2t1cEZpbGU6ICcwJyxcblx0Y2hlY2tDb21wYXRpYmlsaXR5OiAnMCcsXG5cdGNvZGVOYW1lOiAnJyxcblx0ZGF0ZTE5MDQ6ICcwJyxcblx0ZGF0ZUNvbXBhdGliaWxpdHk6ICcxJyxcblx0Ly9kZWZhdWx0VGhlbWVWZXJzaW9uOiAnMCcsXG5cdGZpbHRlclByaXZhY3k6ICcwJyxcblx0aGlkZVBpdm90RmllbGRMaXN0OiAnMCcsXG5cdHByb21wdGVkU29sdXRpb25zOiAnMCcsXG5cdHB1Ymxpc2hJdGVtczogJzAnLFxuXHRyZWZyZXNoQWxsQ29ubmVjdGlvbnM6IGZhbHNlLFxuXHRzYXZlRXh0ZXJuYWxMaW5rVmFsdWVzOiAnMScsXG5cdHNob3dCb3JkZXJVbnNlbGVjdGVkVGFibGVzOiAnMScsXG5cdHNob3dJbmtBbm5vdGF0aW9uOiAnMScsXG5cdHNob3dPYmplY3RzOiAnYWxsJyxcblx0c2hvd1Bpdm90Q2hhcnRGaWx0ZXI6ICcwJ1xuXHQvL3VwZGF0ZUxpbmtzOiAndXNlclNldCdcbn07XG5cbi8qIDE4LjIuMzAgKENUX0Jvb2tWaWV3KSBEZWZhdWx0cyAqL1xudmFyIFdCVmlld0RlZiA9IHtcblx0YWN0aXZlVGFiOiAnMCcsXG5cdGF1dG9GaWx0ZXJEYXRlR3JvdXBpbmc6ICcxJyxcblx0Zmlyc3RTaGVldDogJzAnLFxuXHRtaW5pbWl6ZWQ6ICcwJyxcblx0c2hvd0hvcml6b250YWxTY3JvbGw6ICcxJyxcblx0c2hvd1NoZWV0VGFiczogJzEnLFxuXHRzaG93VmVydGljYWxTY3JvbGw6ICcxJyxcblx0dGFiUmF0aW86ICc2MDAnLFxuXHR2aXNpYmlsaXR5OiAndmlzaWJsZSdcblx0Ly93aW5kb3d7SGVpZ2h0LFdpZHRofSwge3gseX1XaW5kb3dcbn07XG5cbi8qIDE4LjIuMTkgKENUX1NoZWV0KSBEZWZhdWx0cyAqL1xudmFyIFNoZWV0RGVmID0ge1xuXHRzdGF0ZTogJ3Zpc2libGUnXG59O1xuXG4vKiAxOC4yLjIgIChDVF9DYWxjUHIpIERlZmF1bHRzICovXG52YXIgQ2FsY1ByRGVmID0ge1xuXHRjYWxjQ29tcGxldGVkOiAndHJ1ZScsXG5cdGNhbGNNb2RlOiAnYXV0bycsXG5cdGNhbGNPblNhdmU6ICd0cnVlJyxcblx0Y29uY3VycmVudENhbGM6ICd0cnVlJyxcblx0ZnVsbENhbGNPbkxvYWQ6ICdmYWxzZScsXG5cdGZ1bGxQcmVjaXNpb246ICd0cnVlJyxcblx0aXRlcmF0ZTogJ2ZhbHNlJyxcblx0aXRlcmF0ZUNvdW50OiAnMTAwJyxcblx0aXRlcmF0ZURlbHRhOiAnMC4wMDEnLFxuXHRyZWZNb2RlOiAnQTEnXG59O1xuXG4vKiAxOC4yLjMgKENUX0N1c3RvbVdvcmtib29rVmlldykgRGVmYXVsdHMgKi9cbnZhciBDdXN0b21XQlZpZXdEZWYgPSB7XG5cdGF1dG9VcGRhdGU6ICdmYWxzZScsXG5cdGNoYW5nZXNTYXZlZFdpbjogJ2ZhbHNlJyxcblx0aW5jbHVkZUhpZGRlblJvd0NvbDogJ3RydWUnLFxuXHRpbmNsdWRlUHJpbnRTZXR0aW5nczogJ3RydWUnLFxuXHRtYXhpbWl6ZWQ6ICdmYWxzZScsXG5cdG1pbmltaXplZDogJ2ZhbHNlJyxcblx0b25seVN5bmM6ICdmYWxzZScsXG5cdHBlcnNvbmFsVmlldzogJ2ZhbHNlJyxcblx0c2hvd0NvbW1lbnRzOiAnY29tbUluZGljYXRvcicsXG5cdHNob3dGb3JtdWxhQmFyOiAndHJ1ZScsXG5cdHNob3dIb3Jpem9udGFsU2Nyb2xsOiAndHJ1ZScsXG5cdHNob3dPYmplY3RzOiAnYWxsJyxcblx0c2hvd1NoZWV0VGFiczogJ3RydWUnLFxuXHRzaG93U3RhdHVzYmFyOiAndHJ1ZScsXG5cdHNob3dWZXJ0aWNhbFNjcm9sbDogJ3RydWUnLFxuXHR0YWJSYXRpbzogJzYwMCcsXG5cdHhXaW5kb3c6ICcwJyxcblx0eVdpbmRvdzogJzAnXG59O1xuXG52YXIgWE1MTlNfQ1QgPSAnaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9jb250ZW50LXR5cGVzJztcbnZhciBYTUxOU19XQiA9ICdodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvc3ByZWFkc2hlZXRtbC8yMDA2L21haW4nO1xuXG52YXIgc3RycyA9IHt9OyAvLyBzaGFyZWQgc3RyaW5nc1xudmFyIHN0eWxlcyA9IHt9OyAvLyBzaGFyZWQgc3R5bGVzXG52YXIgX3NzZm9wdHMgPSB7fTsgLy8gc3ByZWFkc2hlZXQgZm9ybWF0dGluZyBvcHRpb25zXG5cbi8qIDE4LjMgV29ya3NoZWV0cyAqL1xuZnVuY3Rpb24gcGFyc2VTaGVldChkYXRhKSB7XG5cdGlmKCFkYXRhKSByZXR1cm4gZGF0YTtcblx0LyogMTguMy4xLjk5IHdvcmtzaGVldCBDVF9Xb3Jrc2hlZXQgKi9cblx0dmFyIHMgPSB7fTtcblxuXHQvKiAxOC4zLjEuMzUgZGltZW5zaW9uIENUX1NoZWV0RGltZW5zaW9uID8gKi9cblx0dmFyIHJlZiA9IGRhdGEubWF0Y2goLzxkaW1lbnNpb24gcmVmPVwiKFteXCJdKilcIlxccypcXC8+Lyk7XG5cdGlmKHJlZiAmJiByZWYubGVuZ3RoID09IDIgJiYgcmVmWzFdLmluZGV4T2YoXCI6XCIpICE9PSAtMSkgc1tcIiFyZWZcIl0gPSByZWZbMV07XG5cblx0dmFyIHJlZmd1ZXNzID0ge3M6IHtyOjEwMDAwMDAsIGM6MTAwMDAwMH0sIGU6IHtyOjAsIGM6MH0gfTtcblx0dmFyIHEgPSBbXCJ2XCIsXCJmXCJdO1xuXHR2YXIgc2lkeCA9IDA7XG5cdC8qIDE4LjMuMS44MCBzaGVldERhdGEgQ1RfU2hlZXREYXRhID8gKi9cblx0aWYoIWRhdGEubWF0Y2goLzxzaGVldERhdGEgKlxcLz4vKSlcblx0ZGF0YS5tYXRjaCgvPHNoZWV0RGF0YT4oW15cXHUyNjAzXSopPFxcL3NoZWV0RGF0YT4vbSlbMV0uc3BsaXQoXCI8L3Jvdz5cIikuZm9yRWFjaChmdW5jdGlvbih4KSB7XG5cdFx0aWYoeCA9PT0gXCJcIiB8fCB4LnRyaW0oKSA9PT0gXCJcIikgcmV0dXJuO1xuXG5cdFx0LyogMTguMy4xLjczIHJvdyBDVF9Sb3cgKi9cblx0XHR2YXIgcm93ID0gcGFyc2V4bWx0YWcoeC5tYXRjaCgvPHJvd1tePl0qPi8pWzBdKTtcblx0XHRpZihyZWZndWVzcy5zLnIgPiByb3cuciAtIDEpIHJlZmd1ZXNzLnMuciA9IHJvdy5yIC0gMTtcblx0XHRpZihyZWZndWVzcy5lLnIgPCByb3cuciAtIDEpIHJlZmd1ZXNzLmUuciA9IHJvdy5yIC0gMTtcblxuXHRcdC8qIDE4LjMuMS40IGMgQ1RfQ2VsbCAqL1xuXHRcdHZhciBjZWxscyA9IHguc3Vic3RyKHguaW5kZXhPZignPicpKzEpLnNwbGl0KC88Yy8pO1xuXHRcdGNlbGxzLmZvckVhY2goZnVuY3Rpb24oYywgaWR4KSB7IGlmKGMgPT09IFwiXCIgfHwgYy50cmltKCkgPT09IFwiXCIpIHJldHVybjtcblx0XHRcdHZhciBjcmVmID0gYy5tYXRjaCgvcj1cIihbXlwiXSopXCIvKTtcblx0XHRcdGMgPSBcIjxjXCIgKyBjO1xuXHRcdFx0aWYoY3JlZiAmJiBjcmVmLmxlbmd0aCA9PSAyKSB7XG5cdFx0XHRcdHZhciBjcmVmX2NlbGwgPSBkZWNvZGVfY2VsbChjcmVmWzFdKTtcblx0XHRcdFx0aWR4ID0gY3JlZl9jZWxsLmM7XG5cdFx0XHR9XG5cdFx0XHRpZihyZWZndWVzcy5zLmMgPiBpZHgpIHJlZmd1ZXNzLnMuYyA9IGlkeDtcblx0XHRcdGlmKHJlZmd1ZXNzLmUuYyA8IGlkeCkgcmVmZ3Vlc3MuZS5jID0gaWR4O1xuXHRcdFx0dmFyIGNlbGwgPSBwYXJzZXhtbHRhZygoYy5tYXRjaCgvPGNbXj5dKj4vKXx8W2NdKVswXSk7IGRlbGV0ZSBjZWxsWzBdO1xuXHRcdFx0dmFyIGQgPSBjLnN1YnN0cihjLmluZGV4T2YoJz4nKSsxKTtcblx0XHRcdHZhciBwID0ge307XG5cdFx0XHRxLmZvckVhY2goZnVuY3Rpb24oZil7dmFyIHg9ZC5tYXRjaChtYXRjaHRhZyhmKSk7aWYoeClwW2ZdPXVuZXNjYXBleG1sKHhbMV0pO30pO1xuXG5cdFx0XHQvKiBTQ0hFTUEgSVMgQUNUVUFMTFkgSU5DT1JSRUNUIEhFUkUuICBJRiBBIENFTEwgSEFTIE5PIFQsIEVNSVQgXCJcIiAqL1xuXHRcdFx0aWYoY2VsbC50ID09PSB1bmRlZmluZWQgJiYgcC52ID09PSB1bmRlZmluZWQpIHsgcC50ID0gXCJzdHJcIjsgcC52ID0gdW5kZWZpbmVkOyB9XG5cdFx0XHRlbHNlIHAudCA9IChjZWxsLnQgPyBjZWxsLnQgOiBcIm5cIik7IC8vIGRlZmF1bHQgaXMgXCJuXCIgaW4gc2NoZW1hXG5cdFx0XHRzd2l0Y2gocC50KSB7XG5cdFx0XHRcdGNhc2UgJ24nOiBwLnYgPSBwYXJzZUZsb2F0KHAudik7IGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzJzoge1xuXHRcdFx0XHRcdHNpZHggPSBwYXJzZUludChwLnYsIDEwKTtcblx0XHRcdFx0XHRwLnYgPSBzdHJzW3NpZHhdLnQ7XG5cdFx0XHRcdFx0cC5yID0gc3Ryc1tzaWR4XS5yO1xuXHRcdFx0XHR9IGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzdHInOiBpZihwLnYpIHAudiA9IHV0ZjhyZWFkKHAudik7IGJyZWFrOyAvLyBub3JtYWwgc3RyaW5nXG5cdFx0XHRcdGNhc2UgJ2lubGluZVN0cic6XG5cdFx0XHRcdFx0cC50ID0gJ3N0cic7IHAudiA9IHVuZXNjYXBleG1sKChkLm1hdGNoKG1hdGNodGFnKCd0JykpfHxbXCJcIixcIlwiXSlbMV0pO1xuXHRcdFx0XHRcdGJyZWFrOyAvLyBpbmxpbmUgc3RyaW5nXG5cdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdHN3aXRjaChwLnYpIHtcblx0XHRcdFx0XHRcdGNhc2UgJzAnOiBjYXNlICdGQUxTRSc6IGNhc2UgXCJmYWxzZVwiOiBjYXNlIGZhbHNlOiBwLnY9ZmFsc2U7IGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnMSc6IGNhc2UgJ1RSVUUnOiAgY2FzZSBcInRydWVcIjogIGNhc2UgdHJ1ZTogIHAudj10cnVlOyAgYnJlYWs7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB0aHJvdyBcIlVucmVjb2duaXplZCBib29sZWFuOiBcIiArIHAudjtcblx0XHRcdFx0XHR9IGJyZWFrO1xuXHRcdFx0XHQvKiBpbiBjYXNlIG9mIGVycm9yLCBzdGljayB2YWx1ZSBpbiAucmF3ICovXG5cdFx0XHRcdGNhc2UgJ2UnOiBwLnJhdyA9IHAudjsgcC52ID0gdW5kZWZpbmVkOyBicmVhaztcblx0XHRcdFx0ZGVmYXVsdDogdGhyb3cgXCJVbnJlY29nbml6ZWQgY2VsbCB0eXBlOiBcIiArIHAudDtcblx0XHRcdH1cblxuXHRcdFx0LyogZm9ybWF0dGluZyAqL1xuXHRcdFx0aWYoY2VsbC5zICYmIHN0eWxlcy5DZWxsWGYpIHsgLyogVE9ETzogc2Vjb25kIGNoZWNrIGlzIGEgaGFja2VkIGd1YXJkICovXG5cdFx0XHRcdHZhciBjZiA9IHN0eWxlcy5DZWxsWGZbY2VsbC5zXTtcblx0XHRcdFx0aWYoY2YgJiYgY2YubnVtRm10SWQgJiYgY2YubnVtRm10SWQgIT09IDApIHtcblx0XHRcdFx0XHRwLnJhdyA9IHAudjtcblx0XHRcdFx0XHRwLnJhd3QgPSBwLnQ7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHAudiA9IFNTRi5mb3JtYXQoY2YubnVtRm10SWQscC52LF9zc2ZvcHRzKTtcblx0XHRcdFx0XHRcdHAudCA9ICdzdHInO1xuXHRcdFx0XHRcdH0gY2F0Y2goZSkgeyBwLnYgPSBwLnJhdzsgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNbY2VsbC5yXSA9IHA7XG5cdFx0fSk7XG5cdH0pO1xuXHRpZighc1tcIiFyZWZcIl0pIHNbXCIhcmVmXCJdID0gZW5jb2RlX3JhbmdlKHJlZmd1ZXNzKTtcblx0cmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUHJvcHMoZGF0YSkge1xuXHR2YXIgcCA9IHsgQ29tcGFueTonJyB9LCBxID0ge307XG5cdHZhciBzdHJpbmdzID0gW1wiQXBwbGljYXRpb25cIiwgXCJEb2NTZWN1cml0eVwiLCBcIkNvbXBhbnlcIiwgXCJBcHBWZXJzaW9uXCJdO1xuXHR2YXIgYm9vbHMgPSBbXCJIeXBlcmxpbmtzQ2hhbmdlZFwiLFwiU2hhcmVkRG9jXCIsXCJMaW5rc1VwVG9EYXRlXCIsXCJTY2FsZUNyb3BcIl07XG5cdHZhciB4dHJhID0gW1wiSGVhZGluZ1BhaXJzXCIsIFwiVGl0bGVzT2ZQYXJ0c1wiXTtcblx0dmFyIHh0cmFjcCA9IFtcImNhdGVnb3J5XCIsIFwiY29udGVudFN0YXR1c1wiLCBcImxhc3RNb2RpZmllZEJ5XCIsIFwibGFzdFByaW50ZWRcIiwgXCJyZXZpc2lvblwiLCBcInZlcnNpb25cIl07XG5cdHZhciB4dHJhZGMgPSBbXCJjcmVhdG9yXCIsIFwiZGVzY3JpcHRpb25cIiwgXCJpZGVudGlmaWVyXCIsIFwibGFuZ3VhZ2VcIiwgXCJzdWJqZWN0XCIsIFwidGl0bGVcIl07XG5cdHZhciB4dHJhZGN0ZXJtcyA9IFtcImNyZWF0ZWRcIiwgXCJtb2RpZmllZFwiXTtcblx0eHRyYSA9IHh0cmEuY29uY2F0KHh0cmFjcC5tYXAoZnVuY3Rpb24oeCkgeyByZXR1cm4gXCJjcDpcIiArIHg7IH0pKTtcblx0eHRyYSA9IHh0cmEuY29uY2F0KHh0cmFkYy5tYXAoZnVuY3Rpb24oeCkgeyByZXR1cm4gXCJkYzpcIiArIHg7IH0pKTtcblx0eHRyYSA9IHh0cmEuY29uY2F0KHh0cmFkY3Rlcm1zLm1hcChmdW5jdGlvbih4KSB7IHJldHVybiBcImRjdGVybXM6XCIgKyB4OyB9KSk7XG5cblxuXHRzdHJpbmdzLmZvckVhY2goZnVuY3Rpb24oZil7cFtmXSA9IChkYXRhLm1hdGNoKG1hdGNodGFnKGYpKXx8W10pWzFdO30pO1xuXHRib29scy5mb3JFYWNoKGZ1bmN0aW9uKGYpe3BbZl0gPSAoZGF0YS5tYXRjaChtYXRjaHRhZyhmKSl8fFtdKVsxXSA9PSBcInRydWVcIjt9KTtcblx0eHRyYS5mb3JFYWNoKGZ1bmN0aW9uKGYpIHtcblx0XHR2YXIgY3VyID0gZGF0YS5tYXRjaChuZXcgUmVnRXhwKFwiPFwiICsgZiArIFwiW14+XSo+KC4qKTxcXC9cIiArIGYgKyBcIj5cIikpO1xuXHRcdGlmKGN1ciAmJiBjdXIubGVuZ3RoID4gMCkgcVtmXSA9IGN1clsxXTtcblx0fSk7XG5cblx0aWYocS5IZWFkaW5nUGFpcnMgJiYgcS5UaXRsZXNPZlBhcnRzKSB7XG5cdFx0dmFyIHYgPSBwYXJzZVZlY3RvcihxLkhlYWRpbmdQYWlycyk7XG5cdFx0dmFyIGogPSAwLCB3aWR4ID0gMDtcblx0XHRmb3IodmFyIGkgPSAwOyBpICE9PSB2Lmxlbmd0aDsgKytpKSB7XG5cdFx0XHRzd2l0Y2godltpXS52KSB7XG5cdFx0XHRcdGNhc2UgXCJXb3Jrc2hlZXRzXCI6IHdpZHggPSBqOyBwLldvcmtzaGVldHMgPSArdlsrK2ldOyBicmVhaztcblx0XHRcdFx0Y2FzZSBcIk5hbWVkIFJhbmdlc1wiOiArK2k7IGJyZWFrOyAvLyBUT0RPOiBIYW5kbGUgTmFtZWQgUmFuZ2VzXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHZhciBwYXJ0cyA9IHBhcnNlVmVjdG9yKHEuVGl0bGVzT2ZQYXJ0cykubWFwKHV0ZjhyZWFkKTtcblx0XHRwLlNoZWV0TmFtZXMgPSBwYXJ0cy5zbGljZSh3aWR4LCB3aWR4ICsgcC5Xb3Jrc2hlZXRzKTtcblx0fVxuXHRwLkNyZWF0b3IgPSBxW1wiZGM6Y3JlYXRvclwiXTtcblx0cC5MYXN0TW9kaWZpZWRCeSA9IHFbXCJjcDpsYXN0TW9kaWZpZWRCeVwiXTtcblx0cC5DcmVhdGVkRGF0ZSA9IG5ldyBEYXRlKHFbXCJkY3Rlcm1zOmNyZWF0ZWRcIl0pO1xuXHRwLk1vZGlmaWVkRGF0ZSA9IG5ldyBEYXRlKHFbXCJkY3Rlcm1zOm1vZGlmaWVkXCJdKTtcblx0cmV0dXJuIHA7XG59XG5cbi8qIDE4LjYgQ2FsY3VsYXRpb24gQ2hhaW4gKi9cbmZ1bmN0aW9uIHBhcnNlRGVwcyhkYXRhKSB7XG5cdHZhciBkID0gW107XG5cdHZhciBsID0gMCwgaSA9IDE7XG5cdChkYXRhLm1hdGNoKC88W14+XSo+L2cpfHxbXSkuZm9yRWFjaChmdW5jdGlvbih4KSB7XG5cdFx0dmFyIHkgPSBwYXJzZXhtbHRhZyh4KTtcblx0XHRzd2l0Y2goeVswXSkge1xuXHRcdFx0Y2FzZSAnPD94bWwnOiBicmVhaztcblx0XHRcdC8qIDE4LjYuMiAgY2FsY0NoYWluIENUX0NhbGNDaGFpbiAxICovXG5cdFx0XHRjYXNlICc8Y2FsY0NoYWluJzogY2FzZSAnPGNhbGNDaGFpbj4nOiBjYXNlICc8L2NhbGNDaGFpbj4nOiBicmVhaztcblx0XHRcdC8qIDE4LjYuMSAgYyBDVF9DYWxjQ2VsbCAxICovXG5cdFx0XHRjYXNlICc8Yyc6IGRlbGV0ZSB5WzBdOyBpZih5LmkpIGkgPSB5Lmk7IGVsc2UgeS5pID0gaTsgZC5wdXNoKHkpOyBicmVhaztcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gZDtcbn1cblxudmFyIGN0ZXh0ID0ge307XG5cbmZ1bmN0aW9uIHBhcnNlQ1QoZGF0YSkge1xuXHRpZighZGF0YSB8fCAhZGF0YS5tYXRjaCkgcmV0dXJuIGRhdGE7XG5cdHZhciBjdCA9IHsgd29ya2Jvb2tzOiBbXSwgc2hlZXRzOiBbXSwgY2FsY2NoYWluczogW10sIHRoZW1lczogW10sIHN0eWxlczogW10sXG5cdFx0Y29yZXByb3BzOiBbXSwgZXh0cHJvcHM6IFtdLCBzdHJzOltdLCB4bWxuczogXCJcIiB9O1xuXHQoZGF0YS5tYXRjaCgvPFtePl0qPi9nKXx8W10pLmZvckVhY2goZnVuY3Rpb24oeCkge1xuXHRcdHZhciB5ID0gcGFyc2V4bWx0YWcoeCk7XG5cdFx0c3dpdGNoKHlbMF0pIHtcblx0XHRcdGNhc2UgJzw/eG1sJzogYnJlYWs7XG5cdFx0XHRjYXNlICc8VHlwZXMnOiBjdC54bWxucyA9IHkueG1sbnM7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnPERlZmF1bHQnOiBjdGV4dFt5LkV4dGVuc2lvbl0gPSB5LkNvbnRlbnRUeXBlOyBicmVhaztcblx0XHRcdGNhc2UgJzxPdmVycmlkZSc6XG5cdFx0XHRcdGlmKHkuQ29udGVudFR5cGUgaW4gY3QydHlwZSljdFtjdDJ0eXBlW3kuQ29udGVudFR5cGVdXS5wdXNoKHkuUGFydE5hbWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0pO1xuXHRpZihjdC54bWxucyAhPT0gWE1MTlNfQ1QpIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gTmFtZXNwYWNlOiBcIiArIGN0LnhtbG5zKTtcblx0Y3QuY2FsY2NoYWluID0gY3QuY2FsY2NoYWlucy5sZW5ndGggPiAwID8gY3QuY2FsY2NoYWluc1swXSA6IFwiXCI7XG5cdGN0LnNzdCA9IGN0LnN0cnMubGVuZ3RoID4gMCA/IGN0LnN0cnNbMF0gOiBcIlwiO1xuXHRjdC5zdHlsZSA9IGN0LnN0eWxlcy5sZW5ndGggPiAwID8gY3Quc3R5bGVzWzBdIDogXCJcIjtcblx0ZGVsZXRlIGN0LmNhbGNjaGFpbnM7XG5cdHJldHVybiBjdDtcbn1cblxuXG4vKiAxOC4yIFdvcmtib29rICovXG5mdW5jdGlvbiBwYXJzZVdCKGRhdGEpIHtcblx0dmFyIHdiID0geyBBcHBWZXJzaW9uOnt9LCBXQlByb3BzOnt9LCBXQlZpZXc6W10sIFNoZWV0czpbXSwgQ2FsY1ByOnt9LCB4bWxuczogXCJcIiB9O1xuXHR2YXIgcGFzcyA9IGZhbHNlO1xuXHRkYXRhLm1hdGNoKC88W14+XSo+L2cpLmZvckVhY2goZnVuY3Rpb24oeCkge1xuXHRcdHZhciB5ID0gcGFyc2V4bWx0YWcoeCk7XG5cdFx0c3dpdGNoKHlbMF0pIHtcblx0XHRcdGNhc2UgJzw/eG1sJzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMjcgd29ya2Jvb2sgQ1RfV29ya2Jvb2sgMSAqL1xuXHRcdFx0Y2FzZSAnPHdvcmtib29rJzogd2IueG1sbnMgPSB5LnhtbG5zOyBicmVhaztcblx0XHRcdGNhc2UgJzwvd29ya2Jvb2s+JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMTMgZmlsZVZlcnNpb24gQ1RfRmlsZVZlcnNpb24gPyAqL1xuXHRcdFx0Y2FzZSAnPGZpbGVWZXJzaW9uJzogZGVsZXRlIHlbMF07IHdiLkFwcFZlcnNpb24gPSB5OyBicmVhaztcblx0XHRcdGNhc2UgJzxmaWxlVmVyc2lvbi8+JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMTIgZmlsZVNoYXJpbmcgQ1RfRmlsZVNoYXJpbmcgPyAqL1xuXHRcdFx0Y2FzZSAnPGZpbGVTaGFyaW5nJzogY2FzZSAnPGZpbGVTaGFyaW5nLz4nOiBicmVhaztcblxuXHRcdFx0LyogMTguMi4yOCB3b3JrYm9va1ByIENUX1dvcmtib29rUHIgPyAqL1xuXHRcdFx0Y2FzZSAnPHdvcmtib29rUHInOiBkZWxldGUgeVswXTsgd2IuV0JQcm9wcyA9IHk7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnPHdvcmtib29rUHIvPic6IGRlbGV0ZSB5WzBdOyB3Yi5XQlByb3BzID0geTsgYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMjkgd29ya2Jvb2tQcm90ZWN0aW9uIENUX1dvcmtib29rUHJvdGVjdGlvbiA/ICovXG5cdFx0XHRjYXNlICc8d29ya2Jvb2tQcm90ZWN0aW9uLz4nOiBicmVhaztcblxuXHRcdFx0LyogMTguMi4xICBib29rVmlld3MgQ1RfQm9va1ZpZXdzID8gKi9cblx0XHRcdGNhc2UgJzxib29rVmlld3M+JzogY2FzZSAnPC9ib29rVmlld3M+JzogYnJlYWs7XG5cdFx0XHQvKiAxOC4yLjMwICAgd29ya2Jvb2tWaWV3IENUX0Jvb2tWaWV3ICsgKi9cblx0XHRcdGNhc2UgJzx3b3JrYm9va1ZpZXcnOiBkZWxldGUgeVswXTsgd2IuV0JWaWV3LnB1c2goeSk7IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjIwIHNoZWV0cyBDVF9TaGVldHMgMSAqL1xuXHRcdFx0Y2FzZSAnPHNoZWV0cz4nOiBjYXNlICc8L3NoZWV0cz4nOiBicmVhazsgLy8gYWdncmVnYXRlIHNoZWV0XG5cdFx0XHQvKiAxOC4yLjE5ICAgc2hlZXQgQ1RfU2hlZXQgKyAqL1xuXHRcdFx0Y2FzZSAnPHNoZWV0JzogZGVsZXRlIHlbMF07IHkubmFtZSA9IHV0ZjhyZWFkKHkubmFtZSk7IHdiLlNoZWV0cy5wdXNoKHkpOyBicmVhaztcblxuXHRcdFx0LyogMTguMi4xNSBmdW5jdGlvbkdyb3VwcyBDVF9GdW5jdGlvbkdyb3VwcyA/ICovXG5cdFx0XHRjYXNlICc8ZnVuY3Rpb25Hcm91cHMnOiBjYXNlICc8ZnVuY3Rpb25Hcm91cHMvPic6IGJyZWFrO1xuXHRcdFx0LyogMTguMi4xNCAgIGZ1bmN0aW9uR3JvdXAgQ1RfRnVuY3Rpb25Hcm91cCArICovXG5cdFx0XHRjYXNlICc8ZnVuY3Rpb25Hcm91cCc6IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjkgIGV4dGVybmFsUmVmZXJlbmNlcyBDVF9FeHRlcm5hbFJlZmVyZW5jZXMgPyAqL1xuXHRcdFx0Y2FzZSAnPGV4dGVybmFsUmVmZXJlbmNlcyc6IGNhc2UgJzwvZXh0ZXJuYWxSZWZlcmVuY2VzPic6IGJyZWFrO1xuXHRcdFx0LyogMTguMi44ICAgIGV4dGVybmFsUmVmZXJlbmNlIENUX0V4dGVybmFsUmVmZXJlbmNlICsgKi9cblx0XHRcdGNhc2UgJzxleHRlcm5hbFJlZmVyZW5jZSc6IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjYgIGRlZmluZWROYW1lcyBDVF9EZWZpbmVkTmFtZXMgPyAqL1xuXHRcdFx0Y2FzZSAnPGRlZmluZWROYW1lcy8+JzogYnJlYWs7XG5cdFx0XHRjYXNlICc8ZGVmaW5lZE5hbWVzPic6IHBhc3M9dHJ1ZTsgYnJlYWs7XG5cdFx0XHRjYXNlICc8L2RlZmluZWROYW1lcz4nOiBwYXNzPWZhbHNlOyBicmVhaztcblx0XHRcdC8qIDE4LjIuNSAgICBkZWZpbmVkTmFtZSBDVF9EZWZpbmVkTmFtZSArICovXG5cdFx0XHRjYXNlICc8ZGVmaW5lZE5hbWUnOiBjYXNlICc8ZGVmaW5lZE5hbWUvPic6IGNhc2UgJzwvZGVmaW5lZE5hbWU+JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMiAgY2FsY1ByIENUX0NhbGNQciA/ICovXG5cdFx0XHRjYXNlICc8Y2FsY1ByJzogZGVsZXRlIHlbMF07IHdiLkNhbGNQciA9IHk7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnPGNhbGNQci8+JzogZGVsZXRlIHlbMF07IHdiLkNhbGNQciA9IHk7IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjE2IG9sZVNpemUgQ1RfT2xlU2l6ZSA/IChyZWYgcmVxdWlyZWQpICovXG5cdFx0XHRjYXNlICc8b2xlU2l6ZSc6IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjQgIGN1c3RvbVdvcmtib29rVmlld3MgQ1RfQ3VzdG9tV29ya2Jvb2tWaWV3cyA/ICovXG5cdFx0XHRjYXNlICc8Y3VzdG9tV29ya2Jvb2tWaWV3cz4nOiBjYXNlICc8L2N1c3RvbVdvcmtib29rVmlld3M+JzogY2FzZSAnPGN1c3RvbVdvcmtib29rVmlld3MnOiBicmVhaztcblx0XHRcdC8qIDE4LjIuMyAgICBjdXN0b21Xb3JrYm9va1ZpZXcgQ1RfQ3VzdG9tV29ya2Jvb2tWaWV3ICsgKi9cblx0XHRcdGNhc2UgJzxjdXN0b21Xb3JrYm9va1ZpZXcnOiBjYXNlICc8L2N1c3RvbVdvcmtib29rVmlldz4nOiBicmVhaztcblxuXHRcdFx0LyogMTguMi4xOCBwaXZvdENhY2hlcyBDVF9QaXZvdENhY2hlcyA/ICovXG5cdFx0XHRjYXNlICc8cGl2b3RDYWNoZXM+JzogY2FzZSAnPC9waXZvdENhY2hlcz4nOiBjYXNlICc8cGl2b3RDYWNoZXMnOiBicmVhaztcblx0XHRcdC8qIDE4LjIuMTcgcGl2b3RDYWNoZSBDVF9QaXZvdENhY2hlID8gKi9cblx0XHRcdGNhc2UgJzxwaXZvdENhY2hlJzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMjEgc21hcnRUYWdQciBDVF9TbWFydFRhZ1ByID8gKi9cblx0XHRcdGNhc2UgJzxzbWFydFRhZ1ByJzogY2FzZSAnPHNtYXJ0VGFnUHIvPic6IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC4yLjIzIHNtYXJ0VGFnVHlwZXMgQ1RfU21hcnRUYWdUeXBlcyA/ICovXG5cdFx0XHRjYXNlICc8c21hcnRUYWdUeXBlcyc6IGNhc2UgJzxzbWFydFRhZ1R5cGVzPic6IGNhc2UgJzwvc21hcnRUYWdUeXBlcz4nOiBicmVhaztcblx0XHRcdC8qIDE4LjIuMjIgICBzbWFydFRhZ1R5cGUgQ1RfU21hcnRUYWdUeXBlID8gKi9cblx0XHRcdGNhc2UgJzxzbWFydFRhZ1R5cGUnOiBicmVhaztcblxuXHRcdFx0LyogMTguMi4yNCB3ZWJQdWJsaXNoaW5nIENUX1dlYlB1Ymxpc2hpbmcgPyAqL1xuXHRcdFx0Y2FzZSAnPHdlYlB1Ymxpc2hpbmcnOiBjYXNlICc8d2ViUHVibGlzaGluZy8+JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMTEgZmlsZVJlY292ZXJ5UHIgQ1RfRmlsZVJlY292ZXJ5UHIgPyAqL1xuXHRcdFx0Y2FzZSAnPGZpbGVSZWNvdmVyeVByJzogY2FzZSAnPGZpbGVSZWNvdmVyeVByLz4nOiBicmVhaztcblxuXHRcdFx0LyogMTguMi4yNiB3ZWJQdWJsaXNoT2JqZWN0cyBDVF9XZWJQdWJsaXNoT2JqZWN0cyA/ICovXG5cdFx0XHRjYXNlICc8d2ViUHVibGlzaE9iamVjdHM+JzogY2FzZSAnPHdlYlB1Ymxpc2hPYmplY3RzJzogY2FzZSAnPC93ZWJQdWJsaXNoT2JqZWN0cz4nOiBicmVhaztcblx0XHRcdC8qIDE4LjIuMjUgd2ViUHVibGlzaE9iamVjdCBDVF9XZWJQdWJsaXNoT2JqZWN0ID8gKi9cblx0XHRcdGNhc2UgJzx3ZWJQdWJsaXNoT2JqZWN0JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjIuMTAgZXh0THN0IENUX0V4dGVuc2lvbkxpc3QgPyAqL1xuXHRcdFx0Y2FzZSAnPGV4dExzdD4nOiBjYXNlICc8L2V4dExzdD4nOiBjYXNlICc8ZXh0THN0Lz4nOiBicmVhaztcblx0XHRcdC8qIDE4LjIuNyAgICBleHQgQ1RfRXh0ZW5zaW9uICsgKi9cblx0XHRcdGNhc2UgJzxleHQnOiBwYXNzPXRydWU7IGJyZWFrOyAvL1RPRE86IGNoZWNrIHdpdGggdmVyc2lvbnMgb2YgZXhjZWxcblx0XHRcdGNhc2UgJzwvZXh0Pic6IHBhc3M9ZmFsc2U7IGJyZWFrO1xuXG5cdFx0XHQvKiBPdGhlcnMgKi9cblx0XHRcdGNhc2UgJzxteDpBcmNoSUQnOiBicmVhaztcblx0XHRcdGNhc2UgJzxtYzpBbHRlcm5hdGVDb250ZW50JzogcGFzcz10cnVlOyBicmVhaztcblx0XHRcdGNhc2UgJzwvbWM6QWx0ZXJuYXRlQ29udGVudD4nOiBwYXNzPWZhbHNlOyBicmVhaztcblx0XHR9XG5cdH0pO1xuXHRpZih3Yi54bWxucyAhPT0gWE1MTlNfV0IpIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gTmFtZXNwYWNlOiBcIiArIHdiLnhtbG5zKTtcblxuXHR2YXIgejtcblx0LyogZGVmYXVsdHMgKi9cblx0Zm9yKHogaW4gV0JQcm9wc0RlZikgaWYodHlwZW9mIHdiLldCUHJvcHNbel0gPT09ICd1bmRlZmluZWQnKSB3Yi5XQlByb3BzW3pdID0gV0JQcm9wc0RlZlt6XTtcblx0Zm9yKHogaW4gQ2FsY1ByRGVmKSBpZih0eXBlb2Ygd2IuQ2FsY1ByW3pdID09PSAndW5kZWZpbmVkJykgd2IuQ2FsY1ByW3pdID0gQ2FsY1ByRGVmW3pdO1xuXG5cdHdiLldCVmlldy5mb3JFYWNoKGZ1bmN0aW9uKHcpe2Zvcih2YXIgeiBpbiBXQlZpZXdEZWYpIGlmKHR5cGVvZiB3W3pdID09PSAndW5kZWZpbmVkJykgd1t6XT1XQlZpZXdEZWZbel07IH0pO1xuXHR3Yi5TaGVldHMuZm9yRWFjaChmdW5jdGlvbih3KXtmb3IodmFyIHogaW4gU2hlZXREZWYpIGlmKHR5cGVvZiB3W3pdID09PSAndW5kZWZpbmVkJykgd1t6XT1TaGVldERlZlt6XTsgfSk7XG5cblx0X3NzZm9wdHMuZGF0ZTE5MDQgPSBwYXJzZXhtbGJvb2wod2IuV0JQcm9wcy5kYXRlMTkwNCwgJ2RhdGUxOTA0Jyk7XG5cblx0cmV0dXJuIHdiO1xufVxuXG4vKiAxOC44LjMxIG51bUZtdHMgQ1RfTnVtRm10cyAqL1xuZnVuY3Rpb24gcGFyc2VOdW1GbXRzKHQpIHtcblx0c3R5bGVzLk51bWJlckZtdCA9IFtdO1xuXHRmb3IodmFyIHkgaW4gU1NGLl90YWJsZSkgc3R5bGVzLk51bWJlckZtdFt5XSA9IFNTRi5fdGFibGVbeV07XG5cdHRbMF0ubWF0Y2goLzxbXj5dKj4vZykuZm9yRWFjaChmdW5jdGlvbih4KSB7XG5cdFx0dmFyIHkgPSBwYXJzZXhtbHRhZyh4KTtcblx0XHRzd2l0Y2goeVswXSkge1xuXHRcdFx0Y2FzZSAnPG51bUZtdHMnOiBjYXNlICc8L251bUZtdHM+JzogY2FzZSAnPG51bUZtdHMvPic6IGJyZWFrO1xuXHRcdFx0Y2FzZSAnPG51bUZtdCc6IHtcblx0XHRcdFx0dmFyIGY9dW5lc2NhcGV4bWwoeS5mb3JtYXRDb2RlKSwgaT1wYXJzZUludCh5Lm51bUZtdElkLDEwKTtcblx0XHRcdFx0c3R5bGVzLk51bWJlckZtdFtpXSA9IGY7IFNTRi5sb2FkKGYsaSk7XG5cdFx0XHR9IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgJ3VucmVjb2duaXplZCAnICsgeVswXSArICcgaW4gbnVtRm10cyc7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyogMTguOC4xMCBjZWxsWGZzIENUX0NlbGxYZnMgKi9cbmZ1bmN0aW9uIHBhcnNlQ1hmcyh0KSB7XG5cdHN0eWxlcy5DZWxsWGYgPSBbXTtcblx0dFswXS5tYXRjaCgvPFtePl0qPi9nKS5mb3JFYWNoKGZ1bmN0aW9uKHgpIHtcblx0XHR2YXIgeSA9IHBhcnNleG1sdGFnKHgpO1xuXHRcdHN3aXRjaCh5WzBdKSB7XG5cdFx0XHRjYXNlICc8Y2VsbFhmcyc6IGNhc2UgJzxjZWxsWGZzLz4nOiBjYXNlICc8L2NlbGxYZnM+JzogYnJlYWs7XG5cblx0XHRcdC8qIDE4LjguNDUgeGYgQ1RfWGYgKi9cblx0XHRcdGNhc2UgJzx4Zic6IGlmKHkubnVtRm10SWQpIHkubnVtRm10SWQgPSBwYXJzZUludCh5Lm51bUZtdElkLCAxMCk7XG5cdFx0XHRcdHN0eWxlcy5DZWxsWGYucHVzaCh5KTsgYnJlYWs7XG5cdFx0XHRjYXNlICc8L3hmPic6IGJyZWFrO1xuXG5cdFx0XHQvKiAxOC44LjEgYWxpZ25tZW50IENUX0NlbGxBbGlnbm1lbnQgKi9cblx0XHRcdGNhc2UgJzxhbGlnbm1lbnQnOiBicmVhaztcblxuXHRcdFx0LyogMTguOC4zMyBwcm90ZWN0aW9uIENUX0NlbGxQcm90ZWN0aW9uICovXG5cdFx0XHRjYXNlICc8cHJvdGVjdGlvbic6IGNhc2UgJzwvcHJvdGVjdGlvbj4nOiBjYXNlICc8cHJvdGVjdGlvbi8+JzogYnJlYWs7XG5cblx0XHRcdGNhc2UgJzxleHRMc3QnOiBjYXNlICc8L2V4dExzdD4nOiBicmVhaztcblx0XHRcdGNhc2UgJzxleHQnOiBicmVhaztcblx0XHRcdGRlZmF1bHQ6IHRocm93ICd1bnJlY29nbml6ZWQgJyArIHlbMF0gKyAnIGluIGNlbGxYZnMnO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qIDE4LjggU3R5bGVzIENUX1N0eWxlc2hlZXQqL1xuZnVuY3Rpb24gcGFyc2VTdHlsZXMoZGF0YSkge1xuXHQvKiAxOC44LjM5IHN0eWxlU2hlZXQgQ1RfU3R5bGVzaGVldCAqL1xuXHR2YXIgdDtcblxuXHQvKiBudW1GbXRzIENUX051bUZtdHMgPyAqL1xuXHRpZigodD1kYXRhLm1hdGNoKC88bnVtRm10cyhbXj5dKik+Lio8XFwvbnVtRm10cz4vKSkpIHBhcnNlTnVtRm10cyh0KTtcblxuXHQvKiBmb250cyBDVF9Gb250cyA/ICovXG5cdC8qIGZpbGxzIENUX0ZpbGxzID8gKi9cblx0LyogYm9yZGVycyBDVF9Cb3JkZXJzID8gKi9cblx0LyogY2VsbFN0eWxlWGZzIENUX0NlbGxTdHlsZVhmcyA/ICovXG5cblx0LyogY2VsbFhmcyBDVF9DZWxsWGZzID8gKi9cblx0aWYoKHQ9ZGF0YS5tYXRjaCgvPGNlbGxYZnMoW14+XSopPi4qPFxcL2NlbGxYZnM+LykpKSBwYXJzZUNYZnModCk7XG5cblx0LyogZHhmcyBDVF9EeGZzID8gKi9cblx0LyogdGFibGVTdHlsZXMgQ1RfVGFibGVTdHlsZXMgPyAqL1xuXHQvKiBjb2xvcnMgQ1RfQ29sb3JzID8gKi9cblx0LyogZXh0THN0IENUX0V4dGVuc2lvbkxpc3QgPyAqL1xuXG5cdHJldHVybiBzdHlsZXM7XG59XG5cbmZ1bmN0aW9uIGdldGRhdGEoZGF0YSkge1xuXHRpZighZGF0YSkgcmV0dXJuIG51bGw7IFxuXHRpZihkYXRhLmRhdGEpIHJldHVybiBkYXRhLmRhdGE7XG5cdGlmKGRhdGEuX2RhdGEgJiYgZGF0YS5fZGF0YS5nZXRDb250ZW50KSByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZGF0YS5fZGF0YS5nZXRDb250ZW50KCksMCkubWFwKGZ1bmN0aW9uKHgpIHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoeCk7IH0pLmpvaW4oXCJcIik7XG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXR6aXBmaWxlKHppcCwgZmlsZSkge1xuXHR2YXIgZiA9IGZpbGU7IGlmKHppcC5maWxlc1tmXSkgcmV0dXJuIHppcC5maWxlc1tmXTtcblx0ZiA9IGZpbGUudG9Mb3dlckNhc2UoKTsgaWYoemlwLmZpbGVzW2ZdKSByZXR1cm4gemlwLmZpbGVzW2ZdO1xuXHRmID0gZi5yZXBsYWNlKC9cXC8vZywnXFxcXCcpOyBpZih6aXAuZmlsZXNbZl0pIHJldHVybiB6aXAuZmlsZXNbZl07XG5cdHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIGZpbGUgXCIgKyBmaWxlICsgXCIgaW4gemlwXCIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVppcCh6aXApIHtcblx0dmFyIGVudHJpZXMgPSBPYmplY3Qua2V5cyh6aXAuZmlsZXMpO1xuXHR2YXIga2V5cyA9IGVudHJpZXMuZmlsdGVyKGZ1bmN0aW9uKHgpe3JldHVybiB4LnN1YnN0cigtMSkgIT0gJy8nO30pLnNvcnQoKTtcblx0dmFyIGRpciA9IHBhcnNlQ1QoZ2V0ZGF0YShnZXR6aXBmaWxlKHppcCwgJ1tDb250ZW50X1R5cGVzXS54bWwnKSkpO1xuXHRpZihkaXIud29ya2Jvb2tzLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgd29ya2Jvb2sgZW50cnlcIik7XG5cdHN0cnMgPSB7fTtcblx0aWYoZGlyLnNzdCkgc3Rycz1wYXJzZV9zc3QoZ2V0ZGF0YShnZXR6aXBmaWxlKHppcCwgZGlyLnNzdC5yZXBsYWNlKC9eXFwvLywnJykpKSk7XG5cblx0c3R5bGVzID0ge307XG5cdGlmKGRpci5zdHlsZSkgc3R5bGVzID0gcGFyc2VTdHlsZXMoZ2V0ZGF0YShnZXR6aXBmaWxlKHppcCwgZGlyLnN0eWxlLnJlcGxhY2UoL15cXC8vLCcnKSkpKTtcblxuXHR2YXIgd2IgPSBwYXJzZVdCKGdldGRhdGEoZ2V0emlwZmlsZSh6aXAsIGRpci53b3JrYm9va3NbMF0ucmVwbGFjZSgvXlxcLy8sJycpKSkpO1xuXHR2YXIgcHJvcGRhdGEgPSBkaXIuY29yZXByb3BzLmxlbmd0aCAhPT0gMCA/IGdldGRhdGEoZ2V0emlwZmlsZSh6aXAsIGRpci5jb3JlcHJvcHNbMF0ucmVwbGFjZSgvXlxcLy8sJycpKSkgOiBcIlwiO1xuXHRwcm9wZGF0YSArPSBkaXIuZXh0cHJvcHMubGVuZ3RoICE9PSAwID8gZ2V0ZGF0YShnZXR6aXBmaWxlKHppcCwgZGlyLmV4dHByb3BzWzBdLnJlcGxhY2UoL15cXC8vLCcnKSkpIDogXCJcIjtcblx0dmFyIHByb3BzID0gcHJvcGRhdGEgIT09IFwiXCIgPyBwYXJzZVByb3BzKHByb3BkYXRhKSA6IHt9O1xuXHR2YXIgZGVwcyA9IHt9O1xuXHRpZihkaXIuY2FsY2NoYWluKSBkZXBzPXBhcnNlRGVwcyhnZXRkYXRhKGdldHppcGZpbGUoemlwLCBkaXIuY2FsY2NoYWluLnJlcGxhY2UoL15cXC8vLCcnKSkpKTtcblx0dmFyIHNoZWV0cyA9IHt9LCBpPTA7XG5cdGlmKCFwcm9wcy5Xb3Jrc2hlZXRzKSB7XG5cdFx0LyogR29vZ2xlIERvY3MgZG9lc24ndCBnZW5lcmF0ZSB0aGUgYXBwcm9wcmlhdGUgbWV0YWRhdGEsIHNvIHdlIGltcHV0ZTogKi9cblx0XHR2YXIgd2JzaGVldHMgPSB3Yi5TaGVldHM7XG5cdFx0cHJvcHMuV29ya3NoZWV0cyA9IHdic2hlZXRzLmxlbmd0aDtcblx0XHRwcm9wcy5TaGVldE5hbWVzID0gW107XG5cdFx0Zm9yKHZhciBqID0gMDsgaiAhPSB3YnNoZWV0cy5sZW5ndGg7ICsraikge1xuXHRcdFx0cHJvcHMuU2hlZXROYW1lc1tqXSA9IHdic2hlZXRzW2pdLm5hbWU7XG5cdFx0fVxuXHRcdGZvcihpID0gMDsgaSAhPSBwcm9wcy5Xb3Jrc2hlZXRzOyArK2kpIHtcblx0XHRcdHRyeSB7IC8qIFRPRE86IHJlbW92ZSB0aGVzZSBndWFyZHMgKi8gXG5cdFx0XHRzaGVldHNbcHJvcHMuU2hlZXROYW1lc1tpXV09cGFyc2VTaGVldChnZXRkYXRhKGdldHppcGZpbGUoemlwLCAneGwvd29ya3NoZWV0cy9zaGVldCcgKyAoaSsxKSArICcueG1sJykpKTtcblx0XHRcdH0gY2F0Y2goZSkge31cblx0XHR9XG5cdH1cblx0ZWxzZSB7XG5cdFx0Zm9yKGkgPSAwOyBpICE9IHByb3BzLldvcmtzaGVldHM7ICsraSkge1xuXHRcdFx0dHJ5IHsgXG5cdFx0XHRzaGVldHNbcHJvcHMuU2hlZXROYW1lc1tpXV09cGFyc2VTaGVldChnZXRkYXRhKGdldHppcGZpbGUoemlwLCBkaXIuc2hlZXRzW2ldLnJlcGxhY2UoL15cXC8vLCcnKSkpKTtcblx0XHRcdH0gY2F0Y2goZSkge31cblx0XHR9XG5cdH1cblx0cmV0dXJuIHtcblx0XHREaXJlY3Rvcnk6IGRpcixcblx0XHRXb3JrYm9vazogd2IsXG5cdFx0UHJvcHM6IHByb3BzLFxuXHRcdERlcHM6IGRlcHMsXG5cdFx0U2hlZXRzOiBzaGVldHMsXG5cdFx0U2hlZXROYW1lczogcHJvcHMuU2hlZXROYW1lcyxcblx0XHRTdHJpbmdzOiBzdHJzLFxuXHRcdFN0eWxlczogc3R5bGVzLFxuXHRcdGtleXM6IGtleXMsXG5cdFx0ZmlsZXM6IHppcC5maWxlc1xuXHR9O1xufVxuXG52YXIgX2ZzLCBqc3ppcDtcbmlmKHR5cGVvZiBKU1ppcCAhPT0gJ3VuZGVmaW5lZCcpIGpzemlwID0gSlNaaXA7XG5pZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG5cdGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuXHRcdGlmKHR5cGVvZiBqc3ppcCA9PT0gJ3VuZGVmaW5lZCcpIGpzemlwID0gcmVxdWlyZSgnLi9qc3ppcCcpLkpTWmlwO1xuXHRcdF9mcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZFN5bmMoZGF0YSwgb3B0aW9ucykge1xuXHR2YXIgemlwLCBkID0gZGF0YTtcblx0dmFyIG8gPSBvcHRpb25zfHx7fTtcblx0c3dpdGNoKChvLnR5cGV8fFwiYmFzZTY0XCIpKXtcblx0XHRjYXNlIFwiZmlsZVwiOiBkID0gX2ZzLnJlYWRGaWxlU3luYyhkYXRhKS50b1N0cmluZygnYmFzZTY0Jyk7XG5cdFx0XHQvKiBmYWxscyB0aHJvdWdoICovXG5cdFx0Y2FzZSBcImJhc2U2NFwiOiB6aXAgPSBuZXcganN6aXAoZCwgeyBiYXNlNjQ6dHJ1ZSB9KTsgYnJlYWs7XG5cdFx0Y2FzZSBcImJpbmFyeVwiOiB6aXAgPSBuZXcganN6aXAoZCwgeyBiYXNlNjQ6ZmFsc2UgfSk7IGJyZWFrO1xuXHR9XG5cdHJldHVybiBwYXJzZVppcCh6aXApO1xufVxuXG5mdW5jdGlvbiByZWFkRmlsZVN5bmMoZGF0YSwgb3B0aW9ucykge1xuXHR2YXIgbyA9IG9wdGlvbnN8fHt9OyBvLnR5cGUgPSAnZmlsZSc7XG5cdHJldHVybiByZWFkU3luYyhkYXRhLCBvKTtcbn1cblxuWExTWC5yZWFkID0gcmVhZFN5bmM7XG5YTFNYLnJlYWRGaWxlID0gcmVhZEZpbGVTeW5jO1xuWExTWC5wYXJzZVppcCA9IHBhcnNlWmlwO1xucmV0dXJuIHRoaXM7XG5cbn0pKFhMU1gpO1xuXG52YXIgX2NociA9IGZ1bmN0aW9uKGMpIHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7IH07XG5cbmZ1bmN0aW9uIGVuY29kZV9jb2woY29sKSB7IHZhciBzPVwiXCI7IGZvcigrK2NvbDsgY29sOyBjb2w9TWF0aC5mbG9vcigoY29sLTEpLzI2KSkgcyA9IF9jaHIoKChjb2wtMSklMjYpICsgNjUpICsgczsgcmV0dXJuIHM7IH1cbmZ1bmN0aW9uIGVuY29kZV9yb3cocm93KSB7IHJldHVybiBcIlwiICsgKHJvdyArIDEpOyB9XG5mdW5jdGlvbiBlbmNvZGVfY2VsbChjZWxsKSB7IHJldHVybiBlbmNvZGVfY29sKGNlbGwuYykgKyBlbmNvZGVfcm93KGNlbGwucik7IH1cblxuZnVuY3Rpb24gZGVjb2RlX2NvbChjKSB7IHZhciBkID0gMCwgaSA9IDA7IGZvcig7IGkgIT09IGMubGVuZ3RoOyArK2kpIGQgPSAyNipkICsgYy5jaGFyQ29kZUF0KGkpIC0gNjQ7IHJldHVybiBkIC0gMTsgfVxuZnVuY3Rpb24gZGVjb2RlX3Jvdyhyb3dzdHIpIHsgcmV0dXJuIE51bWJlcihyb3dzdHIpIC0gMTsgfVxuZnVuY3Rpb24gc3BsaXRfY2VsbChjc3RyKSB7IHJldHVybiBjc3RyLnJlcGxhY2UoLyhcXCQ/W0EtWl0qKShcXCQ/WzAtOV0qKS8sXCIkMSwkMlwiKS5zcGxpdChcIixcIik7IH1cbmZ1bmN0aW9uIGRlY29kZV9jZWxsKGNzdHIpIHsgdmFyIHNwbHQgPSBzcGxpdF9jZWxsKGNzdHIpOyByZXR1cm4geyBjOmRlY29kZV9jb2woc3BsdFswXSksIHI6ZGVjb2RlX3JvdyhzcGx0WzFdKSB9OyB9XG5mdW5jdGlvbiBkZWNvZGVfcmFuZ2UocmFuZ2UpIHsgdmFyIHggPXJhbmdlLnNwbGl0KFwiOlwiKS5tYXAoZGVjb2RlX2NlbGwpOyByZXR1cm4ge3M6eFswXSxlOnhbeC5sZW5ndGgtMV19OyB9XG5mdW5jdGlvbiBlbmNvZGVfcmFuZ2UocmFuZ2UpIHsgcmV0dXJuIGVuY29kZV9jZWxsKHJhbmdlLnMpICsgXCI6XCIgKyBlbmNvZGVfY2VsbChyYW5nZS5lKTsgfVxuLyoqXG4gKiBDb252ZXJ0IGEgc2hlZXQgaW50byBhbiBhcnJheSBvZiBvYmplY3RzIHdoZXJlIHRoZSBjb2x1bW4gaGVhZGVycyBhcmUga2V5cy5cbiAqKi9cbmZ1bmN0aW9uIHNoZWV0X3RvX3Jvd19vYmplY3RfYXJyYXkoc2hlZXQpe1xuXHR2YXIgdmFsLCByb3dPYmplY3QsIHJhbmdlLCBjb2x1bW5IZWFkZXJzLCBlbXB0eVJvdywgQztcblx0dmFyIG91dFNoZWV0ID0gW107XG5cdGlmIChzaGVldFtcIiFyZWZcIl0pIHtcblx0XHRyYW5nZSA9IGRlY29kZV9yYW5nZShzaGVldFtcIiFyZWZcIl0pO1xuXG5cdFx0Y29sdW1uSGVhZGVycyA9IHt9O1xuXHRcdGZvciAoQyA9IHJhbmdlLnMuYzsgQyA8PSByYW5nZS5lLmM7ICsrQykge1xuXHRcdFx0dmFsID0gc2hlZXRbZW5jb2RlX2NlbGwoe1xuXHRcdFx0XHRjOiBDLFxuXHRcdFx0XHRyOiByYW5nZS5zLnJcblx0XHRcdH0pXTtcblx0XHRcdGlmKHZhbCl7XG5cdFx0XHRcdHN3aXRjaCh2YWwudCkge1xuXHRcdFx0XHRcdGNhc2UgJ3MnOiBjYXNlICdzdHInOiBjb2x1bW5IZWFkZXJzW0NdID0gdmFsLnY7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ24nOiBjb2x1bW5IZWFkZXJzW0NdID0gdmFsLnY7IGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yICh2YXIgUiA9IHJhbmdlLnMuciArIDE7IFIgPD0gcmFuZ2UuZS5yOyArK1IpIHtcblx0XHRcdGVtcHR5Um93ID0gdHJ1ZTtcblx0XHRcdC8vUm93IG51bWJlciBpcyByZWNvcmRlZCBpbiB0aGUgcHJvdG90eXBlXG5cdFx0XHQvL3NvIHRoYXQgaXQgZG9lc24ndCBhcHBlYXIgd2hlbiBzdHJpbmdpZmllZC5cblx0XHRcdHJvd09iamVjdCA9IE9iamVjdC5jcmVhdGUoeyBfX3Jvd051bV9fIDogUiB9KTtcblx0XHRcdGZvciAoQyA9IHJhbmdlLnMuYzsgQyA8PSByYW5nZS5lLmM7ICsrQykge1xuXHRcdFx0XHR2YWwgPSBzaGVldFtlbmNvZGVfY2VsbCh7XG5cdFx0XHRcdFx0YzogQyxcblx0XHRcdFx0XHRyOiBSXG5cdFx0XHRcdH0pXTtcblx0XHRcdFx0aWYodmFsICE9PSB1bmRlZmluZWQpIHN3aXRjaCh2YWwudCl7XG5cdFx0XHRcdFx0Y2FzZSAncyc6IGNhc2UgJ3N0cic6IGNhc2UgJ2InOiBjYXNlICduJzpcblx0XHRcdFx0XHRcdGlmKHZhbC52ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0cm93T2JqZWN0W2NvbHVtbkhlYWRlcnNbQ11dID0gdmFsLnY7XG5cdFx0XHRcdFx0XHRcdGVtcHR5Um93ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdlJzogYnJlYWs7IC8qIHRocm93ICovXG5cdFx0XHRcdFx0ZGVmYXVsdDogdGhyb3cgJ3VucmVjb2duaXplZCB0eXBlICcgKyB2YWwudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYoIWVtcHR5Um93KSB7XG5cdFx0XHRcdG91dFNoZWV0LnB1c2gocm93T2JqZWN0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dFNoZWV0O1xufVxuXG5mdW5jdGlvbiBzaGVldF90b19jc3Yoc2hlZXQpIHtcblx0dmFyIHN0cmluZ2lmeSA9IGZ1bmN0aW9uIHN0cmluZ2lmeSh2YWwpIHtcblx0XHRzd2l0Y2godmFsLnQpe1xuXHRcdFx0Y2FzZSAnbic6IHJldHVybiBTdHJpbmcodmFsLnYpO1xuXHRcdFx0Y2FzZSAncyc6IGNhc2UgJ3N0cic6XG5cdFx0XHRcdGlmKHR5cGVvZiB2YWwudiA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybiBcIlwiO1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsLnYpO1xuXHRcdFx0Y2FzZSAnYic6IHJldHVybiB2YWwudiA/IFwiVFJVRVwiIDogXCJGQUxTRVwiO1xuXHRcdFx0Y2FzZSAnZSc6IHJldHVybiBcIlwiOyAvKiB0aHJvdyBvdXQgdmFsdWUgaW4gY2FzZSBvZiBlcnJvciAqL1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgJ3VucmVjb2duaXplZCB0eXBlICcgKyB2YWwudDtcblx0XHR9XG5cdH07XG5cdHZhciBvdXQgPSBcIlwiO1xuXHRpZihzaGVldFtcIiFyZWZcIl0pIHtcblx0XHR2YXIgciA9IFhMU1gudXRpbHMuZGVjb2RlX3JhbmdlKHNoZWV0W1wiIXJlZlwiXSk7XG5cdFx0Zm9yKHZhciBSID0gci5zLnI7IFIgPD0gci5lLnI7ICsrUikge1xuXHRcdFx0dmFyIHJvdyA9IFtdO1xuXHRcdFx0Zm9yKHZhciBDID0gci5zLmM7IEMgPD0gci5lLmM7ICsrQykge1xuXHRcdFx0XHR2YXIgdmFsID0gc2hlZXRbWExTWC51dGlscy5lbmNvZGVfY2VsbCh7YzpDLHI6Un0pXTtcblx0XHRcdFx0cm93LnB1c2godmFsID8gc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvXFxcXHJcXFxcbi9nLFwiXFxuXCIpLnJlcGxhY2UoL1xcXFx0L2csXCJcXHRcIikucmVwbGFjZSgvXFxcXFxcXFwvZyxcIlxcXFxcIikucmVwbGFjZShcIlxcXFxcXFwiXCIsXCJcXFwiXFxcIlwiKSA6IFwiXCIpO1xuXHRcdFx0fVxuXHRcdFx0b3V0ICs9IHJvdy5qb2luKFwiLFwiKSArIFwiXFxuXCI7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBvdXQ7XG59XG52YXIgbWFrZV9jc3YgPSBzaGVldF90b19jc3Y7XG5cbmZ1bmN0aW9uIGdldF9mb3JtdWxhZSh3cykge1xuXHR2YXIgY21kcyA9IFtdO1xuXHRmb3IodmFyIHkgaW4gd3MpIGlmKHlbMF0gIT09JyEnICYmIHdzLmhhc093blByb3BlcnR5KHkpKSB7XG5cdFx0dmFyIHggPSB3c1t5XTtcblx0XHR2YXIgdmFsID0gXCJcIjtcblx0XHRpZih4LmYpIHZhbCA9IHguZjtcblx0XHRlbHNlIGlmKHR5cGVvZiB4LnYgPT09ICdudW1iZXInKSB2YWwgPSB4LnY7XG5cdFx0ZWxzZSB2YWwgPSB4LnY7XG5cdFx0Y21kcy5wdXNoKHkgKyBcIj1cIiArIHZhbCk7XG5cdH1cblx0cmV0dXJuIGNtZHM7XG59XG5cblhMU1gudXRpbHMgPSB7XG5cdGVuY29kZV9jb2w6IGVuY29kZV9jb2wsXG5cdGVuY29kZV9yb3c6IGVuY29kZV9yb3csXG5cdGVuY29kZV9jZWxsOiBlbmNvZGVfY2VsbCxcblx0ZW5jb2RlX3JhbmdlOiBlbmNvZGVfcmFuZ2UsXG5cdGRlY29kZV9jb2w6IGRlY29kZV9jb2wsXG5cdGRlY29kZV9yb3c6IGRlY29kZV9yb3csXG5cdHNwbGl0X2NlbGw6IHNwbGl0X2NlbGwsXG5cdGRlY29kZV9jZWxsOiBkZWNvZGVfY2VsbCxcblx0ZGVjb2RlX3JhbmdlOiBkZWNvZGVfcmFuZ2UsXG5cdHNoZWV0X3RvX2Nzdjogc2hlZXRfdG9fY3N2LFxuXHRtYWtlX2Nzdjogc2hlZXRfdG9fY3N2LFxuXHRnZXRfZm9ybXVsYWU6IGdldF9mb3JtdWxhZSxcblx0c2hlZXRfdG9fcm93X29iamVjdF9hcnJheTogc2hlZXRfdG9fcm93X29iamVjdF9hcnJheVxufTtcblxuaWYodHlwZW9mIHJlcXVpcmUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuXHRleHBvcnRzLnJlYWQgPSBYTFNYLnJlYWQ7XG5cdGV4cG9ydHMucmVhZEZpbGUgPSBYTFNYLnJlYWRGaWxlO1xuXHRleHBvcnRzLnV0aWxzID0gWExTWC51dGlscztcblx0ZXhwb3J0cy5tYWluID0gZnVuY3Rpb24oYXJncykge1xuXHRcdHZhciB6aXAgPSBYTFNYLnJlYWQoYXJnc1swXSwge3R5cGU6J2ZpbGUnfSk7XG5cdFx0Y29uc29sZS5sb2coemlwLlNoZWV0cyk7XG5cdH07XG5pZih0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiByZXF1aXJlLm1haW4gPT09IG1vZHVsZSlcblx0ZXhwb3J0cy5tYWluKHByb2Nlc3MuYXJndi5zbGljZSgyKSk7XG59Il19
