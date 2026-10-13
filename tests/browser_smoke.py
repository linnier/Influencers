"""Optional full browser check: Python Playwright + Chromium; uses an isolated database."""
from pathlib import Path
import json
import os
import re
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="influencers-browser-") as directory:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    env = dict(os.environ, INFLUENCERS_DB_PATH=f"{directory}/test.sqlite", NEXT_TELEMETRY_DISABLED="1")
    with open(f"{directory}/server.log", "w+") as log:
        server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(port)], cwd=ROOT, env=env, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(origin + "/api/workspace") as response:
                        assert json.load(response)["influencers"] == []
                    break
                except OSError:
                    if server.poll() is not None:
                        raise RuntimeError("Test server exited")
                    time.sleep(0.1)
            else:
                raise RuntimeError("Test server not ready")
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(origin)
                expect(page.get_by_role("heading", name="还没有达人档案")).to_be_visible()
                page.get_by_role("button", name="添加达人", exact=True).click()
                dialog = page.get_by_role("dialog")
                dialog.get_by_label("达人名称 *", exact=True).fill("林小夏")
                dialog.get_by_label("平台账号", exact=True).fill("xiaoxia")
                dialog.get_by_label("粉丝数量", exact=True).fill("128000")
                dialog.get_by_label("互动率（%）", exact=True).fill("5.8")
                dialog.get_by_label("单次合作报价（元）", exact=True).fill("6800")
                dialog.get_by_label("联系方式", exact=True).fill("test@example.test")
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(page.locator(".person-cell").filter(has_text="林小夏")).to_be_visible()
                page.locator("nav button").filter(has_text="达人资源库").click()
                page.get_by_role("textbox", name="搜索", exact=True).fill("不存在的达人")
                expect(page.get_by_role("heading", name="没有匹配的达人")).to_be_visible()
                page.get_by_role("button", name="清空搜索").click()
                page.get_by_role("button", name="编辑 林小夏", exact=True).click()
                dialog.get_by_label("合作状态 *", exact=True).select_option("沟通中")
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                with page.expect_download() as event:
                    page.get_by_role("button", name="导出 CSV").click()
                download = event.value
                export_path = Path(directory) / "export.csv"
                download.save_as(export_path)
                assert "林小夏" in export_path.read_text(encoding="utf-8-sig")
                print("PASS: influencer add/edit/search and CSV download")

                page.locator("nav button").filter(has_text="合作项目").click()
                page.get_by_role("button", name="新建项目", exact=True).click()
                dialog.get_by_label("项目名称 *", exact=True).fill("秋日新品合作")
                dialog.get_by_label("合作品牌 *", exact=True).fill("测试品牌")
                dialog.get_by_label("预算（元）", exact=True).fill("20000")
                dialog.get_by_label("项目状态 *", exact=True).select_option("执行中")
                dialog.get_by_role("checkbox", name=re.compile("林小夏")).check()
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(page.get_by_text("1 位合作达人", exact=True)).to_be_visible()
                page.get_by_role("button", name="管理项目").click()
                dialog.get_by_label("预算（元）", exact=True).fill("25000")
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(page.locator(".project-budget").get_by_text("¥25,000")).to_be_visible()
                print("PASS: project creation, membership and editing")

                page.locator("nav button").filter(has_text="跟进记录").click()
                page.get_by_role("button", name="添加跟进", exact=True).click()
                dialog.get_by_label("跟进达人 *", exact=True).select_option(label="林小夏 · 小红书")
                dialog.get_by_label("沟通内容 *", exact=True).fill("已确认合作方向，等待档期。")
                # A due reminder should update after a new followup clears nextDate.
                recorded = dialog.get_by_label("跟进日期 *", exact=True).input_value()
                dialog.get_by_label(re.compile("^下次跟进日期")).fill(recorded)
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(page.get_by_text("已确认合作方向，等待档期。", exact=True)).to_be_visible()
                page.locator("nav button").filter(has_text="工作概览").click()
                expect(page.locator(".due-item")).to_have_count(1)
                page.locator(".due-item").click()
                dialog.get_by_label("沟通内容 *", exact=True).fill("本次沟通完成，无待办。")
                dialog.get_by_role("button", name="保存", exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(page.get_by_role("heading", name="暂时没有到期跟进")).to_be_visible()
                print("PASS: followup recording and latest-record reminder")

                page.locator("nav button").filter(has_text="达人资源库").click()
                page.locator(".person-cell").click()
                expect(dialog.get_by_text("test@example.test", exact=True)).to_be_visible()
                dialog.get_by_role("button", name="删除档案").click()
                dialog.get_by_role("button", name="确认删除").click()
                expect(dialog).not_to_be_visible()
                page.locator("nav button").filter(has_text="跟进记录").click()
                expect(page.get_by_role("heading", name="让每次沟通都有记录")).to_be_visible()
                page.locator("nav button").filter(has_text="合作项目").click()
                expect(page.get_by_text("尚未关联达人", exact=True)).to_be_visible()
                page.get_by_role("button", name="删除项目 秋日新品合作").click()
                dialog.get_by_role("button", name="确认删除").click()
                expect(dialog).not_to_be_visible()
                page.locator("nav button").filter(has_text="工作概览").click()
                page.get_by_role("button", name=re.compile("体验演示数据")).click()
                expect(page.locator(".person-cell")).to_have_count(5)
                page.screenshot(path="/tmp/influencers-desktop.png", full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                page.screenshot(path="/tmp/influencers-mobile.png", full_page=True)
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth&&!e.closest('.table-scroll')).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})).slice(0,20)})")
                page.locator("nav button").filter(has_text="达人资源库").click()
                expect(page.get_by_role("heading", name="达人资源库.")).to_be_visible()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print("PASS: delete cascade, demo opt-in, mobile layout and no browser runtime errors")
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
