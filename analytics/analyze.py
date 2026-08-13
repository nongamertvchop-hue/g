#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
เรือนอักษร — เครื่องมือวิเคราะห์พฤติกรรมผู้ใช้
=================================================
ดึงบันทึกเหตุการณ์จากเว็บ แล้ววิเคราะห์ว่า "ใคร ทำอะไร ที่ไหน อย่างไร เมื่อไหร่"

ใช้เฉพาะไลบรารีมาตรฐานของ Python จึงรันได้ทันทีโดยไม่ต้องติดตั้งอะไรเพิ่ม

วิธีใช้:
    python analyze.py --user redmiss098 --password 99
    python analyze.py --user redmiss098 --password 99 --days 7 --json report.json
"""

import argparse
import getpass
import json
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

BASE_URL = "https://g.nongamertvchop.workers.dev"

# ชื่อการกระทำเป็นภาษาไทย ให้อ่านรายงานได้เข้าใจง่าย
ACTION_TH = {
    "login": "เข้าสู่ระบบ", "logout": "ออกจากระบบ", "register": "สมัครสมาชิก",
    "posts": "สร้างโพสต์", "posts/update": "แก้ไขโพสต์", "posts/delete": "ลบโพสต์",
    "posts/like": "กดถูกใจ", "posts/share": "แชร์โพสต์",
    "comments": "คอมเมนต์", "comments/delete": "ลบคอมเมนต์",
    "novels/create": "สร้างนิยาย", "novels/delete": "ลบนิยาย",
    "chapters/create": "ลงตอนใหม่", "novels/follow": "ติดตามนิยาย", "read": "อ่านนิยาย",
    "global": "แชทโลก", "messages": "ข้อความส่วนตัว", "friends/add": "เพิ่มเพื่อน",
    "alias": "เปลี่ยนนามแฝง", "avatar": "เปลี่ยนรูปโปรไฟล์",
    "media/upload": "อัปโหลดไฟล์", "aria": "คุยกับอาเรีย",
    "notifications/announce": "ส่งประกาศ",
}


# ---------------------------------------------------------------- HTTP layer
def call(path, token=None, method="GET", payload=None, timeout=30):
    """เรียก API ของเว็บ คืนค่าเป็น dict"""
    url = BASE_URL + path
    if token and method == "GET":
        url += ("&" if "?" in url else "?") + "token=" + urllib.parse.quote(token)

    data = None
    headers = {"Accept": "application/json", "User-Agent": "ruen-aksorn-analytics/1.0"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return json.loads(body)
        except ValueError:
            raise SystemExit(f"เรียก {path} ไม่สำเร็จ (HTTP {e.code}): {body[:200]}")
    except urllib.error.URLError as e:
        raise SystemExit(f"เชื่อมต่อเว็บไม่ได้: {e.reason}")


def login(username, password):
    res = call("/api/login", method="POST", payload={"username": username, "password": password})
    if not res.get("ok"):
        raise SystemExit("เข้าสู่ระบบไม่สำเร็จ: " + str(res.get("error", "ไม่ทราบสาเหตุ")))
    return res["token"]


# ------------------------------------------------------------------ parsing
def parse_time(s):
    """แปลงเวลาจากฐานข้อมูล (UTC) เป็น datetime"""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None


def to_local(dt, offset_hours=7):
    """แปลงเป็นเวลาไทย (UTC+7)"""
    return dt.astimezone(timezone(timedelta(hours=offset_hours))) if dt else None


# ----------------------------------------------------------------- analysis
def analyse(events, days):
    """วิเคราะห์เหตุการณ์ทั้งหมด คืนผลเป็น dict"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = []
    for e in events:
        ts = parse_time(e.get("created_at"))
        if ts is None or ts < cutoff:
            continue
        e = dict(e)
        e["_ts"] = ts
        e["_local"] = to_local(ts)
        rows.append(e)

    by_action = Counter(r["action"] for r in rows)
    by_device = Counter(r.get("device") or "ไม่ทราบ" for r in rows)
    by_country = Counter(r.get("country") or "??" for r in rows)
    by_hour = Counter(r["_local"].hour for r in rows)
    by_day = Counter(r["_local"].strftime("%Y-%m-%d") for r in rows)
    failures = Counter(r["action"] for r in rows if not r.get("ok", 1))

    # กิจกรรมรายผู้ใช้
    per_user = defaultdict(list)
    for r in rows:
        if r.get("actor"):
            per_user[r["actor"]].append(r)

    users = []
    for actor, evs in per_user.items():
        evs.sort(key=lambda x: x["_ts"])
        gaps = [(b["_ts"] - a["_ts"]).total_seconds()
                for a, b in zip(evs, evs[1:])]
        # นับเป็น 1 ครั้งการใช้งาน เมื่อเว้นช่วงเกิน 30 นาที
        sessions = 1 + sum(1 for g in gaps if g > 1800)
        users.append({
            "actor": actor,
            "alias": evs[-1].get("actor_alias") or actor,
            "events": len(evs),
            "sessions": sessions,
            "first_seen": evs[0]["_local"].strftime("%d/%m/%Y %H:%M"),
            "last_seen": evs[-1]["_local"].strftime("%d/%m/%Y %H:%M"),
            "top_action": Counter(x["action"] for x in evs).most_common(1)[0][0],
            "devices": sorted({x.get("device") or "ไม่ทราบ" for x in evs}),
            "ips": sorted({x["ip"] for x in evs if x.get("ip")}),
            "failed": sum(1 for x in evs if not x.get("ok", 1)),
        })
    users.sort(key=lambda u: u["events"], reverse=True)

    # ตรวจจับสิ่งผิดปกติ
    alerts = []
    counts = [u["events"] for u in users]
    if len(counts) >= 3:
        mean = statistics.mean(counts)
        sd = statistics.pstdev(counts)
        for u in users:
            if sd > 0 and (u["events"] - mean) / sd > 2.5:
                alerts.append(f"{u['alias']} มีกิจกรรมสูงผิดปกติ ({u['events']} ครั้ง เทียบค่าเฉลี่ย {mean:.0f})")

    for u in users:
        if len(u["ips"]) >= 3:
            alerts.append(f"{u['alias']} ใช้งานจาก {len(u['ips'])} หมายเลข IP")
        if u["failed"] >= 5:
            alerts.append(f"{u['alias']} มีการกระทำล้มเหลว {u['failed']} ครั้ง")

    failed_logins = sum(1 for r in rows if r["action"] == "login" and not r.get("ok", 1))
    if failed_logins >= 5:
        alerts.append(f"พบการเข้าสู่ระบบล้มเหลว {failed_logins} ครั้ง — อาจมีคนพยายามเดารหัสผ่าน")

    return {
        "window_days": days,
        "total_events": len(rows),
        "unique_users": len(per_user),
        "by_action": by_action, "by_device": by_device, "by_country": by_country,
        "by_hour": by_hour, "by_day": by_day, "failures": failures,
        "users": users, "alerts": alerts,
        "busiest_hour": by_hour.most_common(1)[0] if by_hour else None,
    }


# -------------------------------------------------------------------- output
def bar(value, maximum, width=28):
    filled = int(round((value / maximum) * width)) if maximum else 0
    return "█" * filled + "·" * (width - filled)


def section(title):
    print("\n" + "═" * 62)
    print("  " + title)
    print("═" * 62)


def show_counter(counter, translate=None, top=10):
    if not counter:
        print("  (ไม่มีข้อมูล)")
        return
    mx = max(counter.values())
    for key, n in counter.most_common(top):
        label = translate.get(key, key) if translate else str(key)
        print(f"  {label:<22} {bar(n, mx)} {n:>5}")


def report(a, site):
    section("รายงานวิเคราะห์การใช้งาน — เรือนอักษร")
    print(f"  ช่วงเวลา       : {a['window_days']} วันล่าสุด")
    print(f"  สร้างเมื่อ      : {to_local(datetime.now(timezone.utc)).strftime('%d/%m/%Y %H:%M')} น.")
    print(f"  เหตุการณ์      : {a['total_events']:,} ครั้ง")
    print(f"  ผู้ใช้ที่มีกิจกรรม : {a['unique_users']} คน")
    if site:
        print(f"  สมาชิกทั้งหมด   : {site.get('users', 0)} · โพสต์ {site.get('posts', 0)} · นิยาย {site.get('novels', 0)}")
    if a["busiest_hour"]:
        h, n = a["busiest_hour"]
        print(f"  ช่วงคึกคักสุด   : {h:02d}:00-{h:02d}:59 น. ({n} ครั้ง)")

    section("ทำอะไรบ้าง")
    show_counter(a["by_action"], ACTION_TH, top=12)

    section("ใช้อุปกรณ์อะไร")
    show_counter(a["by_device"])

    section("มาจากที่ไหน")
    show_counter(a["by_country"])

    section("ใช้งานเวลาไหน (เวลาไทย)")
    if a["by_hour"]:
        mx = max(a["by_hour"].values())
        for h in range(24):
            n = a["by_hour"].get(h, 0)
            print(f"  {h:02d}:00  {bar(n, mx, 34)} {n:>4}")
    else:
        print("  (ไม่มีข้อมูล)")

    section("กิจกรรมรายวัน")
    if a["by_day"]:
        mx = max(a["by_day"].values())
        for day in sorted(a["by_day"]):
            n = a["by_day"][day]
            print(f"  {day}  {bar(n, mx)} {n:>4}")
    else:
        print("  (ไม่มีข้อมูล)")

    section("ใครทำอะไรบ้าง")
    if not a["users"]:
        print("  (ไม่มีข้อมูล)")
    for u in a["users"][:15]:
        print(f"\n  ▸ {u['alias']}  (ชื่อผู้ใช้จริง: {u['actor']})")
        print(f"      กิจกรรม   : {u['events']} ครั้ง · {u['sessions']} รอบการใช้งาน")
        print(f"      ทำบ่อยสุด : {ACTION_TH.get(u['top_action'], u['top_action'])}")
        print(f"      อุปกรณ์   : {', '.join(u['devices'])}")
        print(f"      ช่วงเวลา  : {u['first_seen']} → {u['last_seen']}")
        if u["ips"]:
            print(f"      IP        : {', '.join(u['ips'][:4])}")
        if u["failed"]:
            print(f"      ล้มเหลว   : {u['failed']} ครั้ง")

    if a["failures"]:
        section("การกระทำที่ล้มเหลว")
        show_counter(a["failures"], ACTION_TH)

    section("สิ่งที่ควรตรวจสอบ")
    if a["alerts"]:
        for msg in a["alerts"]:
            print(f"  ⚠️  {msg}")
    else:
        print("  ✅ ไม่พบความผิดปกติ")
    print()


# ---------------------------------------------------------------------- main
def main():
    # ต้องประกาศ global ก่อนใช้ชื่อนี้ในฟังก์ชัน ไม่งั้น Python จะฟ้อง SyntaxError
    global BASE_URL

    ap = argparse.ArgumentParser(description="วิเคราะห์การใช้งานเว็บเรือนอักษร")
    ap.add_argument("--user", required=True, help="ชื่อผู้ใช้แอดมิน")
    ap.add_argument("--password", help="รหัสผ่าน (เว้นไว้เพื่อพิมพ์แบบซ่อน)")
    ap.add_argument("--days", type=int, default=7, help="ย้อนหลังกี่วัน (ค่าเริ่มต้น 7)")
    ap.add_argument("--limit", type=int, default=500, help="ดึงเหตุการณ์สูงสุดกี่รายการ")
    ap.add_argument("--json", help="บันทึกผลเป็นไฟล์ JSON")
    ap.add_argument("--url", default=BASE_URL, help="ที่อยู่เว็บ")
    args = ap.parse_args()
    BASE_URL = args.url.rstrip("/")

    password = args.password or getpass.getpass("รหัสผ่าน: ")

    print("กำลังเข้าสู่ระบบ...")
    token = login(args.user, password)

    print("กำลังดึงบันทึกเหตุการณ์...")
    audit = call(f"/api/admin/audit?limit={args.limit}", token=token)
    if not audit.get("ok"):
        raise SystemExit("ดึงข้อมูลไม่สำเร็จ: " + str(audit.get("error")) +
                         "\n(ต้องใช้บัญชีแอดมินเท่านั้น)")

    analytics = call("/api/admin/analytics", token=token)
    site = analytics.get("totals", {}) if analytics.get("ok") else {}

    result = analyse(audit.get("events", []), args.days)
    report(result, site)

    if args.json:
        out = {k: (dict(v) if isinstance(v, Counter) else v)
               for k, v in result.items()}
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2, default=str)
        print(f"บันทึกผลลง {args.json} แล้ว\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nยกเลิกแล้ว")
